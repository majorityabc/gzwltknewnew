"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { ChapterTree } from "@/components/chapter-tree";
import { KnowledgePointList } from "@/components/knowledge-point-list";
import { ProblemList } from "@/components/problem-list";
import type { ProblemItem } from "@/components/problem-list";
import { ExamBasket } from "@/components/exam-basket";
import type { BasketItem } from "@/components/exam-basket";
import { exportProblemsToDocx } from "@/lib/export-docx";
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

  // Export Word (Step 5)
  const handleExport = useCallback(async () => {
    if (basketItems.length === 0) return;
    setExporting(true);
    try {
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
            onTextbookChange={(_, name) => setSelectedTextbookName(name)}
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
                  <div className="bg-white border rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">题目信息</h4>

                    {/* Knowledge points display */}
                    <div>
                      <span className="text-xs text-gray-400">知识点：</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedProblem.knowledgePoints.map((kp) => (
                          <span
                            key={kp.knowledgePoint.id}
                            className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded"
                          >
                            {kp.knowledgePoint.name}
                          </span>
                        ))}
                      </div>
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
                  selectedKpId={selectedKpId}
                  selectedChapterTitle={selectedChapterTitle}
                  onSelectProblem={handleSelectProblem}
                  onToggleBasket={handleToggleBasket}
                  onDelete={handleDelete}
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
