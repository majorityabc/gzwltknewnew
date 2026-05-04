"use client";

import { useState, useCallback, useRef } from "react";
import type { DocParagraph, DocContent, ParagraphRun } from "@/lib/docx-parser";
import { docParagraphsToTipTapJson } from "@/lib/tip-tap-converter";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  chapterId: number;
  chapterTitle: string;
  kpId: number;
  kpName: string;
  onSaved: () => void;
}

interface Candidate {
  id: number;
  paragraphs: DocParagraph[];
  tags: string[];
  difficulty: number;
  sourceDate: string;
  kept: boolean;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Step = "upload" | "split" | "confirm";

export function UploadModal({ open, onClose, chapterId, chapterTitle, kpId, kpName, onSaved }: UploadModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedDoc, setParsedDoc] = useState<DocContent | null>(null);
  const [splitIndices, setSplitIndices] = useState<Set<number>>(new Set());
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setLoading(false);
    setError(null);
    setParsedDoc(null);
    setSplitIndices(new Set());
    setCandidates([]);
    setSaving(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  // Step 1: Parse file
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".docx")) {
      setError("请选择 .docx 格式的文件");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-docx", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "解析失败");
      }
      const d = await res.json();
      setParsedDoc(d.content);
      setStep("split");
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // Step 2: Toggle split markers
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
    const result: Candidate[] = [];
    let current: DocParagraph[] = [];
    parsedDoc.paragraphs.forEach((para, i) => {
      current.push(para);
      if (splitIndices.has(i)) {
        result.push({
          id: result.length + 1,
          paragraphs: current,
          tags: [kpName],
          difficulty: 3,
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
        tags: [kpName],
        difficulty: 3,
        sourceDate: todayStr(),
        kept: true,
      });
    }
    if (result.length === 0) {
      result.push({
        id: 1,
        paragraphs: [...parsedDoc.paragraphs],
        tags: [kpName],
        difficulty: 3,
        sourceDate: todayStr(),
        kept: true,
      });
    }
    setCandidates(result);
    setStep("confirm");
  }, [parsedDoc, splitIndices, kpName]);

  // Step 3: Tag & save
  const addTag = useCallback((candidateId: number, tag: string) => {
    const t = tag.trim();
    if (!t) return;
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId && !c.tags.includes(t)
          ? { ...c, tags: [...c.tags, t] }
          : c,
      ),
    );
  }, []);

  const removeTag = useCallback((candidateId: number, tag: string) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? { ...c, tags: c.tags.filter((x) => x !== tag) }
          : c,
      ),
    );
  }, []);

  const toggleKeep = useCallback((id: number) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, kept: !c.kept } : c)),
    );
  }, []);

  const updateCandidate = useCallback((id: number, field: string, value: unknown) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    let created = 0;
    let skipped = 0;
    let updated = 0;

    try {
      const kept = candidates.filter((c) => c.kept);
      if (kept.length === 0) {
        setError("没有需要保存的题目");
        setSaving(false);
        return;
      }
      for (const c of kept) {
        const tipTapJson = docParagraphsToTipTapJson(c.paragraphs);
        const contentStr = JSON.stringify(tipTapJson);

        // Check duplicate
        const checkRes = await fetch("/api/problems/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentStr }),
        });
        const checkData = await checkRes.json();

        // Resolve KP IDs
        const kpIds: number[] = [];
        let useExistingKpId = false;
        for (const tag of c.tags) {
          if (tag === kpName) {
            kpIds.push(kpId);
            useExistingKpId = true;
            continue;
          }
          const searchRes = await fetch(`/api/knowledge-points?search=${encodeURIComponent(tag)}`);
          const searchData = await searchRes.json();
          const found = searchData.data?.find(
            (kp: { name: string }) => kp.name === tag,
          );
          if (found) {
            if (!kpIds.includes(found.id)) kpIds.push(found.id);
          } else {
            const createRes = await fetch("/api/knowledge-points", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chapterId, name: tag }),
            });
            const createData = await createRes.json();
            if (createData.data) kpIds.push(createData.data.id);
          }
        }

        if (kpIds.length === 0 && useExistingKpId) {
          kpIds.push(kpId);
        }

        if (checkData.duplicate) {
          const existing = checkData.existing;
          const existingTags = (existing.knowledgePoints as { name: string }[])
            .map((kp) => kp.name).sort().join(",");
          const newTags = c.tags.slice().sort().join(",");
          const sameTags = existingTags === newTags;
          const sameDifficulty = existing.difficulty === c.difficulty;
          const sameDate = (existing.sourceDate || "") === c.sourceDate;
          const allSame = sameTags && sameDifficulty && sameDate;

          if (allSame) {
            skipped++;
            continue;
          }

          await fetch(`/api/problems/${existing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: tipTapJson,
              difficulty: c.difficulty,
              sourceDate: c.sourceDate || null,
              knowledgePointIds: kpIds,
            }),
          });
          updated++;
        } else {
          await fetch("/api/problems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{
              content: tipTapJson,
              difficulty: c.difficulty,
              sourceDate: c.sourceDate || null,
              knowledgePointIds: kpIds,
            }]),
          });
          created++;
        }
      }

      let msg = `已保存 ${created} 题`;
      if (updated > 0) msg += `，覆盖 ${updated} 题`;
      if (skipped > 0) msg += `，跳过 ${skipped} 题`;
      alert(msg);
      reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [candidates, kpId, kpName, chapterId, reset, onSaved]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-800">
            {step === "upload" && "上传题目"}
            {step === "split" && "分割题目"}
            {step === "confirm" && "确认标签并保存"}
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                loading ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <input ref={fileInputRef} type="file" accept=".docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
              {loading ? (
                <div className="text-gray-500">
                  <div className="animate-spin inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-2" />
                  <p>正在解析...</p>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">📄</div>
                  <p className="text-base text-gray-600">拖拽 .docx 文件到此处，或点击选择</p>
                  <p className="text-xs text-gray-400 mt-1">题目将自动归类到 「{kpName}」</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Split */}
          {step === "split" && parsedDoc && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                共 {parsedDoc.paragraphs.length} 段，点击段落间的分割按钮切分题目
              </p>
              <div className="space-y-0 bg-white border rounded-lg overflow-hidden">
                {parsedDoc.paragraphs.map((para, i) => (
                  <div key={i}>
                    {i > 0 && (
                      <div className="relative h-6 flex items-center justify-center bg-gray-50 border-t border-b border-dashed">
                        <button
                          onClick={() => toggleSplit(i)}
                          className={`text-xs px-3 py-0.5 rounded-full transition-colors ${
                            splitIndices.has(i)
                              ? "bg-red-500 text-white"
                              : "bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300"
                          }`}
                        >
                          {splitIndices.has(i) ? "第 " + (Array.from(splitIndices).filter((x) => x < i).length + 1) + " 题开始" : "在此分割"}
                        </button>
                      </div>
                    )}
                    <div className={`px-4 py-2 ${para.style?.startsWith("Heading") ? "bg-blue-50 font-bold text-lg" : ""}`}>
                      <p className="text-sm leading-relaxed">
                        {para.runs.map((run, j) => (
                          <RenderRun key={j} run={run} />
                        ))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={applySplits}
                className="mt-4 w-full py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
              >
                确认分割 → 标注标签
              </button>
            </div>
          )}

          {/* Step 3: Confirm tags */}
          {step === "confirm" && (
            <div className="space-y-4">
              {candidates.map((c, idx) => (
                <div key={c.id} className={`border rounded-lg overflow-hidden ${c.kept ? "" : "opacity-50"}`}>
                  <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">第 {idx + 1} 题 ({c.paragraphs.length} 段)</span>
                    <button
                      onClick={() => toggleKeep(c.id)}
                      className={`text-xs px-2.5 py-0.5 rounded-full transition-colors ${
                        c.kept
                          ? "bg-green-500 text-white hover:bg-green-600"
                          : "bg-gray-200 text-gray-600 hover:bg-green-100"
                      }`}
                    >
                      {c.kept ? "✓ 保留" : "舍弃"}
                    </button>
                  </div>
                  {/* Preview */}
                  <div className="px-3 py-2 text-sm text-gray-700 max-h-32 overflow-y-auto bg-white">
                    {c.paragraphs.map((para, i) => (
                      <p key={i} className={para.style?.startsWith("Heading") ? "font-bold text-base" : ""}>
                        {para.runs.map((run, j) => (
                          <RenderRun key={j} run={run} />
                        ))}
                      </p>
                    ))}
                  </div>
                  {/* Tags + meta */}
                  <div className="px-3 py-2 bg-gray-50/80 space-y-2 border-t">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">知识点标签</div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {c.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                            {tag}
                            <button
                              onClick={() => removeTag(c.id, tag)}
                              className="text-green-500 hover:text-red-500 font-bold leading-none"
                            >&times;</button>
                          </span>
                        ))}
                      </div>
                      <TagInput onAdd={(name) => addTag(c.id, name)} />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        日期:
                        <input
                          type="date"
                          value={c.sourceDate}
                          onChange={(e) => updateCandidate(c.id, "sourceDate", e.target.value)}
                          className="border rounded px-1 py-0.5 text-xs"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        难度:
                        <select
                          value={c.difficulty}
                          onChange={(e) => updateCandidate(c.id, "difficulty", Number(e.target.value))}
                          className="border rounded px-1 py-0.5 text-xs"
                        >
                          {[1, 2, 3, 4, 5].map((d) => (
                            <option key={d} value={d}>{"★".repeat(d)}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={handleSave}
                disabled={saving || candidates.filter(c => c.kept).length === 0}
                className={`w-full py-2.5 rounded-lg text-white font-medium text-sm ${
                  saving || candidates.filter(c => c.kept).length === 0
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {saving ? "正在保存..." : `保存 ${candidates.filter(c => c.kept).length}/${candidates.length} 题到数据库`}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Simplified renderer for docx paragraph runs */
function RenderRun({ run }: { run: ParagraphRun }) {
  if (run.type === "formula") {
    return <span className="inline-math px-0.5 text-blue-600 font-mono text-xs">${run.latex}$</span>;
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

/* Inline tag input */
function TagInput({ onAdd, disabled }: { onAdd: (name: string) => void; disabled?: boolean }) {
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
        disabled={disabled}
        placeholder="输入知识点标签..."
        className="border rounded px-2 py-1 text-xs flex-1 disabled:bg-gray-100"
      />
      <button
        onClick={handleAdd}
        disabled={disabled || !value.trim()}
        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        添加
      </button>
    </div>
  );
}
