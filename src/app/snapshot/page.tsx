"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocContent, DocParagraph, ParagraphRun } from "@/lib/docx-parser";
import { docParagraphsToTipTapJson } from "@/lib/tip-tap-converter";
import { exportBlocksToDocxDownload } from "@/lib/export-docx";
import FigureReview from "@/components/figure-review";

/** 拍照转 Word（快速组卷）：多张照片 → kimi 识别 → 直接导出 Word / 分割入库 */

interface ImageItem {
  id: number;
  file: File;
  url: string;
  status: "pending" | "processing" | "done" | "error";
  text: string;
  progress: number;
}

let uid = 0;

export default function SnapshotPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paragraphs, setParagraphs] = useState<DocParagraph[] | null>(null);
  const [title, setTitle] = useState("");
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: File[]) => {
      if (busy) return;
      const imgs = files.filter(
        (f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(f.name),
      );
      if (!imgs.length) return;
      setImages((prev) => {
        const next = [...prev, ...imgs.map((f) => ({ id: ++uid, file: f, url: URL.createObjectURL(f), status: "pending" as const, text: "等待识别", progress: 0 }))];
        return next.slice(0, 10); // 上限 10 张
      });
    },
    [busy],
  );

  // Ctrl+V 粘贴截图
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (paragraphs || busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            const ext = (it.type.split("/")[1] || "png").replace("jpeg", "jpg");
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            files.push(
              new File([f], `截图_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.${ext}`, { type: it.type }),
            );
          }
        }
      }
      if (files.length) addFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles, paragraphs, busy]);

  const updateItem = (id: number, patch: Partial<ImageItem>) =>
    setImages((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const recognizeOne = async (item: ImageItem): Promise<DocContent | null> => {
    updateItem(item.id, { status: "processing", text: "上传中..." });
    const fd = new FormData();
    fd.append("file", item.file);
    const res = await fetch("/tiku/api/ocr-image", { method: "POST", body: fd });
    let data: { data?: { jobId?: string }; error?: string };
    try {
      data = await res.json();
    } catch {
      throw new Error(`上传请求异常（HTTP ${res.status}）`);
    }
    if (!res.ok) throw new Error(data.error || "上传失败");
    const jobId = data.data?.jobId!;
    const t0 = Date.now();
    const elapsed = () => Math.round((Date.now() - t0) / 1000);
    for (;;) {
      await new Promise((r) => setTimeout(r, 2500));
      updateItem(item.id, { text: `识别中... · ${elapsed()}s` });
      const pr = await fetch(`/tiku/api/ocr-image?jobId=${jobId}`);
      let pd: { data?: { status?: string; stage?: string; progress?: number; error?: string; warnings?: string[]; content?: DocContent }; error?: string };
      try {
        pd = await pr.json();
      } catch {
        throw new Error("查询进度失败（网络波动）");
      }
      if (!pr.ok) throw new Error(pd.error || "查询进度失败");
      const job = pd.data!;
      if (job.status === "done") {
        updateItem(item.id, { text: job.warnings?.length ? `${job.warnings[0]}（用时 ${elapsed()} 秒）` : `识别完成 · 用时 ${elapsed()} 秒` });
        return job.content || null;
      }
      if (job.status === "error") throw new Error(job.error || "识别失败");
      updateItem(item.id, { text: `${job.stage || "识别中..."} · ${elapsed()}s`, progress: job.progress || 0 });
    }
  };

  const start = async () => {
    const todo = images.filter((it) => it.status === "pending");
    if (!todo.length) return;
    setBusy(true);
    setNote(null);
    const collected: DocParagraph[] = [];
    let failCount = 0;
    for (let i = 0; i < todo.length; i++) {
      const it = todo[i];
      updateItem(it.id, { text: `排队中（第 ${i + 1}/${todo.length} 张）` });
      try {
        const content = await recognizeOne(it);
        if (content?.paragraphs) {
          for (const para of content.paragraphs) {
            for (const r of para.runs || []) {
              const anyR = r as unknown as { type?: string; fig?: { originUrl?: string } };
              if (anyR.type === "image" && anyR.fig) anyR.fig.originUrl = it.url;
            }
          }
          collected.push(...content.paragraphs);
        }
        const figN = (content?.paragraphs || []).reduce(
          (n, pp) => n + (pp.runs || []).filter((rr: { type?: string }) => rr.type === "image").length,
          0,
        );
        updateItem(it.id, { status: "done", text: `完成（${content?.paragraphs.length || 0} 段 · ${figN} 图）` });
      } catch (e) {
        failCount++;
        updateItem(it.id, { status: "error", text: e instanceof Error ? e.message : "识别失败" });
      }
    }
    setBusy(false);
    if (collected.length === 0) {
      setNote("所有图片识别失败，请重试或换更清晰的图片");
      return;
    }
    setParagraphs((prev) => {
      const base = prev ? [...prev] : [];
      return [...base, ...collected];
    });
    if (failCount > 0) setNote(`${failCount} 张识别失败，已跳过；其余结果见下方预览`);
  };

  const deleteParagraph = (idx: number) =>
    setParagraphs((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));

  const updateRunText = (pIdx: number, rIdx: number, text: string) =>
    setParagraphs((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const para = { ...next[pIdx] };
      const runs = [...(para.runs || [])];
      const run = runs[rIdx];
      if (run && run.type === "text") runs[rIdx] = { ...run, text };
      para.runs = runs;
      next[pIdx] = para;
      return next;
    });

  const handleExport = async () => {
    if (!paragraphs?.length) return;
    setExporting(true);
    try {
      const doc = docParagraphsToTipTapJson(paragraphs) as { type: string; content?: unknown[] };
      const blocks = (doc.content || []) as Parameters<typeof exportBlocksToDocxDownload>[1];
      await exportBlocksToDocxDownload(title.trim(), blocks);
    } catch (e) {
      setNote(e instanceof Error ? `导出失败：${e.message}` : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const goSplit = () => {
    if (!paragraphs) return;
    sessionStorage.setItem("snapshot_doc", JSON.stringify({ paragraphs }));
    window.location.href = "/tiku/upload";
  };

  const reset = () => {
    setImages([]);
    setParagraphs(null);
    setNote(null);
    setTitle("");
  };

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24">
      {/* 顶部 */}
      <div className="flex items-center gap-3 mb-4">
        <a href="/tiku" className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          ← 返回
        </a>
        <h1 className="text-xl font-bold text-gray-800">📷 拍照转 Word（快速组卷）</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        上传试卷/题目的照片（可拖拽、点选或 <span className="text-blue-500 font-medium">Ctrl+V 粘贴截图</span>，最多 10 张，按顺序拼接）→ 自动识别 → 直接导出 Word，无需入库。
      </p>

      {/* 上传区 */}
      {!paragraphs && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(Array.from(e.dataTransfer.files || []));
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-4 ${
              dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300"
            }`}
          >
            <div className="text-4xl mb-2">📷</div>
            <p className="text-lg text-gray-600">拖拽照片到此处，或点击选择（可多选）</p>
            <p className="text-sm text-blue-500 mt-1">💡 截图后可直接按 Ctrl + V 粘贴</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.bmp"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
          </div>

          {/* 图片清单与进度 */}
          {images.length > 0 && (
            <div className="space-y-2 mb-4">
              {images.map((it, i) => (
                <div key={it.id} className="bg-white border rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-gray-400 w-6">#{i + 1}</span>
                  <span className="text-2xl">
                    {it.status === "done" ? "✅" : it.status === "error" ? "❌" : it.status === "processing" ? "⏳" : "🖼️"}
                  </span>
                  <span className="flex-1 truncate text-gray-700">{it.file.name}</span>
                  <span className={`text-xs ${it.status === "error" ? "text-red-500" : "text-gray-400"}`}>{it.status === "processing" ? `${it.text} · ${it.progress}%` : it.text}</span>
                  {it.status === "processing" && (
                    <div className="w-40 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(3, it.progress)}%` }} />
                    </div>
                  )}
                  {!busy && it.status !== "done" && (
                    <button
                      onClick={() => setImages((prev) => prev.filter((x) => x.id !== it.id))}
                      className="text-xs text-gray-400 hover:text-red-500 px-2"
                    >
                      移除
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={start}
              disabled={busy || images.filter((i) => i.status === "pending").length === 0}
              className="px-5 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:bg-gray-300"
            >
              {busy ? "识别中（每张约 1~3 分钟，请勿关闭页面）..." : `开始识别（${images.filter((i) => i.status === "pending").length} 张）`}
            </button>
            {images.length > 0 && !busy && (
              <button onClick={reset} className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                清空
              </button>
            )}
          </div>
        </>
      )}

      {note && <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">{note}</div>}

      {/* 预览与导出 */}
      {paragraphs && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="卷子标题（如：2026届期末物理模拟卷）"
              className="flex-1 min-w-[240px] px-3 py-2 border rounded-lg text-sm"
            />
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300"
            >
              {exporting ? "生成中..." : "📥 导出 Word"}
            </button>
            <button onClick={goSplit} className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600">
              ✂️ 分割入库
            </button>
            <button onClick={reset} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              重新开始
            </button>
          </div>
          <FigureReview paragraphs={paragraphs} onChange={setParagraphs} />
          <p className="text-xs text-gray-400 mb-3">
            共 {paragraphs.length} 段 · 文字可直接点击修改；发现跨页断开的题目，请在预览里缝合（改文字）或导出后在 Word 里调整 · 公式与插图不可编辑
          </p>

          <div className="space-y-1.5">
            {paragraphs.map((para, pi) => (
              <div key={pi} className="bg-white border rounded-lg px-4 py-2.5 flex items-start gap-3 group">
                <span className="text-xs text-gray-300 pt-1 w-6 flex-shrink-0">{pi + 1}</span>
                <div className="flex-1 text-sm text-gray-800 leading-relaxed break-all">
                  {(para.runs || []).map((run: ParagraphRun, ri) =>
                    run.type === "text" ? (
                      <span
                        key={ri}
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updateRunText(pi, ri, e.currentTarget.textContent || "")}
                        className="outline-none focus:bg-blue-50 rounded px-0.5"
                      >
                        {run.text}
                      </span>
                    ) : run.type === "formula" ? (
                      <span key={ri} className="mx-1 px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded font-mono text-xs" title="公式（不可编辑）">
                        ${run.latex}$
                      </span>
                    ) : run.type === "image" ? (
                      <img
                        key={ri}
                        src={run.src}
                        alt="插图"
                        className="max-w-[360px] max-h-[220px] my-1 mx-auto block rounded border"
                      />
                    ) : null,
                  )}
                </div>
                <button
                  onClick={() => deleteParagraph(pi)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-400 hover:text-red-500 px-1 pt-1 flex-shrink-0"
                  title="删除此段"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
