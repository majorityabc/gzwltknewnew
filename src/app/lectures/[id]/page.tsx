"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { RichTextEditor } from "@/components/tiptap/rich-text-editor";
import { GlobalToolbar } from "@/components/tiptap/global-toolbar";
import { usePadChannel, type PadMessage } from "@/lib/pad-channel";

export default function LectureEditPage() {
  const params = useParams();
  const docId = String(params.id);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<string | null>(null);
  const [padCount, setPadCount] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [toast, setToast] = useState("");
  const editorRef = useRef<Editor | null>(null);
  const dirtyRef = useRef(false);
  const contentRef = useRef("");
  const titleRef = useRef("");
  titleRef.current = title;

  useEffect(() => {
    fetch(`/tiku/api/lectures/${docId}`).then((r) => r.json()).then((d) => {
      if (d.data) {
        setTitle(d.data.title);
        setContent(d.data.content || "");
        contentRef.current = d.data.content || "";
      }
    });
  }, [docId]);

  const handleMessage = useCallback((msg: PadMessage) => {
    if (msg.kind === "pad-status") { setPadCount(msg.count); return; }
    if (msg.kind === "offline-notice") {
      setToast(`收到 ${msg.count} 条离线期间的 iPad 内容`);
      setTimeout(() => setToast(""), 4000);
      return;
    }
    const ed = editorRef.current;
    if (!ed) return;
    if (msg.kind === "image") {
      ed.chain().focus().setImage({ src: msg.dataUrl }).run();
      setToast("已插入 iPad 图片");
    } else if (msg.kind === "formula") {
      ed.chain().focus().setInlineMath(msg.latex).run();
      setToast("已插入 iPad 公式");
    }
    setTimeout(() => setToast(""), 2500);
  }, []);

  const { connected } = usePadChannel(docId, "editor", handleMessage);

  // 自动保存（防抖 1.5s）
  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(async () => {
      if (!dirtyRef.current) return;
      setSaveState("saving");
      const res = await fetch(`/tiku/api/lectures/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleRef.current, content: contentRef.current }),
      });
      if (res.ok) { dirtyRef.current = false; setSaveState("saved"); }
      else { setSaveState("dirty"); }
    }, 1500);
    return () => clearTimeout(t);
  }, [content, title, docId]);

  function markDirty(json: string) {
    contentRef.current = json;
    dirtyRef.current = true;
    setSaveState("dirty");
    setContent(json); // 触发防抖 effect
  }

  if (content === null) return <div style={{ padding: 40, textAlign: "center", color: "#999" }}>加载中…</div>;

  const padUrl = typeof window !== "undefined" ? `${location.origin}/tiku/pad?doc=${docId}` : "";

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px", fontFamily: "system-ui" }}>
      {/* 顶栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <Link href="/lectures" style={{ color: "#666", textDecoration: "none", fontSize: 14 }}>← 讲义列表</Link>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); dirtyRef.current = true; setSaveState("dirty"); }}
          style={{ flex: 1, minWidth: 200, fontSize: 17, fontWeight: 600, padding: "8px 10px", border: "1px solid transparent", borderRadius: 6 }}
        />
        {/* iPad 状态灯 */}
        <span
          title={padCount > 0 ? `${padCount} 台 iPad 已连接` : "iPad 未连接"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
            color: padCount > 0 ? "#16a34a" : "#9ca3af",
          }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: padCount > 0 ? "#22c55e" : "#d1d5db",
          }} />
          {padCount > 0 ? `iPad ×${padCount}` : "iPad 未连接"}
          {!connected && "（重连中…）"}
        </span>
        <span style={{ fontSize: 13, color: saveState === "saved" ? "#16a34a" : saveState === "saving" ? "#2563eb" : "#d97706" }}>
          {saveState === "saved" ? "✓ 已保存" : saveState === "saving" ? "保存中…" : "● 未保存"}
        </span>
      </div>

      {/* iPad 入口提示 */}
      <div style={{
        fontSize: 13, color: "#64748b", background: "#f1f5f9", borderRadius: 8,
        padding: "8px 12px", marginBottom: 12, wordBreak: "break-all",
      }}>
        📱 iPad 打开：<strong>{padUrl}</strong>（登录后即可画图/写公式）
      </div>

      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "#1e293b", color: "#fff", padding: "8px 20px", borderRadius: 20,
          fontSize: 14, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,.25)",
        }}>
          {toast}
        </div>
      )}

      {/* 编辑器 */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff" }}>
        {editorRef.current && <GlobalToolbar activeEditor={editorRef.current} editorActive={{}} />}
        <RichTextEditor
          content={content}
          onChange={(_html, json) => markDirty(JSON.stringify(json))}
          onEditorReady={(ed) => { editorRef.current = ed; }}
        />
      </div>
    </div>
  );
}
