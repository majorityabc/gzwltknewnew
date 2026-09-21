"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import katex from "katex";
import type { DocContent, DocParagraph, ParagraphRun } from "@/lib/docx-parser";
import FigureReview from "@/components/figure-review";
import dynamic from "next/dynamic";
import { VoiceInputButton, insertVoiceTextIntoEditor } from "@/components/voice-input-button";
import { MathFormulaModal } from "@/components/math-formula-modal";

const RichTextEditor = dynamic(
  () => import("@/components/tiptap/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false },
);
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
  answer: string;
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

interface BatchItem {
  id: number;
  file: File;
  url: string;
  status: "processing" | "done" | "error";
  text: string;
  progress: number;
  content?: DocContent;
}

export function UploadModal({ open, onClose, textbookId, chapterId, chapterTitle, kpId, kpName, onSaved }: UploadModalProps) {
  const answerEditors = useRef<Record<number, import("@tiptap/react").Editor | null>>({});
  const [mathTarget, setMathTarget] = useState<import("@tiptap/react").Editor | null>(null);
  const [parsedDoc, setParsedDoc] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitIndices, setSplitIndices] = useState<Set<number>>(new Set());
  const [problems, setProblems] = useState<ModalProblem[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [loadingText, setLoadingText] = useState("正在解析试卷...");
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const batchIdRef = useRef(0);
  const handleFileRef = useRef<(fs: File[]) => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setParsedDoc(null);
    setLoading(false);
    setError(null);
    setSplitIndices(new Set());
    setProblems([]);
    setSaving(false);
    setSavedCount(null);
    setBatch((prev) => {
      prev.forEach((b) => URL.revokeObjectURL(b.url));
      return [];
    });
  }, []);

  const handleClose = useCallback(() => {
    // 有识别/编辑内容时二次确认，防误关丢失
    const hasWork =
      parsedDoc !== null ||
      batch.length > 0 ||
      problems.length > 0;
    if (hasWork && !saving && savedCount === null) {
      if (!window.confirm("当前有未保存的题目内容，关闭后将丢失。确定关闭吗？")) return;
    }
    reset();
    onClose();
  }, [onClose, reset, parsedDoc, batch.length, problems.length, saving, savedCount]);

  // ── Upload & Parse ──

  // 批量识别一张题图（每张=一题）
  const recognizeBatchImage = useCallback(async (item: BatchItem) => {
    const update = (patch: Partial<BatchItem>) =>
      setBatch((prev) => prev.map((b) => (b.id === item.id ? { ...b, ...patch } : b)));
    update({ status: "processing", text: "上传中...", progress: 0 });
    const t0 = Date.now();
    const elapsed = () => Math.round((Date.now() - t0) / 1000);
    try {
      const fd = new FormData();
      fd.append("file", item.file);
      const res = await fetch("/tiku/api/ocr-image", { method: "POST", body: fd });
      let data: { data?: { jobId?: string }; error?: string };
      try { data = await res.json(); } catch {
        throw new Error(`上传请求异常（HTTP ${res.status}），请稍等几秒重试`);
      }
      if (!res.ok) throw new Error(data.error || "识别失败");
      const jobId = data.data?.jobId;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const pr = await fetch(`/tiku/api/ocr-image?jobId=${jobId}`);
        let pd: { data?: { status?: string; stage?: string; progress?: number; error?: string; content?: unknown }; error?: string };
        try { pd = await pr.json(); } catch {
          throw new Error(`查询识别进度失败（HTTP ${pr.status}），请检查网络后重试`);
        }
        if (!pr.ok) throw new Error(pd.error || "查询进度失败");
        const job = pd.data!;
        if (job.status === "done") {
          const c = job.content as DocContent;
          for (const para of c.paragraphs || []) {
            for (const r of para.runs || []) {
              const anyR = r as unknown as { type?: string; fig?: { originUrl?: string } };
              if (anyR.type === "image" && anyR.fig) anyR.fig.originUrl = item.url;
            }
          }
          update({ status: "done", text: `识别完成 · 用时 ${elapsed()} 秒（${c.paragraphs?.length || 0} 段）`, progress: 100, content: c });
          break;
        }
        if (job.status === "error") throw new Error(job.error || "识别失败");
        update({ text: `${job.stage || "识别中..."} · ${elapsed()}s`, progress: job.progress ?? 0 });
      }
    } catch (e) {
      update({ status: "error", text: e instanceof Error ? e.message : "识别失败" });
    }
  }, []);

  // 批量入口
  const handleFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const docx = files.find((f) => f.name.toLowerCase().endsWith(".docx"));
    const imgs = files.filter((f) => /\.(png|jpe?g|webp|bmp)$/i.test(f.name));
    if (docx) {
      setError(null);
      setLoading(true);
      setLoadingText("正在解析试卷...");
      setSplitIndices(new Set());
      setProblems([]);
      setSavedCount(null);
      setBatch((prev) => { prev.forEach((b) => URL.revokeObjectURL(b.url)); return []; });
      try {
        const fd = new FormData();
        fd.append("file", docx);
        const res = await fetch("/tiku/api/parse-docx", { method: "POST", body: fd });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "解析失败");
        }
        const d = await res.json();
        setParsedDoc(d.content);
      } catch (e) {
        setError(e instanceof Error ? e.message : "解析失败");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!imgs.length) {
      setError("请选择 .docx 试卷或 .png/.jpg 题目图片");
      return;
    }
    setError(null);
    setSplitIndices(new Set());
    setProblems([]);
    setSavedCount(null);
    const items: BatchItem[] = imgs.slice(0, 20).map((f) => ({
      id: ++batchIdRef.current,
      file: f,
      url: URL.createObjectURL(f),
      status: "processing",
      text: "排队中...",
      progress: 0,
    }));
    setBatch((prev) => [...prev, ...items].slice(0, 20));
    items.forEach((it) => { void recognizeBatchImage(it); });
  }, [recognizeBatchImage]);
  handleFileRef.current = handleFiles;

  // 批量合并 → 分割预览（相邻两图之间自动打分割点 = 每图一题）
  const mergeBatch = useCallback(() => {
    const done = batch.filter((b) => b.status === "done" && b.content);
    if (!done.length) return;
    const paragraphs: DocParagraph[] = [];
    const splits = new Set<number>();
    done.forEach((it, i) => {
      if (i > 0) splits.add(paragraphs.length - 1);
      paragraphs.push(...(it.content!.paragraphs || []));
    });
    setSplitIndices(splits);
    setParsedDoc({ paragraphs });
  }, [batch]);

  // 不自动进分割页：等用户点「开始分割」，避免第一张识别完就锁定、后续粘贴被拒收

  // Ctrl+V 直接粘贴截图（弹窗打开且空闲时生效；粘贴文字不受影响）
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      if (loading || parsedDoc) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (!f) return;
          e.preventDefault();
          const ext = (it.type.split("/")[1] || "png").replace("jpeg", "jpg");
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const name = `截图_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.${ext}`;
          handleFileRef.current([new File([f], name, { type: it.type })]);
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open, loading, parsedDoc]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files || []));
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
    e.target.value = "";
  }, [handleFiles]);

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
          answer: "",
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
        answer: "",
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
      const checkRes = await fetch("/tiku/api/problems/check-duplicate", {
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
          const searchRes = await fetch(`/tiku/api/knowledge-points?search=${encodeURIComponent(tag.name)}`);
          const searchData = await searchRes.json();
          const found = searchData.data?.find(
            (kp: { id: number; name: string }) => kp.name === tag.name,
          );
          if (found) {
            if (!kpIds.includes(found.id)) kpIds.push(found.id);
          } else {
            const createRes = await fetch("/tiku/api/knowledge-points", {
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

          await fetch(`/tiku/api/problems/${existing.id}`, {
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
          await fetch("/tiku/api/problems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{
              content: contentStr,
              answer: p.answer || null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
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
              <input ref={fileInputRef} type="file" accept=".docx,.png,.jpg,.jpeg,.webp,.bmp" multiple onChange={handleInputChange} className="hidden" />
              <div className="text-4xl mb-3">📄</div>
              <p className="text-lg text-gray-600">拖拽 .docx 试卷或题目图片到此处，或点击选择（图片可多选）</p>
              <p className="text-sm text-blue-500 mt-1">💡 截图后可连续按 Ctrl + V 粘贴多题，每张图=一道题</p>
              <p className="text-sm text-gray-400 mt-2">题目将自动归类到「{kpName}」</p>
            </div>
          )}

          {/* 批量题图队列 */}
          {batch.length > 0 && !parsedDoc && (
            <div className="mt-4 space-y-2">
              {batch.map((b) => (
                <div key={b.id} className="border rounded-lg px-3 py-2 flex items-center gap-3 text-sm bg-white">
                  <span className="text-lg">{b.status === "done" ? "✅" : b.status === "error" ? "❌" : "⏳"}</span>
                  <span className="flex-1 truncate text-gray-700">{b.file.name}</span>
                  {b.status === "processing" && (
                    <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(3, b.progress)}%` }} />
                    </div>
                  )}
                  <span className={`text-xs ${b.status === "error" ? "text-red-500" : "text-gray-400"}`}>
                    {b.status === "processing" ? `${b.text} · ${b.progress}%` : b.text}
                  </span>
                  {b.status === "error" && (
                    <button onClick={() => void recognizeBatchImage(b)} className="text-xs text-blue-500 hover:underline">重试</button>
                  )}
                  <button
                    onClick={() => { URL.revokeObjectURL(b.url); setBatch((prev) => prev.filter((x) => x.id !== b.id)); }}
                    className="text-xs text-gray-300 hover:text-red-500"
                    title="移除"
                  >✕</button>
                </div>
              ))}
              {(() => {
                const doneN = batch.filter((b) => b.status === "done").length;
                const busyN = batch.filter((b) => b.status === "processing").length;
                const errN = batch.length - doneN - busyN;
                if (busyN > 0) {
                  return <p className="text-xs text-gray-400 pt-1">识别中… 已完成 {doneN}/{batch.length}（识别期间可继续粘贴下一题）</p>;
                }
                if (doneN > 0) {
                  return (
                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={mergeBatch} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium">
                        开始分割（{doneN} 张图 → 每图一题{errN > 0 ? `，跳过失败 ${errN} 张` : ""}）
                      </button>
                      <button onClick={reset} className="px-3 py-2 border rounded-lg text-sm text-gray-500 hover:bg-gray-50">清空重来</button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {loading && (
            <div className="text-center py-16">
              <div className="animate-spin inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-3" />
              <p className="text-gray-500">{loadingText}</p>
            </div>
          )}

          {/* Stage 2: Split */}
          {parsedDoc && problems.length === 0 && (
            <div>
              <FigureReview
                paragraphs={parsedDoc.paragraphs}
                onChange={(np) => setParsedDoc({ ...parsedDoc, paragraphs: np })}
              />
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

                  {/* 答案（语音/公式/图片，识别完即可填写） */}
                  {problem.kept && (
                    <div className="border-t border-dashed border-amber-200 bg-amber-50/40">
                      <div className="px-4 pt-2 pb-1 flex items-center gap-2">
                        <span className="text-xs text-amber-700 font-medium">答案</span>
                        <VoiceInputButton
                          onResult={(text) => {
                            const ed = answerEditors.current[problem.id];
                            if (ed) insertVoiceTextIntoEditor(ed, text);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setMathTarget(answerEditors.current[problem.id] || null)}
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
                              const ed = answerEditors.current[problem.id];
                              if (!ed) return;
                              const reader = new FileReader();
                              reader.onloadend = () => ed.chain().focus().setImage({ src: reader.result as string }).run();
                              reader.readAsDataURL(f);
                            }}
                          />
                        </label>
                      </div>
                      <RichTextEditor
                        content={problem.answer || ""}
                        editable={true}
                        plain
                        onEditorReady={(editor) => { answerEditors.current[problem.id] = editor; }}
                        onChange={(_html, json) => updateProblem(problem.id, "answer", JSON.stringify(json))}
                      />
                    </div>
                  )}

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

      <MathFormulaModal
        open={mathTarget !== null}
        onCancel={() => setMathTarget(null)}
        onConfirm={(latex) => {
          mathTarget?.chain().focus().setInlineMath(latex).run();
          setMathTarget(null);
        }}
      />
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
