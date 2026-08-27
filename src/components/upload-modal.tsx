"use client";

import { useState, useCallback, useRef } from "react";
import katex from "katex";
import type { DocContent, DocParagraph, ParagraphRun } from "@/lib/docx-parser";
import { docParagraphsToTipTapJson } from "@/lib/tip-tap-converter";

interface ProblemTag {
  name: string;
}

// /api/problems/check-duplicate 返回的已存在题目信息
interface ExistingProblem {
  id: number;
  difficulty: number;
  lessonTitle: string | null;
  questionType: string | null;
  sourceDate: string | null;
  knowledgePoints: { id: number; name: string }[];
}

interface ModalProblem {
  id: number;
  paragraphs: DocParagraph[];
  tags: ProblemTag[];
  difficulty: number;
  questionType: string;
  sourceDate: string;
  kept: boolean;
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  textbookId: number;
  chapterId: number;
  chapterTitle: string;
  kpId: number;
  kpName: string;
  onSaved: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
      <span className="inline-math px-0.5" dangerouslySetInnerHTML={{ __html: renderFormula(run.latex) }} />
    );
  }
  if (run.type === "image") {
    return (
      <img
        src={run.src}
        alt={run.alt || ""}
        className="my-2 rounded"
        style={{ maxWidth: "100%", height: "auto", width: run.width ? `${run.width}px` : undefined }}
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

export function UploadModal({ open, onClose, textbookId, chapterId, chapterTitle, kpId, kpName, onSaved }: UploadModalProps) {
  const [parsedDoc, setParsedDoc] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitIndices, setSplitIndices] = useState<Set<number>>(new Set());
  const [problems, setProblems] = useState<ModalProblem[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setParsedDoc(null);
    setLoading(false);
    setError(null);
    setSplitIndices(new Set());
    setProblems([]);
    setSaving(false);
    setSavedCount(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  // ── Upload & Parse ──

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".docx")) {
      setError("请选择 .docx 格式的文件");
      return;
    }
    setLoading(true);
    setError(null);
    setSplitIndices(new Set());
    setProblems([]);
    setSavedCount(null);

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

  // ── Split ──

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
    const result: ModalProblem[] = [];
    let current: DocParagraph[] = [];
    parsedDoc.paragraphs.forEach((para, i) => {
      current.push(para);
      if (splitIndices.has(i)) {
        result.push({
          id: result.length + 1,
          paragraphs: current,
          tags: [{ name: kpName }],
          difficulty: 3,
          questionType: "",
          sourceDate: todayStr(),
          kept: true,
        });
        current = [];
      }
    });
    if (current.length > 0) {
      result.push({
        id: result.length + 1,
        paragraphs: current,
        tags: [{ name: kpName }],
        difficulty: 3,
        questionType: "",
        sourceDate: todayStr(),
        kept: true,
      });
    }
    setProblems(result);
    setError(null);
  }, [parsedDoc, splitIndices, kpName]);

  const resetSplits = useCallback(() => {
    setProblems([]);
    setSplitIndices(new Set());
    setSavedCount(null);
    setError(null);
  }, []);

  // ── Modify ──

  const updateProblem = useCallback((id: number, field: string, value: unknown) => {
    setProblems((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }, []);

  const toggleKeep = useCallback((id: number) => {
    setProblems((prev) => prev.map((p) => (p.id === id ? { ...p, kept: !p.kept } : p)));
  }, []);

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

  // ── Save ──

  const handleSave = useCallback(async () => {
    const kept = problems.filter((p) => p.kept);
    if (kept.length === 0) {
      setError("没有需要保存的题目");
      return;
    }

    const invalid = kept.find((p) => p.tags.length === 0);
    if (invalid) {
      setError(`第 ${invalid.id} 题缺少标签，请添加至少一个知识点标签`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const contents = kept.map((p) =>
        JSON.stringify(docParagraphsToTipTapJson(p.paragraphs)),
      );

      // 一次批量查重（按归一化内容哈希，服务端比对）
      const checkRes = await fetch("/api/problems/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });
      const checkData = await checkRes.json();
      const duplicateMap = new Map<number, ExistingProblem>(
        (checkData.duplicates || []).map(
          (d: { index: number; problem: ExistingProblem }) => [d.index, d.problem],
        ),
      );

      let created = 0;
      let skipped = 0;
      let updated = 0;

      for (let i = 0; i < kept.length; i++) {
        const p = kept[i];
        const contentStr = contents[i];

        // Resolve tags → knowledgePointIds
        const kpIds: number[] = [];
        for (const tag of p.tags) {
          if (tag.name === kpName) {
            if (!kpIds.includes(kpId)) kpIds.push(kpId);
            continue;
          }
          const searchRes = await fetch(`/api/knowledge-points?search=${encodeURIComponent(tag.name)}`);
          const searchData = await searchRes.json();
          const found = searchData.data?.find(
            (kp: { id: number; name: string }) => kp.name === tag.name,
          );
          if (found) {
            if (!kpIds.includes(found.id)) kpIds.push(found.id);
          } else {
            const createRes = await fetch("/api/knowledge-points", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chapterId, name: tag.name }),
            });
            const createData = await createRes.json();
            if (createData.data && !kpIds.includes(createData.data.id)) {
              kpIds.push(createData.data.id);
            }
          }
        }

        const existing = duplicateMap.get(i);

        if (existing) {
          const existingTags = existing.knowledgePoints
            .map((kp) => kp.name).sort().join(",");
          const newTags = p.tags.map((t) => t.name).sort().join(",");
          const sameTags = existingTags === newTags;
          const sameDifficulty = existing.difficulty === p.difficulty;
          const sameType = (existing.questionType || "") === p.questionType;
          const sameDate = (existing.sourceDate || "") === p.sourceDate;
          const allSame = sameTags && sameDifficulty && sameType && sameDate;

          if (allSame) {
            skipped++;
            continue;
          }

          await fetch(`/api/problems/${existing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: contentStr,
              difficulty: p.difficulty,
              questionType: p.questionType || null,
              sourceDate: p.sourceDate || null,
              knowledgePointIds: kpIds,
            }),
          });
          updated++;
        } else {
          await fetch("/api/problems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{
              content: contentStr,
              difficulty: p.difficulty,
              questionType: p.questionType || null,
              sourceDate: p.sourceDate || null,
              knowledgePointIds: kpIds,
            }]),
          });
          created++;
        }
      }

      setSavedCount(created + updated);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [problems, kpId, kpName, chapterId, onSaved]);

  if (!open) return null;

  const keptCount = problems.filter((p) => p.kept).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[95vw] h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">上传题目到「{kpName}」</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {chapterTitle} · 自动标签：{kpName}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2 py-1">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {/* Stage 1: Upload */}
          {!parsedDoc && !loading && savedCount === null && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors border-gray-300 hover:border-blue-400 hover:bg-blue-50"
            >
              <input ref={fileInputRef} type="file" accept=".docx" onChange={handleInputChange} className="hidden" />
              <div className="text-4xl mb-3">📄</div>
              <p className="text-lg text-gray-600">拖拽 .docx 文件到此处，或点击选择</p>
              <p className="text-sm text-gray-400 mt-2">题目将自动归类到「{kpName}」</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-16">
              <div className="animate-spin inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-3" />
              <p className="text-gray-500">正在解析试卷...</p>
            </div>
          )}

          {/* Stage 2: Split */}
          {parsedDoc && problems.length === 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-700">
                  试卷预览 — 共 {parsedDoc.paragraphs.length} 段
                </h3>
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
                      <div className="relative h-7 flex items-center justify-center bg-gray-50 border-t border-b border-dashed">
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
                    <div className={`px-5 py-3 ${para.style?.startsWith("Heading") ? "bg-blue-50 font-bold text-lg" : ""}`}>
                      <p className="leading-relaxed text-base">
                        {para.runs.map((run, j) => (
                          <RenderRun key={j} run={run} />
                        ))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stage 3: Tag & Save */}
          {problems.length > 0 && savedCount === null && (
            <div className="space-y-6">
              {problems.map((problem, idx) => (
                <div key={problem.id} className={`border-2 rounded-lg overflow-hidden bg-white ${problem.kept ? "border-gray-300" : "border-gray-200 opacity-50"}`}>
                  {/* Title bar */}
                  <div className="px-4 py-2 bg-blue-50 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-bold text-blue-800">第 {idx + 1} 题 ({problem.paragraphs.length} 段)</span>
                    <button
                      onClick={() => toggleKeep(problem.id)}
                      className={`text-xs px-2.5 py-0.5 rounded-full transition-colors ${
                        problem.kept
                          ? "bg-green-500 text-white hover:bg-green-600"
                          : "bg-gray-200 text-gray-600 hover:bg-green-100"
                      }`}
                    >
                      {problem.kept ? "✓ 保留" : "舍弃"}
                    </button>
                  </div>

                  {/* Content preview */}
                  <div className="px-5 py-4 text-base leading-relaxed">
                    {problem.paragraphs.map((para, i) => (
                      <p key={i} className={para.style?.startsWith("Heading") ? "font-bold text-lg mb-2" : "mb-1"}>
                        {para.runs.map((run, j) => (
                          <RenderRun key={j} run={run} />
                        ))}
                      </p>
                    ))}
                  </div>

                  {/* Classification */}
                  <div className="border-t border-gray-200 px-4 py-3 bg-gray-50/80 space-y-2 text-sm">
                    {/* Tags */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1 font-medium">知识点标签</div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {problem.tags.map((tag) => (
                          <span key={tag.name} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
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
                      <InlineTagInput onAdd={(name) => addTag(problem.id, name)} />
                    </div>

                    {/* Difficulty + Question Type + Date */}
                    <div className="flex items-center gap-4 flex-wrap">
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

                      <label className="flex items-center gap-1 text-gray-500 text-xs">
                        日期:
                        <input
                          type="date"
                          value={problem.sourceDate}
                          onChange={(e) => updateProblem(problem.id, "sourceDate", e.target.value)}
                          className="border rounded px-1 py-0.5 text-xs"
                        />
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

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || keptCount === 0}
                  className={`px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-colors ${
                    saving || keptCount === 0
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {saving ? "正在保存..." : `保存 ${keptCount}/${problems.length} 题到数据库`}
                </button>
                <button
                  onClick={resetSplits}
                  className="px-4 py-2.5 text-sm text-gray-500 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  重新分割
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {savedCount !== null && (
            <div className="p-6 text-center space-y-3">
              <div className="text-3xl">✅</div>
              <p className="text-lg font-semibold text-green-700">已成功保存 {savedCount} 道题目</p>
              <button onClick={handleClose} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                关闭
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineTagInput({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue("");
    }
  };

  return (
    <div className="flex gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
        placeholder="输入知识点标签，如：匀变速直线运动的速度公式"
        className="border rounded px-2 py-1 text-xs flex-1"
      />
      <button
        onClick={handleAdd}
        disabled={!value.trim()}
        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
      >
        添加
      </button>
    </div>
  );
}
