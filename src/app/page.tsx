"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChapterTree } from "@/components/chapter-tree";
import { KnowledgePointList } from "@/components/knowledge-point-list";
import { ProblemList } from "@/components/problem-list";
import type { ProblemItem } from "@/components/problem-list";
import { BasketView } from "@/components/exam-basket";
import { PaperLibrary } from "@/components/paper-library";
import type { BasketItem } from "@/components/exam-basket";

import { VoiceInputButton, insertVoiceTextIntoEditor } from "@/components/voice-input-button";
import { MathFormulaModal } from "@/components/math-formula-modal";

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
  const [editAnswer, setEditAnswer] = useState("");
  const answerEditorRef = useRef<import("@tiptap/react").Editor | null>(null);
  const [mathModalOpen, setMathModalOpen] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [editDifficulty, setEditDifficulty] = useState(3);
  const [editQuestionType, setEditQuestionType] = useState("");
  const [editSourceDate, setEditSourceDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit page: notes & KP management
  const [editNotes, setEditNotes] = useState("");
  const [kpSearchQuery, setKpSearchQuery] = useState("");
  const [kpSearchResults, setKpSearchResults] = useState<{ id: number; name: string; chapterId: number; chapter?: { id: number; title: string; textbookId: number } }[]>([]);
  const [showKpSearch, setShowKpSearch] = useState(false);
  const [addingKp, setAddingKp] = useState(false);
  const [kpError, setKpError] = useState<string | null>(null);
  const [kpSearching, setKpSearching] = useState(false);
  const kpSearchRef = useRef<HTMLDivElement>(null);

  // Basket state
  const [basketItems, setBasketItems] = useState<BasketItem[]>([]);
  const [exporting, setExporting] = useState(false);

  // Select chapter → clear KP and problem selections
  // id/title 为 null 时表示章节被删除，清空选中态
  const handleSelectChapter = useCallback((id: number | null, title: string | null) => {
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
    fetch(`/tiku/api/problems?knowledgePointId=${selectedKpId}`)
      .then((r) => r.json())
      .then((d) => setProblems(d.data || []))
      .catch(() => setProblems([]))
      .finally(() => setLoading(false));
  }, [selectedKpId]);

  // Refresh problems after mutations (notes, KP tags)
  const refreshProblems = useCallback(() => {
    if (!selectedKpId) return;
    setLoading(true);
    fetch(`/tiku/api/problems?knowledgePointId=${selectedKpId}`)
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
      setEditAnswer(p.answer || "");
      setEditDirty(false);
      setEditDifficulty(p.difficulty);
      setEditQuestionType(p.questionType || "");
      setEditSourceDate(p.sourceDate || "");
      setEditNotes(p.remarks || "");
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
      const res = await fetch(`/tiku/api/problems/${selectedProblemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editContent,
          answer: editAnswer,
          difficulty: editDifficulty,
          questionType: editQuestionType || null,
          sourceDate: editSourceDate || null,
          remarks: editNotes || null,
        }),
      });
      if (!res.ok) {
        alert("保存失败，请重试");
        return;
      }
      setEditDirty(false);
      setSelectedProblem((prev) => prev ? { ...prev, remarks: editNotes } : null);
      setProblems((prev) => prev.map((p) => p.id === selectedProblemId ? { ...p, remarks: editNotes } : p));
      if (selectedKpId) {
        const res = await fetch(`/tiku/api/problems?knowledgePointId=${selectedKpId}`);
        const d = await res.json();
        setProblems(d.data || []);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [selectedProblemId, editContent, editAnswer, editDifficulty, editQuestionType, editSourceDate, editNotes, selectedKpId]);

  // Delete problem
  const handleDelete = useCallback(async (id: number) => {
    try {
      await fetch(`/tiku/api/problems/${id}`, { method: "DELETE" });
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

  // Edit page: search KPs
  const handleSearchKps = useCallback(async (query: string) => {
    if (!query.trim()) {
      setKpSearchResults([]);
      return;
    }
    setKpSearchResults([]);
    setKpSearching(true);
    try {
      const res = await fetch(`/tiku/api/knowledge-points?search=${encodeURIComponent(query)}`);
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
      const res = await fetch(`/tiku/api/problems/${pid}/knowledge-points`, {
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
        const refreshRes = await fetch(`/tiku/api/problems?knowledgePointId=${selectedKpId}`);
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
      const createRes = await fetch("/tiku/api/knowledge-points", {
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
      const addRes = await fetch(`/tiku/api/problems/${pid}/knowledge-points`, {
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
        const refreshRes = await fetch(`/tiku/api/problems?knowledgePointId=${selectedKpId}`);
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
    const res = await fetch(`/tiku/api/problems/${pid}/knowledge-points/${kpId}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || !res.ok) return;
    if (selectedKpId) {
      const refreshRes = await fetch(`/tiku/api/problems?knowledgePointId=${selectedKpId}`);
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
  const handleExport = useCallback(async (includeAnswers: boolean) => {
    if (basketItems.length === 0) return;
    setExporting(true);
    try {
      // 篮子里的题可能来自多个知识点，当前列表只载了一个知识点的题——先批量补齐
      const loadedIds = new Set(problems.map((p) => p.id));
      const missingIds = basketItems.map((b) => b.problemId).filter((id) => !loadedIds.has(id));
      let allProblems = problems;
      if (missingIds.length > 0) {
        const r = await fetch(`/tiku/api/problems?ids=${missingIds.join(",")}`);
        const d = await r.json();
        const fetched: typeof problems = d.data || [];
        const fetchedIds = new Set(fetched.map((p) => p.id));
        const stillMissing = missingIds.filter((id) => !fetchedIds.has(id));
        if (stillMissing.length > 0) {
          if (!window.confirm(`有 ${stillMissing.length} 道题数据缺失（可能已被删除），将在试卷中跳过。继续导出？`)) return;
        }
        allProblems = [...problems, ...fetched];
      }
      const { exportProblemsToDocx } = await import("@/lib/export-docx");
      await exportProblemsToDocx(allProblems, basketItems, includeAnswers);
    } catch (e) {
      console.error("Export failed:", e);
      alert("导出失败，请重试");
    } finally {
      setExporting(false);
    }
  }, [basketItems, problems]);

  const QUESTION_TYPES = ["单选", "多选", "实验", "计算"];

  const [view, setView] = useState<"problems" | "papers" | "basket">("problems");

  return (
    <div className="h-[calc(100vh-40px)] flex flex-col bg-gray-100 pb-10">
      {/* 顶部：题目 / 试卷 切换 */}
      <div className="px-4 pt-3 flex items-center gap-2">
        <div className="inline-flex bg-white border rounded-lg overflow-hidden shadow-sm">
          <button
            onClick={() => setView("problems")}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              view === "problems" ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            ✏️ 题目
          </button>
          <button
            onClick={() => setView("papers")}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              view === "papers" ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            📄 试卷
          </button>
          <Link
            href="/lectures"
            className="px-5 py-2 text-sm font-medium transition-colors text-gray-600 hover:bg-gray-50"
          >
            📝 讲义
          </Link>
        </div>
        {view === "problems" && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setView("basket")}
              className="relative px-3 py-2 bg-white border rounded-lg shadow-sm hover:border-blue-300 transition-colors text-base leading-none"
              title="组卷篮"
            >
              🧺
              {basketItems.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {basketItems.length}
                </span>
              )}
            </button>
            <Link
              href="/"
              className="px-4 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:text-blue-600 hover:border-blue-300 shadow-sm transition-colors"
            >
              题库管理
            </Link>
            <Link
              href="/upload"
              className="px-4 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:text-blue-600 hover:border-blue-300 shadow-sm transition-colors"
            >
              上传试卷
            </Link>
          </div>
        )}
      </div>

      {view === "papers" ? (
        <div className="flex-1 min-h-0 mt-2">
          <PaperLibrary />
        </div>
      ) : view === "basket" ? (
        <BasketView
          items={basketItems}
          problemMap={new Map(problems.map((p) => [p.id, p]))}
          onRemove={handleRemoveFromBasket}
          onClear={handleClearBasket}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onExport={handleExport}
          exporting={exporting}
          onBack={() => setView("problems")}
        />
      ) : (
      <>
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
            textbookId={selectedTextbookId}
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
                      key={`content-${selectedProblemId}`}
                      content={editContent}
                      editable={true}
                      onChange={(html, json) => { setEditContent(JSON.stringify(json)); setEditDirty(true); }}
                    />
                  </div>

                  {/* 答案（可语音输入） */}
                  <div className="bg-amber-50/60 border border-amber-200 rounded-lg overflow-hidden">
                    <div className="px-4 pt-2.5 pb-1 flex items-center gap-2">
                      <span className="text-xs text-amber-700 font-medium">答案</span>
                      <VoiceInputButton
                        onResult={(text) => {
                          if (answerEditorRef.current) insertVoiceTextIntoEditor(answerEditorRef.current, text);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setMathModalOpen(true)}
                        className="px-2.5 py-1 border rounded text-xs text-gray-600 hover:bg-gray-50"
                      >
                        ∑ 公式
                      </button>
                        <label className="px-2.5 py-1 border rounded text-xs text-gray-600 hover:bg-gray-50 cursor-pointer">
                          🖼 图片
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              const ed = answerEditorRef.current;
                              if (!ed) return;
                              const reader = new FileReader();
                              reader.onloadend = () => ed.chain().focus().setImage({ src: reader.result as string }).run();
                              reader.readAsDataURL(f);
                            }}
                          />
                        </label>
                    </div>
                    <RichTextEditor
                      key={`answer-${selectedProblemId}`}
                      content={editAnswer}
                      editable={true}
                      plain
                      onEditorReady={(editor) => { answerEditorRef.current = editor; }}
                      onChange={(html, json) => { setEditAnswer(JSON.stringify(json)); setEditDirty(true); }}
                    />
                  </div>

                  <MathFormulaModal
                    open={mathModalOpen}
                    onCancel={() => setMathModalOpen(false)}
                    onConfirm={(latex) => {
                      answerEditorRef.current?.chain().focus().setInlineMath(latex).run();
                      setMathModalOpen(false);
                    }}
                  />

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
                          onChange={(e) => { setEditSourceDate(e.target.value); setEditDirty(true); }}
                          className="mt-1 w-full border rounded px-2 py-1 text-xs"
                        />
                      </label>

                      <label className="text-xs text-gray-500">
                        难度
                        <select
                          value={editDifficulty}
                          onChange={(e) => { setEditDifficulty(Number(e.target.value)); setEditDirty(true); }}
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
                          onChange={(e) => { setEditQuestionType(e.target.value); setEditDirty(true); }}
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
                        onChange={(e) => { setEditNotes(e.target.value); setEditDirty(true); }}
                        placeholder="可直接填写备注，随「保存修改」一起保存..."
                        rows={3}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs resize-y bg-white"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2 border-t">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving || !editDirty}
                        className={`px-4 py-1.5 text-sm rounded transition-colors ${
                          editDirty
                            ? "bg-blue-500 text-white hover:bg-blue-600"
                            : "bg-green-50 text-green-600 border border-green-300 cursor-default"
                        } disabled:opacity-60`}
                      >
                        {saving ? "保存中..." : editDirty ? "保存修改" : "✓ 已保存"}
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

      </>
      )}
    </div>
  );
}
