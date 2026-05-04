"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { ChapterTree } from "@/components/chapter-tree";
import { KnowledgePointList } from "@/components/knowledge-point-list";
import { ProblemList } from "@/components/problem-list";
import type { ProblemItem } from "@/components/problem-list";
import { ExamBasket } from "@/components/exam-basket";
import type { BasketItem } from "@/components/exam-basket";
import { AuthGate } from "@/components/auth/auth-gate";

const RichTextEditor = dynamic(
  () => import("@/components/tiptap/rich-text-editor").then((mod) => mod.RichTextEditor),
  { ssr: false },
);

function extractPreviewText(json: string): string {
  try {
    const doc = JSON.parse(json);
    const texts: string[] = [];
    for (const node of doc.content || []) {
      if (node.content) {
        for (const child of node.content) {
          if (child.text) texts.push(child.text);
          if (child.type === "inlineMath") texts.push(`$${child.attrs?.text || ""}$`);
        }
      }
    }
    return texts.join(" ").substring(0, 80);
  } catch {
    return "";
  }
}

export default function HomePage() {
  // Chapter state
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [selectedChapterTitle, setSelectedChapterTitle] = useState<string | null>(null);
  const [selectedTextbookId, setSelectedTextbookId] = useState<number | null>(null);
  const [selectedTextbookName, setSelectedTextbookName] = useState<string | null>(null);

  // Knowledge point state
  const [selectedKpId, setSelectedKpId] = useState<number | null>(null);
  const [selectedKpName, setSelectedKpName] = useState<string | null>(null);

  // Problem list state
  const [problems, setProblems] = useState<ProblemItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Selected problem for editing
  const [selectedProblemId, setSelectedProblemId] = useState<number | null>(null);
  const [selectedProblem, setSelectedProblem] = useState<ProblemItem | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDifficulty, setEditDifficulty] = useState(3);
  const [editQuestionType, setEditQuestionType] = useState("");
  const [editSourceDate, setEditSourceDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit page: notes & KP management
  const [editNotes, setEditNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [kpSearchQuery, setKpSearchQuery] = useState("");
  const [kpSearchResults, setKpSearchResults] = useState<{ id: number; name: string; chapterId: number; chapter?: { id: number; title: string; textbookId: number } }[]>([]);
  const [showKpSearch, setShowKpSearch] = useState(false);
  const [addingKp, setAddingKp] = useState(false);
  const [kpError, setKpError] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [kpSearching, setKpSearching] = useState(false);
  const kpSearchRef = useRef<HTMLDivElement>(null);

  // Basket state
  const [basketItems, setBasketItems] = useState<BasketItem[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Select chapter → clear KP and problem selections
  const handleSelectChapter = useCallback((id: number, title: string) => {
    setSelectedChapterId(id);
    setSelectedChapterTitle(title);
    setSelectedKpId(null);
    setSelectedKpName(null);
    setSelectedProblemId(null);
    setSelectedProblem(null);
    setProblems([]);
  }, []);

  // Select knowledge point → load problems
  const handleSelectKnowledgePoint = useCallback((id: number, name: string) => {
    setSelectedKpId(id);
    setSelectedKpName(name);
    setSelectedProblemId(null);
    setSelectedProblem(null);
  }, []);

  useEffect(() => {
    if (!selectedKpId) {
      setProblems([]);
      return;
    }
    setLoading(true);
    fetch(`/api/problems?knowledgePointId=${selectedKpId}`)
      .then((r) => r.json())
      .then((d) => setProblems(d.data || []))
      .catch(() => setProblems([]))
      .finally(() => setLoading(false));
  }, [selectedKpId]);

  // Refresh problems after mutations (notes, KP tags)
  const refreshProblems = useCallback(() => {
    if (!selectedKpId) return;
    setLoading(true);
    fetch(`/api/problems?knowledgePointId=${selectedKpId}`)
      .then((r) => r.json())
      .then((d) => setProblems(d.data || []))
      .catch(() => setProblems([]))
      .finally(() => setLoading(false));
  }, [selectedKpId]);

  // Load full problem when selected for editing
  const handleSelectProblem = useCallback((id: number) => {
    setSelectedProblemId(id);
    const p = problems.find((x) => x.id === id) || null;
    setSelectedProblem(p);
    if (p) {
      setEditContent(p.content);
      setEditDifficulty(p.difficulty);
      setEditQuestionType(p.questionType || "");
      setEditSourceDate(p.sourceDate || "");
      setEditNotes(p.remarks || "");
      setNotesEditing(false);
      setNotesSaved(false);
      setKpSearchQuery("");
      setKpSearchResults([]);
      setShowKpSearch(false);
      setKpError(null);
      setKpSearching(false);
    }
  }, [problems]);

  // Toggle basket
  const handleToggleBasket = useCallback(
    (problem: ProblemItem) => {
      setBasketItems((prev) => {
        const exists = prev.find((x) => x.problemId === problem.id);
        if (exists) {
          return prev.filter((x) => x.problemId !== problem.id);
        }

        const kpName = problem.knowledgePoints[0]?.knowledgePoint?.name || "";
        const preview = extractPreviewText(problem.content);

        const item: BasketItem = {
          problemId: problem.id,
          order: prev.length,
          preview,
          knowledgePointName: kpName,
          chapterTitle: selectedChapterTitle || "",
          textbookName: selectedTextbookName || "",
        };
        return [...prev, item];
      });
    },
    [selectedChapterTitle, selectedTextbookName],
  );

  const basketProblemIds = new Set(basketItems.map((x) => x.problemId));

  // Basket actions
  const handleRemoveFromBasket = useCallback((problemId: number) => {
    setBasketItems((prev) => prev.filter((x) => x.problemId !== problemId));
  }, []);

  const handleClearBasket = useCallback(() => {
    setBasketItems([]);
  }, []);

  const handleMoveUp = useCallback((problemId: number) => {
    setBasketItems((prev) => {
      const idx = prev.findIndex((x) => x.problemId === problemId);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((problemId: number) => {
    setBasketItems((prev) => {
      const idx = prev.findIndex((x) => x.problemId === problemId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  // Save edited problem
  const handleSaveEdit = useCallback(async () => {
    if (!selectedProblemId) return;
    setSaving(true);
    try {
      await fetch(`/api/problems/${selectedProblemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editContent,
          difficulty: editDifficulty,
          questionType: editQuestionType || null,
          sourceDate: editSourceDate || null,
        }),
      });
      if (selectedKpId) {
        const res = await fetch(`/api/problems?knowledgePointId=${selectedKpId}`);
        const d = await res.json();
        setProblems(d.data || []);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [selectedProblemId, editContent, editDifficulty, editQuestionType, editSourceDate, selectedKpId]);

  // Delete problem
  const handleDelete = useCallback(async (id: number) => {
    try {
      await fetch(`/api/problems/${id}`, { method: "DELETE" });
      setProblems((prev) => prev.filter((p) => p.id !== id));
      setBasketItems((prev) => prev.filter((x) => x.problemId !== id));
      if (selectedProblemId === id) {
        setSelectedProblemId(null);
        setSelectedProblem(null);
      }
    } catch {
      // silent
    }
  }, [selectedProblemId]);

  // Edit page: save notes
  const handleSaveNotes = useCallback(async () => {
    if (!selectedProblemId) return;
    setSavingNotes(true);
    const res = await fetch(`/api/problems/${selectedProblemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarks: editNotes }),
    });
    if (res.ok) {
      setSelectedProblem((prev) => prev ? { ...prev, remarks: editNotes } : null);
      setProblems((prev) => prev.map((p) => p.id === selectedProblemId ? { ...p, remarks: editNotes } : p));
      setNotesEditing(false);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    }
    setSavingNotes(false);
  }, [selectedProblemId, editNotes]);

  // Edit page: search KPs
  const handleSearchKps = useCallback(async (query: string) => {
    if (!query.trim()) {
      setKpSearchResults([]);
      return;
    }
    setKpSearchResults([]);
    setKpSearching(true);
    try {
      const res = await fetch(`/api/knowledge-points?search=${encodeURIComponent(query)}`);
      const d = await res.json();
      setKpSearchResults(d.data || []);
    } finally {
      setKpSearching(false);
    }
  }, []);

  // Edit page: add KP to problem
  const handleAddKpToProblem = useCallback(async (kpId: number) => {
    const pid = selectedProblem?.id ?? selectedProblemId;
    if (!pid) return;
    setAddingKp(true);
    setKpError(null);
    try {
      const res = await fetch(`/api/problems/${pid}/knowledge-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgePointId: kpId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        setKpError(err.error || `添加失败 (${res.status})`);
        return;
      }
      // Refetch to get updated knowledgePoints
      if (selectedKpId) {
        const refreshRes = await fetch(`/api/problems?knowledgePointId=${selectedKpId}`);
        const refreshData = await refreshRes.json();
        const list = refreshData.data || [];
        setProblems(list);
        const updated = list.find((p: ProblemItem) => p.id === pid);
        if (updated) setSelectedProblem(updated);
      }
      setKpSearchQuery("");
      setKpSearchResults([]);
      setShowKpSearch(false);
    } catch (e) {
      setKpError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setAddingKp(false);
    }
  }, [selectedProblem, selectedProblemId, selectedKpId]);

  // Edit page: create new KP and add to problem in one step
  const handleCreateAndAddKp = useCallback(async () => {
    const pid = selectedProblem?.id ?? selectedProblemId;
    if (!pid || !kpSearchQuery.trim() || !selectedChapterId) return;
    setAddingKp(true);
    setKpError(null);
    try {
      // 1. Create the KP
      const createRes = await fetch("/api/knowledge-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: selectedChapterId, name: kpSearchQuery.trim() }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({ error: "创建失败" }));
        setKpError(err.error || "创建知识点失败");
        return;
      }
      const createData = await createRes.json();
      const newKpId = createData.data.id;
      // 2. Add it to the problem
      const addRes = await fetch(`/api/problems/${pid}/knowledge-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgePointId: newKpId }),
      });
      if (!addRes.ok) {
        setKpError("添加失败");
        return;
      }
      // 3. Refetch to update state
      if (selectedKpId) {
        const refreshRes = await fetch(`/api/problems?knowledgePointId=${selectedKpId}`);
        const refreshData = await refreshRes.json();
        const list = refreshData.data || [];
        setProblems(list);
        const updated = list.find((p: ProblemItem) => p.id === pid);
        if (updated) setSelectedProblem(updated);
      }
      setKpSearchQuery("");
      setKpSearchResults([]);
      setShowKpSearch(false);
    } catch (e) {
      setKpError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setAddingKp(false);
    }
  }, [selectedProblem, selectedProblemId, selectedChapterId, selectedKpId, kpSearchQuery]);

  // Edit page: remove KP from problem
  const handleRemoveKpFromProblem = useCallback(async (kpId: number) => {
    const pid = selectedProblem?.id ?? selectedProblemId;
    if (!pid) return;
    setKpError(null);
    const res = await fetch(`/api/problems/${pid}/knowledge-points/${kpId}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || !res.ok) return;
    if (selectedKpId) {
      const refreshRes = await fetch(`/api/problems?knowledgePointId=${selectedKpId}`);
      const refreshData = await refreshRes.json();
      const list = refreshData.data || [];
      setProblems(list);
      const updated = list.find((p: ProblemItem) => p.id === pid);
      if (updated) setSelectedProblem(updated);
      else {
        setSelectedProblem(null);
        setSelectedProblemId(null);
      }
    }
  }, [selectedProblem, selectedProblemId, selectedKpId]);

  // Close KP search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (kpSearchRef.current && !kpSearchRef.current.contains(e.target as Node)) {
        setShowKpSearch(false);
        setKpSearchQuery("");
        setKpSearchResults([]);
        setKpSearching(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Export Word (Step 5)
  const handleExport = useCallback(async () => {
    if (basketItems.length === 0) return;
    setExporting(true);
    try {
      const { exportProblemsToDocx } = await import("@/lib/export-docx");
      await exportProblemsToDocx(problems, basketItems);
    } catch (e) {
      console.error("Export failed:", e);
      alert("导出失败，请重试");
    } finally {
      setExporting(false);
    }
  }, [basketItems, problems]);

  const QUESTION_TYPES = ["单选", "多选", "实验", "计算"];

  return (
    <AuthGate>
    <div className="h-[calc(100vh-40px)] flex flex-col bg-gray-100 pb-10">
      {/* Main 3-column area */}
      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Left: Chapter tree */}
        <div className="w-60 flex-shrink-0 p-2">
          <ChapterTree
            selectedChapterId={selectedChapterId}
            onSelectChapter={handleSelectChapter}
            onTextbookChange={(id, name) => { setSelectedTextbookId(id); setSelectedTextbookName(name); }}
          />
        </div>

        {/* Middle: Knowledge point list */}
        <div className="w-64 flex-shrink-0 p-2 pl-0">
          <KnowledgePointList
            chapterId={selectedChapterId}
            chapterTitle={selectedChapterTitle}
            selectedKpId={selectedKpId}
            onSelectKnowledgePoint={handleSelectKnowledgePoint}
          />
        </div>

        {/* Right: Problem list or Editor */}
        <div className="flex-1 p-2 pl-0 min-h-0">
          {(() => {
            // State 3: Problem selected for editing (takes priority)
            if (selectedProblem) {
              return (
                <div className="space-y-4 overflow-y-auto h-full">
                  {/* Back button */}
                  <button
                    onClick={() => {
                      setSelectedProblemId(null);
                      setSelectedProblem(null);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    ← 返回题目列表
                  </button>

                  {/* Editor */}
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <RichTextEditor
                      content={editContent}
                      editable={true}
                      onChange={(html, json) => setEditContent(JSON.stringify(json))}
                    />
                  </div>

                  {/* Metadata editor */}
                  <div className="bg-white border rounded-lg p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700">题目信息</h4>

                    {/* Knowledge points — editable */}
                    <div>
                      <div className="text-xs text-gray-400 mb-1">知识点：</div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {selectedProblem.knowledgePoints.map((kp) => (
                          <span
                            key={kp.knowledgePoint.id}
                            className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded inline-flex items-center gap-1 group"
                          >
                            {kp.knowledgePoint.name}
                            <button
                              onClick={() => handleRemoveKpFromProblem(kp.knowledgePoint.id)}
                              className="text-blue-400 hover:text-red-500 leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                              title="移除此标签"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {!showKpSearch && (
                          <button
                            onClick={() => setShowKpSearch(true)}
                            className="text-xs px-2 py-0.5 text-blue-500 hover:bg-blue-50 rounded border border-dashed border-blue-300 transition-colors"
                          >
                            + 添加标签
                          </button>
                        )}
                      </div>
                      {showKpSearch && (
                        <div ref={kpSearchRef}>
                          <div className="flex gap-1 mb-1">
                            <input
                              type="text"
                              value={kpSearchQuery}
                              onChange={(e) => setKpSearchQuery(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSearchKps(kpSearchQuery); }}
                              placeholder="搜索知识点..."
                              className="flex-1 border rounded px-2 py-1 text-xs"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSearchKps(kpSearchQuery)}
                              className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                            >
                              搜索
                            </button>
                          </div>
                          {kpSearchResults.length > 0 && (
                            <div className="border rounded max-h-32 overflow-y-auto">
                              {kpSearchResults.map((kp) => {
                                const alreadyAdded = selectedProblem.knowledgePoints.some(
                                  (pkp) => pkp.knowledgePoint.id === kp.id
                                );
                                return (
                                  <button
                                    key={kp.id}
                                    onClick={() => handleAddKpToProblem(kp.id)}
                                    disabled={alreadyAdded || addingKp}
                                    className={`w-full text-left px-2 py-1 text-xs border-b last:border-b-0 transition-colors ${
                                      alreadyAdded
                                        ? "text-gray-300 cursor-not-allowed bg-gray-50"
                                        : "hover:bg-blue-50 text-gray-700"
                                    }`}
                                  >
                                    {kp.name}
                                    {kp.chapter && (
                                      <span className="text-gray-400 ml-1">— {kp.chapter.title}</span>
                                    )}
                                    {alreadyAdded && <span className="text-gray-300 ml-1">已添加</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {kpSearchResults.length === 0 && !kpSearching && kpSearchQuery.trim() && !addingKp && selectedChapterId && (
                            <button
                              onClick={handleCreateAndAddKp}
                              className="mt-1 w-full text-left px-2 py-1 text-xs text-green-600 hover:bg-green-50 border border-dashed border-green-300 rounded transition-colors"
                            >
                              + 创建知识点「{kpSearchQuery.trim()}」
                            </button>
                          )}
                          {kpError && (
                            <div className="mt-1 text-xs text-red-500">{kpError}</div>
                          )}
                          {addingKp && (
                            <div className="mt-1 text-xs text-gray-400">添加中...</div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <label className="text-xs text-gray-500">
                        来源日期
                        <input
                          type="date"
                          value={editSourceDate}
                          onChange={(e) => setEditSourceDate(e.target.value)}
                          className="mt-1 w-full border rounded px-2 py-1 text-xs"
                        />
                      </label>

                      <label className="text-xs text-gray-500">
                        难度
                        <select
                          value={editDifficulty}
                          onChange={(e) => setEditDifficulty(Number(e.target.value))}
                          className="mt-1 w-full border rounded px-2 py-1 text-xs"
                        >
                          {[1, 2, 3, 4, 5].map((d) => (
                            <option key={d} value={d}>{"★".repeat(d)}</option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs text-gray-500">
                        题型
                        <select
                          value={editQuestionType}
                          onChange={(e) => setEditQuestionType(e.target.value)}
                          className="mt-1 w-full border rounded px-2 py-1 text-xs"
                        >
                          <option value="">未设置</option>
                          {QUESTION_TYPES.map((qt) => (
                            <option key={qt} value={qt}>{qt}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Notes */}
                    <div>
                      <div className="text-xs text-gray-400 mb-1">备注：</div>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="暂无备注，点击下方按钮编辑..."
                        rows={3}
                        readOnly={!notesEditing}
                        className={`w-full border rounded px-2 py-1.5 text-xs resize-y transition-colors ${
                          notesEditing
                            ? "bg-white border-gray-300"
                            : "bg-gray-50 border-gray-200 cursor-default"
                        }`}
                      />
                      <div className="flex items-center gap-2 mt-1.5">
                        {notesEditing ? (
                          <button
                            onClick={handleSaveNotes}
                            disabled={savingNotes}
                            className="text-xs px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300 transition-colors"
                          >
                            {savingNotes ? "保存中..." : "保存备注"}
                          </button>
                        ) : (
                          <button
                            onClick={() => { setNotesEditing(true); setNotesSaved(false); }}
                            className="text-xs px-3 py-1 text-gray-500 border rounded hover:bg-gray-50 transition-colors"
                          >
                            编辑备注
                          </button>
                        )}
                        {notesSaved && !notesEditing && (
                          <span className="text-xs text-green-600">✓ 已保存</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2 border-t">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
                      >
                        {saving ? "保存中..." : "保存修改"}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("确定删除这道题？")) handleDelete(selectedProblem.id);
                        }}
                        className="px-4 py-1.5 text-red-500 text-sm border border-red-200 rounded hover:bg-red-50 transition-colors"
                      >
                        删除题目
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // State 2: KP selected, show problem list
            if (selectedKpId) {
              return (
                <ProblemList
                  problems={problems}
                  loading={loading}
                  selectedProblemId={selectedProblemId}
                  basketProblemIds={basketProblemIds}
                  selectedKpName={selectedKpName}
                  chapterId={selectedChapterId}
                  textbookId={selectedTextbookId}
                  selectedKpId={selectedKpId}
                  selectedChapterTitle={selectedChapterTitle}
                  onSelectProblem={handleSelectProblem}
                  onToggleBasket={handleToggleBasket}
                  onRefresh={refreshProblems}
                />
              );
            }

            // State 1: No KP selected
            return (
              <div className="bg-white border rounded-lg h-full flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-3">📚</div>
                  <p className="text-sm">
                    在中间栏点击知识点或搜索知识点来查看题目
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Bottom: Exam basket */}
      <ExamBasket
        items={basketItems}
        problemMap={new Map(problems.map((p) => [p.id, p]))}
        onRemove={handleRemoveFromBasket}
        onClear={handleClearBasket}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onExport={handleExport}
        isOpen={basketOpen}
        onToggle={() => setBasketOpen(!basketOpen)}
        exporting={exporting}
      />
    </div>
    </AuthGate>
  );
}
