"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface LectureItem { id: number; title: string; updatedAt: string }

export default function LecturesPage() {
  const [lectures, setLectures] = useState<LectureItem[]>([]);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/tiku/api/lectures").then((r) => r.json()).then((d) => setLectures(d.data || []));
  }, []);

  async function create() {
    if (!title.trim() || creating) return;
    setCreating(true);
    const res = await fetch("/tiku/api/lectures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    const d = await res.json();
    if (res.ok) router.push(`/lectures/${d.data.id}`);
    else { alert(d.error || "创建失败"); setCreating(false); }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/" style={{ color: "#666", textDecoration: "none" }}>← 题库</Link>
        <h1 style={{ fontSize: 22, margin: 0 }}>讲义编辑器</h1>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="新讲义标题，如：电场强度 第一课时"
          style={{ flex: 1, padding: "10px 12px", fontSize: 15, border: "1px solid #ddd", borderRadius: 8 }}
        />
        <button
          onClick={create}
          disabled={creating || !title.trim()}
          style={{ padding: "10px 20px", fontSize: 15, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
        >
          {creating ? "创建中…" : "＋ 新建"}
        </button>
      </div>

      {lectures.length === 0 && <p style={{ color: "#999" }}>还没有讲义，新建一篇开始吧。</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {lectures.map((l) => (
          <li key={l.id}>
            <Link
              href={`/lectures/${l.id}`}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 16px", marginBottom: 8, background: "#f8fafc", borderRadius: 8,
                textDecoration: "none", color: "#1e293b", border: "1px solid #e2e8f0",
              }}
            >
              <span style={{ fontSize: 15 }}>{l.title}</span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {new Date(l.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
