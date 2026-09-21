"use client";

import { useEffect, useRef, useState } from "react";
import type { DocParagraph } from "@/lib/docx-parser";

/** 示意图审阅：AI 重画 vs 原图裁剪 vs 用户手动裁剪，由用户挑最终版本 */

export interface FigMeta {
  box?: number[]; // 归一化 0-1000 [x1,y1,x2,y2]
  cropSrc?: string;
  originUrl?: string; // 原始上传图（objectURL），由调用方注入
}

interface FigEntry {
  pi: number;
  ri: number;
  src: string;
  fig: FigMeta;
}

function scanFigures(paragraphs: DocParagraph[]): FigEntry[] {
  const out: FigEntry[] = [];
  paragraphs.forEach((p, pi) => {
    (p.runs || []).forEach((r, ri) => {
      const anyR = r as unknown as { type?: string; src?: string; fig?: FigMeta };
      if (anyR.type === "image" && anyR.src && anyR.fig) {
        out.push({ pi, ri, src: anyR.src, fig: anyR.fig });
      }
    });
  });
  return out;
}

interface CropModalProps {
  fig: FigMeta;
  currentSrc: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string, box: number[]) => void;
}

function CropModal({ fig, currentSrc, onCancel, onConfirm }: CropModalProps) {
  const [rect, setRect] = useState(() => {
    const b = fig.box;
    if (b && b.length === 4) return { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] };
    return { x: 200, y: 250, w: 600, h: 500 };
  });
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; sx: number; sy: number; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      const img = imgRef.current;
      if (!d || !img) return;
      const scaleW = 1000 / img.clientWidth;
      const scaleH = 1000 / img.clientHeight;
      const dx = (e.clientX - d.sx) * scaleW;
      const dy = (e.clientY - d.sy) * scaleH;
      setRect((prev) => {
        if (d.mode === "move") {
          return {
            x: Math.min(1000 - d.rect.w, Math.max(0, d.rect.x + dx)),
            y: Math.min(1000 - d.rect.h, Math.max(0, d.rect.y + dy)),
            w: d.rect.w,
            h: d.rect.h,
          };
        }
        return {
          x: d.rect.x,
          y: d.rect.y,
          w: Math.min(1000 - d.rect.x, Math.max(40, d.rect.w + dx)),
          h: Math.min(1000 - d.rect.y, Math.max(40, d.rect.h + dy)),
        };
      });
    };
    const onUp = () => (dragRef.current = null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const doCrop = async () => {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    try {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const sx = (rect.x / 1000) * nw;
      const sy = (rect.y / 1000) * nh;
      const sw = (rect.w / 1000) * nw;
      const sh = (rect.h / 1000) * nh;
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(sw));
      c.height = Math.max(1, Math.round(sh));
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/png");
      onConfirm(url, [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">✂️ 手动裁剪示意图</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-400 mb-2">拖动方框移动位置，拖右下角 ▪ 调整大小</p>
        <div className="relative inline-block select-none">
          <img
            ref={imgRef}
            src={fig.originUrl || currentSrc}
            alt="原图"
            className="max-w-full max-h-[55vh] block rounded border"
            draggable={false}
          />
          <div
            className="absolute border-2 border-blue-500 bg-blue-500/10 cursor-move"
            style={{
              left: `${rect.x / 10}%`,
              top: `${rect.y / 10}%`,
              width: `${rect.w / 10}%`,
              height: `${rect.h / 10}%`,
            }}
            onMouseDown={(e) => {
              dragRef.current = { mode: "move", sx: e.clientX, sy: e.clientY, rect: { ...rect } };
            }}
          >
            <div
              className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-blue-500 rounded-sm cursor-se-resize"
              onMouseDown={(e) => {
                e.stopPropagation();
                dragRef.current = { mode: "resize", sx: e.clientX, sy: e.clientY, rect: { ...rect } };
              }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
          <button
            onClick={doCrop}
            disabled={busy}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:bg-gray-300"
          >
            {busy ? "裁剪中..." : "确认使用此裁剪"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FigureReviewProps {
  paragraphs: DocParagraph[] | null;
  onChange: (next: DocParagraph[]) => void;
}

export default function FigureReview({ paragraphs, onChange }: FigureReviewProps) {
  const [cropIdx, setCropIdx] = useState<number | null>(null);
  const [pasteIdx, setPasteIdx] = useState<number | null>(null);
  const figures = paragraphs ? scanFigures(paragraphs) : [];

  // 「粘贴替换」模式：点击后下一次 Ctrl+V 的图片替换该图
  useEffect(() => {
    if (pasteIdx === null) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (!f) return;
          e.preventDefault();
          const reader = new FileReader();
          reader.onloadend = () => {
            const target = figures[pasteIdx];
            if (target && paragraphs) {
              const next = paragraphs.map((p, pi) =>
                pi === target.pi
                  ? { ...p, runs: (p.runs || []).map((r, ri) => (ri === target.ri ? ({ ...r, src: reader.result as string, fig: target.fig } as unknown as typeof r) : r)) }
                  : p,
              );
              onChange(next);
            }
            setPasteIdx(null);
          };
          reader.readAsDataURL(f);
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [pasteIdx, figures, paragraphs, onChange]);

  if (!paragraphs || figures.length === 0) return null;

  const apply = (pi: number, ri: number, src: string, fig: FigMeta) => {
    const next = paragraphs.map((p, i) =>
      i === pi
        ? { ...p, runs: (p.runs || []).map((r, j) => (j === ri ? ({ ...r, src, fig } as unknown as typeof r) : r)) }
        : p,
    );
    onChange(next);
  };

  return (
    <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">
        🖼 示意图确认（{figures.length} 张）
      </h3>
      <p className="text-xs text-gray-400 mb-3">已自动从原图裁剪；不满意可「✏️自己裁剪」微调，或「📋粘贴替换」直接贴入新图。</p>
      <div className="space-y-3">
        {figures.map((f, idx) => {
          const chosenCrop = f.fig.cropSrc && f.src === f.fig.cropSrc;
          const isManual = !chosenCrop;
          return (
            <div key={`${f.pi}-${f.ri}`} className="bg-white border rounded-lg p-3 flex flex-wrap items-center gap-3">
              <span className="text-xs text-gray-400 w-10">图 {idx + 1}</span>
              {f.fig.cropSrc && (
                <button
                  onClick={() => apply(f.pi, f.ri, f.fig.cropSrc!, f.fig)}
                  className={`relative rounded border-2 p-1 transition-all ${chosenCrop ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200 hover:border-blue-300"}`}
                  title="原图裁剪版（保真）"
                >
                  <img src={f.fig.cropSrc} alt="裁剪版" className="max-w-[150px] max-h-[100px] rounded" />
                  <span className="block text-[10px] mt-1 text-gray-500">✂️ 原图裁剪{chosenCrop ? " ✓" : ""}</span>
                </button>
              )}
              {isManual && f.src && (
                <div className="rounded border-2 border-blue-500 p-1 ring-2 ring-blue-200">
                  <img src={f.src} alt="手动裁剪版" className="max-w-[150px] max-h-[100px] rounded" />
                  <span className="block text-[10px] mt-1 text-gray-500">✏️ 手动裁剪 ✓</span>
                </div>
              )}
              {f.fig.originUrl && (
                <button
                  onClick={() => setCropIdx(idx)}
                  className="px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                >
                  ✏️ 自己裁剪
                </button>
              )}
              <button
                onClick={() => setPasteIdx(pasteIdx === idx ? null : idx)}
                className={`px-3 py-1.5 border rounded-lg text-xs ${
                  pasteIdx === idx
                    ? "border-blue-500 bg-blue-50 text-blue-600 font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {pasteIdx === idx ? "⌨️ 现在按 Ctrl+V 粘贴…（再点取消）" : "📋 粘贴替换"}
              </button>
            </div>
          );
        })}
      </div>
      {cropIdx !== null && figures[cropIdx] && (
        <CropModal
          fig={figures[cropIdx].fig}
          currentSrc={figures[cropIdx].src}
          onCancel={() => setCropIdx(null)}
          onConfirm={(dataUrl, box) => {
            const f = figures[cropIdx];
            apply(f.pi, f.ri, dataUrl, { ...f.fig, box });
            setCropIdx(null);
          }}
        />
      )}
    </div>
  );
}
