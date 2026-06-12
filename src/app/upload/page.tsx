"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { Editor } from "@tiptap/react";
import katex from "katex";
import type { DocContent, DocParagraph, ParagraphRun } from "@/lib/docx-parser";
import { docParagraphsToTipTapJson } from "@/lib/tip-tap-converter";
import { AuthGate } from "@/components/auth/auth-gate";
import { GlobalToolbar } from "@/components/tiptap/global-toolbar";

const RichTextEditor = dynamic(
  () => import("@/components/tiptap/rich-text-editor").then((mod) => mod.RichTextEditor),
  { ssr: false },
);

interface Textbook {
  id: number;
  name: string;
}

interface Chapter {
  id: number;
  textbookId: number;
  parentId: number | null;
  title: string;
  children: Chapter[];
}

interface KnowledgePoint {
  id: number;
  chapterId: number;
  name: string;
}

interface ProblemTag {
  name: string;
  knowledgePointId?: number;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Problem {
  id: number;
  paragraphs: DocParagraph[];
  kept: boolean;
  textbookId: number | null;
  chapterId: number | null;
  tags: ProblemTag[];
  lessonTitle: string;
  questionType: string;
  difficulty: number;
  sourceDate: string;
}

function renderFormula(latex: string): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: false });
  } catch {
    return `<code>${latex}</code>`;
  }
}

function RenderRun({ run }: { run: ParagraphRun }) {
  if (run.type === "formula") {
    return (
      <span
        className="inline-math px-0.5"
        dangerouslySetInnerHTML={{ __html: renderFormula(run.latex) }}
      />
    );
  }
  if (run.type === "image") {
    return (
      <img
        src={run.src}
        alt={run.alt || ""}
        className="my-3 rounded"
        style={{
          maxWidth: "100%",
          height: "auto",
          width: run.width ? `${run.width}px` : undefined,
        }}
      />
    );
  }
  let cls = "";
  if (run.bold) cls += "font-bold ";
  if (run.italic) cls += "italic ";
  if (run.underline) cls += "underline ";
  return <span className={cls}>{run.text}</span>;
}

const QUESTION_TYPES = ["单选", "多选", "实验", "计算"];

export default function UploadPage() {
  const [parsedDoc, setParsedDoc] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [splitIndices, setSplitIndices] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Global toolbar state
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [editorActive, setEditorActive] = useState<Record<string, boolean>>({});
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    fetch("/api/textbooks")
      .then((r) => r.json())
      .then((d) => setTextbooks(d.data || []))
      .catch(() => {});
  }, []);

  // Subscribe to active editor's formatting state
  useEffect(() => {
    if (!activeEditor) return;
    const update = () => {
      setEditorActive({
        bold: activeEditor.isActive("bold"),
        italic: activeEditor.isActive("italic"),
        underline: activeEditor.isActive("underline"),
        superscript: activeEditor.isActive("superscript"),
        subscript: activeEditor.isActive("subscript"),
      });
    };
    activeEditor.on("selectionUpdate", update);
    activeEditor.on("transaction", update);
    update();
    return () => {
      activeEditor.off("selectionUpdate", update);
      activeEditor.off("transaction", update);
    };
  }, [activeEditor]);

  const loadChapters = useCallback(async (textbookId: number) => {
    setChapters([]);
    const res = await fetch(`/api/chapters?textbookId=${textbookId}`);
    const d = await res.json();
    setChapters(d.data || []);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".docx")) {
      setError("请选择 .docx 格式的文件");
      return;
    }
    setLoading(true);
    setError(null);
    setSplitIndices(new Set());
    setProblems([]);
    setSavedMsg(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-docx", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "解析失败");
      }
      const data = await res.json();
      setParsedDoc(data.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const toggleSplit = useCallback((index: number) => {
    setSplitIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const applySplits = useCallback(() => {
    if (!parsedDoc) return;
    const result: Problem[] = [];
    let current: DocParagraph[] = [];
    parsedDoc.paragraphs.forEach((para, i) => {
      current.push(para);
      if (splitIndices.has(i)) {
        result.push({
          id: result.length + 1,
          paragraphs: current,
          kept: true,
          textbookId: null,
          chapterId: null,
          tags: [],
          lessonTitle: "",
          questionType: "",
          difficulty: 3,
          sourceDate: todayStr(),
        });
        current = [];
      }
    });
    if (current.length > 0) {
      result.push({
        id: result.length + 1,
        paragraphs: current,
        kept: true,
        textbookId: null,
        chapterId: null,
        tags: [],
        lessonTitle: "",
        questionType: "",
        difficulty: 3,
        sourceDate: todayStr(),
      });
    }
    setProblems(result);
    setSavedMsg(null);
  }, [parsedDoc, splitIndices]);

  const resetSplits = useCallback(() => {
    setProblems([]);
    setSplitIndices(new Set());
    setSavedMsg(null);
    setError(null);
  }, []);

  const toggleKeep = useCallback((id: number) => {
    setProblems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, kept: !p.kept } : p)),
    );
  }, []);

  const updateProblem = useCallback((id: number, field: string, value: unknown) => {
    setProblems((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: value };
        if (field === "textbookId") {
          updated.chapterId = null;
          loadChapters(value as number);
        }
        return updated;
      }),
    );
  }, [loadChapters]);

  const addTag = useCallback((problemId: number, tagName: string) => {
    const name = tagName.trim();
    if (!name) return;
    setProblems((prev) =>
      prev.map((p) => {
        if (p.id !== problemId) return p;
        if (p.tags.some((t) => t.name === name)) return p;
        return { ...p, tags: [...p.tags, { name }] };
      }),
    );
  }, []);

  const removeTag = useCallback((problemId: number, tagName: string) => {
    setProblems((prev) =>
      prev.map((p) => {
        if (p.id !== problemId) return p;
        return { ...p, tags: p.tags.filter((t) => t.name !== tagName) };
      }),
    );
  }, []);

  const saveToDatabase = useCallback(async () => {
    const keptProblems = problems.filter((p) => p.kept);
    if (keptProblems.length === 0) {
      setError("没有需要保存的题目");
      return;
    }

    const invalid = keptProblems.find(
      (p) => !p.textbookId || !p.chapterId || p.tags.length === 0,
    );
    if (invalid) {
      setError(`第 ${invalid.id} 题缺少分类信息，请先完善课本、章节和至少一个标签`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let created = 0;
      let skipped = 0;
      let updated = 0;

      for (let i = 0; i < keptProblems.length; i++) {
        const p = keptProblems[i];
        const tipTapJson = docParagraphsToTipTapJson(p.paragraphs);
        const contentStr = JSON.stringify(tipTapJson);

        // Check for duplicate
        const checkRes = await fetch("/api/problems/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentStr }),
        });
        const checkData = await checkRes.json();

        if (checkData.duplicate) {
          const existing = checkData.existing;
          const existingTagNames = (existing.knowledgePoints as { name: string }[])
            .map((kp) => kp.name)
            .sort()
            .join(",");
          const newTagNames = p.tags.map((t) => t.name).sort().join(",");

          const sameTags = existingTagNames === newTagNames;
          const sameDifficulty = existing.difficulty === p.difficulty;
          const sameLesson = (existing.lessonTitle || "") === (p.lessonTitle || "");
          const sameType = (existing.questionType || "") === (p.questionType || "");
          const sameDate = (existing.sourceDate || "") === (p.sourceDate || "");
          const allSame = sameTags && sameDifficulty && sameLesson && sameType && sameDate;

          if (allSame) {
            skipped++;
            continue;
          }

          // Tags or classification differ — ask user
          const detail = [];
          if (!sameTags) detail.push("标签不同");
          if (!sameDifficulty) detail.push("难度不同");
          if (!sameLesson) detail.push("课时不同");
          if (!sameType) detail.push("题型不同");
          if (!sameDate) detail.push("日期不同");

          const shouldOverwrite = window.confirm(
            `第 ${p.id} 题已存在于数据库中，但${detail.join("、")}。\n\n是否覆盖原有数据？\n\n"确定" = 覆盖更新\n"取消" = 跳过此题`,
          );

          if (!shouldOverwrite) {
            skipped++;
            continue;
          }

          // Resolve knowledge point IDs for the update
          const kpIds: number[] = [];
          for (const tag of p.tags) {
            const searchRes = await fetch(
              `/api/knowledge-points?search=${encodeURIComponent(tag.name)}`,
            );
            const searchData = await searchRes.json();
            const found = searchData.data?.find(
              (kp: KnowledgePoint) => kp.name === tag.name,
            );
            if (found) {
              kpIds.push(found.id);
            } else {
              const createRes = await fetch("/api/knowledge-points", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chapterId: p.chapterId, name: tag.name }),
              });
              const createData = await createRes.json();
              kpIds.push(createData.data.id);
            }
          }

          await fetch(`/api/problems/${existing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: tipTapJson,
              difficulty: p.difficulty,
              lessonTitle: p.lessonTitle || null,
              questionType: p.questionType || null,
              sourceDate: p.sourceDate || null,
              knowledgePointIds: kpIds,
            }),
          });
          updated++;
        } else {
          // Not a duplicate — create new
          const kpIds: number[] = [];
          for (const tag of p.tags) {
            const searchRes = await fetch(
              `/api/knowledge-points?search=${encodeURIComponent(tag.name)}`,
            );
            const searchData = await searchRes.json();
            const found = searchData.data?.find(
              (kp: KnowledgePoint) => kp.name === tag.name,
            );
            if (found) {
              kpIds.push(found.id);
            } else {
              const createRes = await fetch("/api/knowledge-points", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chapterId: p.chapterId, name: tag.name }),
              });
              const createData = await createRes.json();
              kpIds.push(createData.data.id);
            }
          }

          await fetch("/api/problems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{
              content: tipTapJson,
              difficulty: p.difficulty,
              lessonTitle: p.lessonTitle || null,
              questionType: p.questionType || null,
              sourceDate: p.sourceDate || null,
              knowledgePointIds: kpIds,
            }]),
          });
          created++;
        }
      }

      let msg = `已保存 ${created} 题`;
      if (updated > 0) msg += `，覆盖 ${updated} 题`;
      if (skipped > 0) msg += `，跳过 ${skipped} 题`;
      setSavedMsg(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [problems]);

  const keptProblems = problems.filter((p) => p.kept);

  return (
    <AuthGate>
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-2 py-3">
          <h1 className="text-xl font-bold text-gray-800">上传试卷</h1>
          <p className="text-xs text-gray-500 mt-0.5">上传 .docx 试卷 → 分割题目 → 保留需要的 → 分类保存</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 py-4 space-y-6">
        {/* Upload zone */}
        {!parsedDoc && (
          <section>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                loading ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <input ref={fileInputRef} type="file" accept=".docx" onChange={handleInputChange} className="hidden" />
              {loading ? (
                <div className="text-gray-500">
                  <div className="animate-spin inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-2" />
                  <p>正在解析试卷...</p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-lg text-gray-600">拖拽 .docx 文件到此处，或点击选择</p>
                  <p className="text-sm text-gray-400 mt-2">支持 WPS / Microsoft Word 文档</p>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
            )}
          </section>
        )}

        {/* Preview — before splitting */}
        {parsedDoc && problems.length === 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">
                试卷预览 — 共 {parsedDoc.paragraphs.length} 段
              </h2>
              <button onClick={applySplits} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                确认分割 → 标注标签
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              点击段落之间的 <span className="px-2 py-0.5 bg-yellow-200 rounded text-xs font-bold">分割线</span> 按钮来切分题目
            </p>
            <div className="space-y-0 bg-white border rounded-lg overflow-hidden">
              {parsedDoc.paragraphs.map((para, i) => (
                <div key={i}>
                  {i > 0 && (
                    <div className="relative h-6 flex items-center justify-center bg-gray-50 border-t border-b border-dashed">
                      <button
                        onClick={() => toggleSplit(i - 1)}
                        className={`absolute text-xs px-3 py-0.5 rounded-full transition-colors ${
                          splitIndices.has(i - 1)
                            ? "bg-red-500 text-white"
                            : "bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300"
                        }`}
                      >
                        {splitIndices.has(i - 1)
                          ? `第 ${[...splitIndices].filter((s) => s <= i - 1).length} 题开始`
                          : "在此分割"}
                      </button>
                    </div>
                  )}
                  <div className={`px-5 py-3 ${para.style?.startsWith("Heading") ? "bg-blue-50 font-bold text-xl" : ""}`}>
                    <p className="leading-relaxed text-base">
                      {para.runs.map((run, j) => (
                        <RenderRun key={j} run={run} />
                      ))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Split layout: fixed-height boxes, internal scroll */}
        {problems.length > 0 && (
          <div className="flex gap-4 h-[calc(100vh-120px)]">
            {/* Left box — fixed outer, scrollable inner */}
            <div className={`bg-white border rounded-lg overflow-hidden flex flex-col transition-all ${showPreview ? "flex-1" : "flex-1 max-w-4xl mx-auto"}`}>
              {/* Fixed header: title + toolbar */}
              <div className="flex-shrink-0">
                <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">
                    已保留 {keptProblems.length}/{problems.length} 题
                  </h2>
                  {savedMsg !== null && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      {savedMsg}
                    </span>
                  )}
                </div>
                <GlobalToolbar activeEditor={activeEditor} editorActive={editorActive} />
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {keptProblems.length === 0 && (
                  <div className="bg-gray-50 border rounded-lg p-8 text-center text-gray-400 text-sm">
                    右侧点击「保留」选择需要的题目
                  </div>
                )}

                {keptProblems.map((problem, idx) => (
                  <div key={problem.id} className="border-2 border-gray-300 rounded-lg shadow-sm overflow-hidden bg-white">
                    {/* Title bar */}
                    <div className="px-4 py-2 bg-blue-50 border-b border-gray-200 flex items-center justify-between">
                      <span className="text-sm font-bold text-blue-800">第 {idx + 1} 题</span>
                      <button
                        onClick={() => toggleKeep(problem.id)}
                        className="text-xs px-2 py-0.5 text-red-500 border border-red-200 rounded hover:bg-red-50"
                      >
                        舍弃此题
                      </button>
                    </div>

                    {/* Editor content — plain, no inner border */}
                    <RichTextEditor
                      content={JSON.stringify(docParagraphsToTipTapJson(problem.paragraphs))}
                      editable={true}
                      plain
                      onFocus={(editor) => setActiveEditor(editor)}
                      onChange={() => {}}
                    />

                    {/* Divider */}
                    <div className="border-t border-gray-200" />

                    {/* Classification below editor */}
                    <div className="px-4 py-3 bg-gray-50/80 space-y-2 text-sm">
                      {/* Tags — always enabled, first */}
                      <div>
                        <div className="text-xs text-gray-500 mb-1 font-medium">知识点标签</div>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {problem.tags.map((tag) => (
                            <span
                              key={tag.name}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                            >
                              {tag.name}
                              <button
                                onClick={() => removeTag(problem.id, tag.name)}
                                className="text-green-500 hover:text-red-500 font-bold leading-none"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <TagInput onAdd={(name) => addTag(problem.id, name)} />
                      </div>

                      {/* Textbook + Chapter */}
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={problem.textbookId ?? ""}
                          onChange={(e) => updateProblem(problem.id, "textbookId", e.target.value ? Number(e.target.value) : null)}
                          className="border rounded px-2 py-1 text-sm bg-white"
                        >
                          <option value="">选择课本</option>
                          {textbooks.map((tb) => (
                            <option key={tb.id} value={tb.id}>{tb.name}</option>
                          ))}
                        </select>

                        <select
                          value={problem.chapterId ?? ""}
                          onChange={(e) => updateProblem(problem.id, "chapterId", e.target.value ? Number(e.target.value) : null)}
                          className="border rounded px-2 py-1 text-sm bg-white"
                          disabled={!problem.textbookId}
                        >
                          <option value="">选择章节</option>
                          {chapters.map((ch) => (
                            <option key={ch.id} value={ch.id}>{ch.title}</option>
                          ))}
                        </select>
                      </div>

                      {/* Source date + Difficulty + Question Type */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <label className="flex items-center gap-1 text-gray-500 text-xs">
                          日期:
                          <input
                            type="date"
                            value={problem.sourceDate}
                            onChange={(e) => updateProblem(problem.id, "sourceDate", e.target.value)}
                            className="border rounded px-1 py-0.5 text-xs"
                          />
                        </label>

                        <label className="flex items-center gap-1 text-gray-500 text-xs">
                          难度:
                          <select
                            value={problem.difficulty}
                            onChange={(e) => updateProblem(problem.id, "difficulty", Number(e.target.value))}
                            className="border rounded px-1 py-0.5 text-xs"
                          >
                            {[1, 2, 3, 4, 5].map((d) => (
                              <option key={d} value={d}>{"★".repeat(d)}</option>
                            ))}
                          </select>
                        </label>

                        <fieldset className="flex items-center gap-2">
                          <legend className="text-gray-500 text-xs">题型:</legend>
                          {QUESTION_TYPES.map((qt) => (
                            <label key={qt} className="flex items-center gap-0.5 text-xs cursor-pointer">
                              <input
                                type="radio"
                                name={`qtype-${problem.id}`}
                                value={qt}
                                checked={problem.questionType === qt}
                                onChange={(e) => updateProblem(problem.id, "questionType", e.target.value)}
                                className="text-blue-500"
                              />
                              <span className="text-gray-600">{qt}</span>
                            </label>
                          ))}
                        </fieldset>
                      </div>

                    </div>
                  </div>
                ))}

                {/* Save button */}
                {keptProblems.length > 0 && (
                  <button
                    onClick={saveToDatabase}
                    disabled={saving}
                    className={`w-full py-2.5 rounded-lg text-white font-medium text-sm transition-colors ${
                      saving ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {saving ? "正在保存..." : `保存全部 ${keptProblems.length} 题到数据库`}
                  </button>
                )}

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
                )}

                <div className="h-2" />
              </div>
            </div>

            {/* Right box — collapsible preview */}
            {showPreview && parsedDoc && (
              <div className="w-1/2 flex-shrink-0 bg-white border rounded-lg overflow-hidden flex flex-col">
                <div className="flex-shrink-0 px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">
                      试卷预览 — {parsedDoc.paragraphs.length} 段 · {problems.length} 题
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-xs px-2 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                    title="隐藏预览"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {problems.map((problem) => (
                    <div key={problem.id} className={`border-b ${problem.kept ? "border-l-4 border-l-green-400" : "border-l-4 border-l-gray-200"}`}>
                      <div className="flex items-center justify-between px-3 py-1 bg-gray-50/50">
                        <span className="text-xs font-bold text-gray-500">
                          第 {problem.id} 题 ({problem.paragraphs.length} 段)
                        </span>
                        <button
                          onClick={() => toggleKeep(problem.id)}
                          className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                            problem.kept
                              ? "bg-green-500 text-white"
                              : "bg-gray-200 hover:bg-green-100 text-gray-600"
                          }`}
                        >
                          {problem.kept ? "✓ 保留" : "保留"}
                        </button>
                      </div>
                      {problem.paragraphs.map((para, i) => (
                        <div key={i} className={`px-3 py-0.5 text-sm ${para.style?.startsWith("Heading") ? "bg-blue-50 font-bold" : ""}`}>
                          {para.runs.map((run, j) => (
                            <RenderRun key={j} run={run} />
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex-shrink-0 px-3 py-2 border-t bg-gray-50">
                  <button
                    onClick={resetSplits}
                    className="w-full px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    重新分割
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show preview toggle when hidden */}
        {problems.length > 0 && !showPreview && (
          <button
            onClick={() => setShowPreview(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-20 px-1.5 py-6 bg-white border rounded-l-lg shadow-md hover:bg-gray-50 text-xs text-gray-500"
            title="显示预览"
          >
            ◀ 预览
          </button>
        )}
      </main>
    </div>
    </AuthGate>
  );
}

function TagInput({ onAdd, disabled }: { onAdd: (name: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="flex gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? "请先选择课本和章节" : "输入知识点标签，如：匀变速直线运动的速度公式"}
        className="border rounded px-2 py-1 text-xs flex-1 disabled:bg-gray-100 disabled:text-gray-400"
      />
      <button
        onClick={handleAdd}
        disabled={disabled || !value.trim()}
        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
      >
        添加
      </button>
    </div>
  );
}
