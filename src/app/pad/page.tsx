"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import katex from "katex";
import "katex/dist/katex.min.css";
import { usePadChannel } from "@/lib/pad-channel";

interface Stroke {
  color: string;
  width: number;
  erase: boolean;
  points: { x: number; y: number; w: number }[];
}

const W = 1200;
const H = 760;
const COLORS = ["#111111", "#dc2626", "#2563eb"];

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i - 1];
    const b = s.points[i];
    ctx.lineWidth = (a.w + b.w) / 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (s.points.length === 1) {
    const p = s.points[0];
    ctx.lineWidth = p.w;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y);
    ctx.stroke();
  }
  ctx.restore();
}

function redrawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, W, H);
  for (const s of strokes) drawStroke(ctx, s);
}

export default function PadPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>加载中…</div>}>
      <PadInner />
    </Suspense>
  );
}

function PadInner() {
  const searchParams = useSearchParams();
  const docId = searchParams.get("doc") || "";
  const [tab, setTab] = useState<"draw" | "formula">("draw");
  const [color, setColor] = useState(COLORS[0]);
  const [erasing, setErasing] = useState(false);
  const [latex, setLatex] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);

  const { connected, send } = usePadChannel(docId, "pad", useCallback(() => {}, []));

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (ctx) redrawAll(ctx, strokesRef.current);
  }, [tab]);

  function showToast(t: string, ms = 2200) {
    setToast(t);
    setTimeout(() => setToast(""), ms);
  }

  function getCtx() {
    return canvasRef.current?.getContext("2d") || null;
  }

  function toCanvasPos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
      w: erasing ? 40 : 2 + (e.pressure || 0.5) * 7,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") return; // 手指留给滚动/缩放，只用 Pencil 或鼠标画
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = toCanvasPos(e);
    currentRef.current = { color, width: p.w, erase: erasing, points: [p] };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawingRef.current || !currentRef.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const p = toCanvasPos(e);
    currentRef.current.points.push(p);
    redrawAll(ctx, [...strokesRef.current, currentRef.current]);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
    if (currentRef.current) {
      strokesRef.current = [...strokesRef.current, currentRef.current];
      currentRef.current = null;
    }
    const ctx = getCtx();
    if (ctx) redrawAll(ctx, strokesRef.current);
  }

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    const ctx = getCtx();
    if (ctx) redrawAll(ctx, strokesRef.current);
  }

  function clearAll() {
    strokesRef.current = [];
    const ctx = getCtx();
    if (ctx) redrawAll(ctx, strokesRef.current);
    setLatex("");
    setPreviewHtml("");
  }

  /** 导出白底 PNG（含 trim 去白边） */
  function exportPng(): string | null {
    const src = canvasRef.current;
    if (!src || strokesRef.current.length === 0) return null;
    const tmp = document.createElement("canvas");
    tmp.width = W;
    tmp.height = H;
    const tctx = tmp.getContext("2d")!;
    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, W, H);
    tctx.drawImage(src, 0, 0);
    // 简单去白边
    const img = tctx.getImageData(0, 0, W, H);
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4;
        if (img.data[i] < 245 || img.data[i + 1] < 245 || img.data[i + 2] < 245) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return null;
    const pad = 20;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W, maxX + pad); maxY = Math.min(H, maxY + pad);
    const cw = maxX - minX, ch = maxY - minY;
    const scale = Math.min(1, 1200 / cw);
    const out = document.createElement("canvas");
    out.width = Math.round(cw * scale);
    out.height = Math.round(ch * scale);
    const octx = out.getContext("2d")!;
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(tmp, minX, minY, cw, ch, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function insertImage() {
    const dataUrl = exportPng();
    if (!dataUrl) { showToast("先画点内容再插入"); return; }
    if (dataUrl.length > 3_500_000) { showToast("图太大了，画简单一点"); return; }
    if (send({ kind: "image", dataUrl })) {
      showToast("✓ 已发送到讲义");
      clearAll();
    } else showToast("连接断了，请稍候重试");
  }

  async function recognize() {
    const dataUrl = exportPng();
    if (!dataUrl) { showToast("先写一个公式"); return; }
    setBusy(true);
    try {
      const res = await fetch("/tiku/api/handwriting-to-formula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const d = await res.json();
      if (res.ok && d.data?.latex) {
        setLatex(d.data.latex);
        setPreviewHtml(katex.renderToString(d.data.latex, { throwOnError: false }));
      } else {
        showToast(d.error || "识别失败，重写或点重识别");
      }
    } catch {
      showToast("网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }

  function insertFormula() {
    if (!latex) { showToast("先识别出公式"); return; }
    if (send({ kind: "formula", latex })) {
      showToast("✓ 公式已插入讲义");
      clearAll();
    } else showToast("连接断了，请稍候重试");
  }

  if (!docId) {
    return <div style={{ padding: 40, textAlign: "center" }}>缺少 doc 参数。请从电脑编辑器页面复制 iPad 链接。</div>;
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "12px 20px", fontSize: 17, border: "none", borderRadius: 10, cursor: "pointer",
    background: active ? "#2563eb" : "#e2e8f0", color: active ? "#fff" : "#334155",
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 12, fontFamily: "system-ui", userSelect: "none" }}>
      {/* 顶栏 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <button style={btn(tab === "draw")} onClick={() => setTab("draw")}>✏️ 画图</button>
        <button style={btn(tab === "formula")} onClick={() => setTab("formula")}>∑ 写公式</button>
        <span style={{ marginLeft: "auto", fontSize: 14, color: connected ? "#16a34a" : "#dc2626" }}>
          {connected ? "● 已连接讲义" : "○ 连接中…"}
        </span>
      </div>

      {toast && (
        <div style={{
          position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)",
          background: "#1e293b", color: "#fff", padding: "10px 24px", borderRadius: 24,
          fontSize: 16, zIndex: 100,
        }}>
          {toast}
        </div>
      )}

      {/* 画布 */}
      <div style={{ border: "2px solid #cbd5e1", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: "100%", display: "block", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* 工具栏 */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => { setColor(c); setErasing(false); }}
            style={{
              width: 40, height: 40, borderRadius: "50%", background: c, cursor: "pointer",
              border: color === c && !erasing ? "3px solid #2563eb" : "2px solid #cbd5e1",
            }}
          />
        ))}
        <button onClick={() => setErasing(true)} style={btn(erasing)}>橡皮</button>
        <button onClick={undo} style={btn(false)}>↩ 撤销</button>
        <button onClick={clearAll} style={btn(false)}>清空</button>
        <span style={{ flex: 1 }} />
        {tab === "draw" ? (
          <button onClick={insertImage} style={{ ...btn(true), fontSize: 18, padding: "14px 28px" }}>
            ➤ 插入讲义
          </button>
        ) : (
          <button onClick={recognize} disabled={busy} style={{ ...btn(true), fontSize: 18, padding: "14px 28px" }}>
            {busy ? "识别中…" : "⌁ 识别公式"}
          </button>
        )}
      </div>

      {/* 公式预览区 */}
      {tab === "formula" && latex && (
        <div style={{
          marginTop: 14, padding: 16, background: "#f8fafc", borderRadius: 12,
          border: "1px solid #e2e8f0",
        }}>
          <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>识别结果（确认无误后插入）：</div>
          <div
            style={{ fontSize: 26, padding: "12px 0", textAlign: "center" }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8 }}>
            <button onClick={insertFormula} style={{ ...btn(true), background: "#16a34a", fontSize: 18, padding: "12px 32px" }}>
              ✓ 插入讲义
            </button>
            <button onClick={recognize} disabled={busy} style={btn(false)}>重识别</button>
          </div>
        </div>
      )}
    </div>
  );
}
