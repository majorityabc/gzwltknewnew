"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { Editor } from "@tiptap/react";
import katex from "katex";
import type { DocContent, DocParagraph, ParagraphRun } from "@/lib/docx-parser";
import { docParagraphsToTipTapJson } from "@/lib/tip-tap-converter";
import { GlobalToolbar } from "@/components/tiptap/global-toolbar";

import { VoiceInputButton, insertVoiceTextIntoEditor } from "@/components/voice-input-button";
import { MathFormulaModal } from "@/components/math-formula-modal";

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

// /api/problems/check-duplicate 返回的已存在题目信息
interface ExistingProblem {
  id: number;
  difficulty: number;
  lessonTitle: string | null;
  questionType: string | null;
  sourceDate: string | null;
  knowledgePoints: { id: number; name: string }[];
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Problem {
  id: number;
  paragraphs: DocParagraph[];
  content: string; // TipTap JSON 字符串，编辑器实时更新
  kept: boolean;
  textbookId: number | null;
  chapterId: number | null;
  tags: ProblemTag[];
  lessonTitle: string;
  questionType: string;
  difficulty: number;
  sourceDate: string;
  answer: string; // TipTap JSON 字符串
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
  const [loadingText, setLoadingText] = useState("正在解析试卷...");
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
  const answerEditors = useRef<Record<number, import("@tiptap/react").Editor | null>>({});
  const [mathTarget, setMathTarget] = useState<import("@tiptap/react").Editor | null>(null);
  const [ocrSec, setOcrSec] = useState<number | null>(null);
  const [editorActive, setEditorActive] = useState<Record<string, boolean>>({});
  const [showPreview, setShowPreview] = useState(true);
  const [errorDialog, setErrorDialog] = useState<{ message: string; detail?: string } | null>(null);
  const lastFileRef = useRef<File | null>(null);

  useEffect(() => {
    // 直接 Ctrl+V 粘贴截图：剪贴板里的图片直接进入识别流程
    const onPaste = (e: ClipboardEvent) => {
      if (loading) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) return;
          e.preventDefault();
          const ext = (item.type.split("/")[1] || "png").replace("jpeg", "jpg");
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const name = `截图_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.${ext}`;
          handleFileRef.current(new File([file], name, { type: item.type }));
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [loading]);

  useEffect(() => {
    // 「拍照转Word」页的分割入库入口：sessionStorage 交接识别结果
    try {
      const snap = sessionStorage.getItem("snapshot_doc");
      if (snap) {
        sessionStorage.removeItem("snapshot_doc");
        setParsedDoc(JSON.parse(snap));
      }
    } catch {}
  }, []);

  useEffect(() => {
    // 试卷库「拆题入库」入口：?fromPaper=<id> 自动载入试卷文件
    const params = new URLSearchParams(window.location.search);
    const fromPaper = params.get("fromPaper");
    if (fromPaper) {
      fetch(`/tiku/api/papers/${fromPaper}/download`)
        .then((r) => {
          if (!r.ok) throw new Error("试卷不存在");
          return r.blob();
        })
        .then(async (blob) => {
          // 从 Content-Disposition 拿原文件名
          const res = await fetch(`/tiku/api/papers/${fromPaper}/download`, { method: "HEAD" });
          const cd = res.headers.get("Content-Disposition") || "";
          const m = cd.match(/filename\*=UTF-8''(.+)/);
          const name = m ? decodeURIComponent(m[1]) : "paper.docx";
          const f = new File([blob], name, { type: blob.type });
          handleFileRef.current(f);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "载入试卷失败"));
    }
  }, []);

useEffect(() => {
    fetch("/tiku/api/textbooks")
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

  // 各章节已有知识点缓存：chapterId -> 知识点列表（打标签时点击快速添加）
  const [chapterKps, setChapterKps] = useState<Record<number, { id: number; name: string }[]>>({});
  useEffect(() => {
    const ids = Array.from(new Set(problems.map((p) => p.chapterId).filter((x): x is number => !!x)));
    const missing = ids.filter((id) => !(id in chapterKps));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (id) => {
          try {
            const res = await fetch(`/tiku/api/knowledge-points?chapterId=${id}`);
            const d = await res.json();
            return [id, (d.data || []).map((k: { id: number; name: string }) => ({ id: k.id, name: k.name }))] as const;
          } catch {
            return [id, []] as const;
          }
        }),
      );
      if (!cancelled) setChapterKps((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
  }, [problems, chapterKps]);

  const loadChapters = useCallback(async (textbookId: number) => {
    setChapters([]);
    const res = await fetch(`/tiku/api/chapters?textbookId=${textbookId}`);
    const d = await res.json();
    setChapters(d.data || []);
  }, []);

  const handleFileRef = useRef<(f: File) => void>(() => {});
  const handleFile = useCallback(async (file: File) => {
    const isDocx = file.name.toLowerCase().endsWith(".docx");
    const isImage = /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
    if (!isDocx && !isImage) {
      setError("请选择 .docx 文件或 .png/.jpg 图片");
      return;
    }
    setLoading(true);
    setLoadingText(isImage ? "正在识别图片中的题目（约需十几秒）..." : "正在解析试卷...");
    setError(null);
    setSplitIndices(new Set());
    setProblems([]);
    setSavedMsg(null);

    lastFileRef.current = file;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const endpoint = isImage ? "/tiku/api/ocr-image" : "/tiku/api/parse-docx";
      const res = await fetch(endpoint, { method: "POST", body: fd });
      // 响应不是 JSON（比如网关 HTML 错误页）时给出可读信息，而不是 Unexpected token
      let data: { data?: { jobId?: string; content?: unknown }; error?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(
          `上传请求异常（HTTP ${res.status}）——可能是网络波动或服务重启，请稍等几秒重试`,
        );
      }
      if (!res.ok) throw new Error(data.error || `请求失败（HTTP ${res.status}）`);

      if (isImage && data.data?.jobId) {
        // 后台任务模式：轮询进度（绕开网关超时）
        const jobId = data.data.jobId;
        const t0 = Date.now();
        const elapsed = () => Math.round((Date.now() - t0) / 1000);
        for (;;) {
          await new Promise((r) => setTimeout(r, 2500));
          const pr = await fetch(`/tiku/api/ocr-image?jobId=${jobId}`);
          let pd: { data?: { status?: string; stage?: string; error?: string; content?: unknown }; error?: string };
          try {
            pd = await pr.json();
          } catch {
            throw new Error(`查询识别进度失败（HTTP ${pr.status}），请检查网络后重试`);
          }
          if (!pr.ok) throw new Error(pd.error || `查询进度失败（HTTP ${pr.status}）`);
          const job = pd.data!;
          if (job.status === "done") {
            setParsedDoc(job.content as DocContent | null);
            setOcrSec(elapsed());
            break;
          }
          if (job.status === "error") {
            throw new Error(job.error || "识别失败");
          }
          if (job.stage) setLoadingText(`正在识别图片中的题目：${job.stage}…（已用时 ${elapsed()} 秒）`);
        }
      } else {
        setParsedDoc(((data.data?.content ?? (data as unknown as { content?: DocContent }).content) ?? null) as DocContent | null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "解析失败";
      setError(msg);
      setErrorDialog({ message: isImage ? "图片识别失败" : "试卷解析失败", detail: msg });
    } finally {
      setLoading(false);
    }
  }, []);
  handleFileRef.current = handleFile;

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
    const makeProblem = (paragraphs: DocParagraph[]): Problem => ({
      id: result.length + 1,
      paragraphs,
      content: JSON.stringify(docParagraphsToTipTapJson(paragraphs)),
      kept: true,
      textbookId: null,
      chapterId: null,
      tags: [],
      lessonTitle: "",
      questionType: "",
      difficulty: 3,
      sourceDate: todayStr(),
      answer: "",
    });
    parsedDoc.paragraphs.forEach((para, i) => {
      current.push(para);
      if (splitIndices.has(i)) {
        result.push(makeProblem(current));
        current = [];
      }
    });
    if (current.length > 0) {
      result.push(makeProblem(current));
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
      // 一次批量查重（按归一化内容哈希，服务端比对）
      const checkRes = await fetch("/tiku/api/problems/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: keptProblems.map((p) => p.content) }),
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

      for (let i = 0; i < keptProblems.length; i++) {
        const p = keptProblems[i];
        const existing = duplicateMap.get(i);

        if (existing) {
          const existingTagNames = existing.knowledgePoints
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
              `/tiku/api/knowledge-points?search=${encodeURIComponent(tag.name)}`,
            );
            const searchData = await searchRes.json();
            const found = searchData.data?.find(
              (kp: KnowledgePoint) => kp.name === tag.name,
            );
            if (found) {
              kpIds.push(found.id);
            } else {
              const createRes = await fetch("/tiku/api/knowledge-points", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chapterId: p.chapterId, name: tag.name }),
              });
              const createData = await createRes.json();
              kpIds.push(createData.data.id);
            }
          }

          await fetch(`/tiku/api/problems/${existing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: p.content,
              answer: p.answer || null,
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
              `/tiku/api/knowledge-points?search=${encodeURIComponent(tag.name)}`,
            );
            const searchData = await searchRes.json();
            const found = searchData.data?.find(
              (kp: KnowledgePoint) => kp.name === tag.name,
            );
            if (found) {
              kpIds.push(found.id);
            } else {
              const createRes = await fetch("/tiku/api/knowledge-points", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chapterId: p.chapterId, name: tag.name }),
              });
              const createData = await createRes.json();
              kpIds.push(createData.data.id);
            }
          }

          await fetch("/tiku/api/problems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{
              content: p.content,
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
              <input ref={fileInputRef} type="file" accept=".docx,.png,.jpg,.jpeg,.webp,.bmp" onChange={handleInputChange} className="hidden" />
              {loading ? (
                <div className="text-gray-500">
                  <div className="animate-spin inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-2" />
                  <p>{loadingText}</p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-lg text-gray-600">拖拽 .docx 试卷或题目图片到此处，或点击选择</p>
                  <p className="text-sm text-blue-500 mt-1">💡 截图后可直接按 Ctrl + V 粘贴上传</p>
                  <p className="text-sm text-gray-400 mt-2">支持 WPS / Microsoft Word 文档 · 支持拍照/截图，自动识别文字、希腊字母与公式</p>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setParsedDoc(null);
                    setSplitIndices(new Set());
                    setError(null);
                    setSavedMsg(null);
                    // 清掉 ?fromPaper 参数，避免刷新后再次自动载入
                    if (new URLSearchParams(window.location.search).get("fromPaper")) {
                      window.history.replaceState({}, "", "/tiku/upload");
                    }
                  }}
                  className="px-4 py-2 bg-white border text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
                >
                  取消
                </button>
                <button onClick={applySplits} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                  确认分割 → 标注标签
                </button>
                {ocrSec !== null && (
                  <span className="text-xs text-gray-400 self-center">本次识别用时 {ocrSec} 秒</span>
                )}
              </div>
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
                    {para.tableCells ? (
                      <table className="border-collapse w-full text-sm">
                        <tbody>
                          <tr>
                            {para.tableCells.map((cell, ci) => (
                              <td key={ci} className="border border-gray-300 px-2 py-1">
                                {cell.map((run, j) => <RenderRun key={j} run={run} />)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <p className="leading-relaxed text-base">
                        {para.runs.map((run, j) => (
                          <RenderRun key={j} run={run} />
                        ))}
                      </p>
                    )}
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
                      content={problem.content}
                      editable={true}
                      plain
                      onFocus={(editor) => setActiveEditor(editor)}
                      onChange={(_html, json) =>
                        updateProblem(problem.id, "content", JSON.stringify(json))
                      }
                    />

                    {/* 答案区（可语音输入） */}
                    <div className="border-t border-dashed border-gray-200 bg-amber-50/40">
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
                        onFocus={(editor) => setActiveEditor(editor)}
                        onEditorReady={(editor) => { answerEditors.current[problem.id] = editor; }}
                        onChange={(_html, json) =>
                          updateProblem(problem.id, "answer", JSON.stringify(json))
                        }
                      />
                    </div>

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
                        {(() => {
                          const kps = problem.chapterId ? chapterKps[problem.chapterId] || [] : [];
                          const notAdded = kps.filter((kp) => !problem.tags.some((t) => t.name === kp.name));
                          if (notAdded.length === 0) return null;
                          return (
                            <div className="mt-1.5">
                              <div className="text-[10px] text-gray-400 mb-1">本章知识点（点击添加）：</div>
                              <div className="flex flex-wrap gap-1">
                                {notAdded.map((kp) => (
                                  <button
                                    key={kp.id}
                                    onClick={() => addTag(problem.id, kp.name)}
                                    className="px-2 py-0.5 bg-white border border-blue-200 text-blue-600 rounded text-xs hover:bg-blue-50 hover:border-blue-400 transition-colors"
                                  >
                                    ＋ {kp.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setProblems([]);
                        setParsedDoc(null);
                        setSplitIndices(new Set());
                        setError(null);
                        setSavedMsg(null);
                        setShowPreview(false);
                        // 清掉 ?fromPaper 参数，避免刷新后再次自动载入
                        if (new URLSearchParams(window.location.search).get("fromPaper")) {
                          window.history.replaceState({}, "", "/tiku/upload");
                        }
                      }}
                      disabled={saving}
                      className="w-28 py-2.5 rounded-lg border text-gray-600 font-medium text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={saveToDatabase}
                      disabled={saving}
                      className={`flex-1 py-2.5 rounded-lg text-white font-medium text-sm transition-colors ${
                        saving ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                      }`}
                    >
                      {saving ? "正在保存..." : `保存全部 ${keptProblems.length} 题到数据库`}
                    </button>
                  </div>
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
                          {para.tableCells ? (
                            para.tableCells.map((cell, ci) => (
                              <span key={"c" + ci} className="inline-block border border-gray-300 rounded px-1.5 py-0.5 mr-1 bg-gray-50 align-middle">
                                {cell.map((run, j) => <RenderRun key={j} run={run} />)}
                              </span>
                            ))
                          ) : (
                            para.runs.map((run, j) => (
                              <RenderRun key={j} run={run} />
                            ))
                          )}
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

      {/* 错误弹窗：具体原因 + 一键重试 */}
      {errorDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setErrorDialog(null)}>
          <div className="bg-white rounded-xl p-6 w-[460px] max-w-[92vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="text-3xl">⚠️</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-800">{errorDialog.message}</h3>
                <p className="text-sm text-red-600 mt-2 leading-relaxed break-all">{errorDialog.detail}</p>
                <p className="text-xs text-gray-400 mt-2">
                  提示：网络波动或服务升级瞬间可能出现此错误，通常点击重试即可恢复。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setErrorDialog(null)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                关闭
              </button>
              {lastFileRef.current && (
                <button
                  onClick={() => {
                    const f = lastFileRef.current;
                    setErrorDialog(null);
                    if (f) handleFileRef.current(f);
                  }}
                  className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
                >
                  重试
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 可视化公式编辑器（答案区） */}
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
