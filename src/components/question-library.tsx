"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const RichTextEditor = dynamic(
  () => import("@/components/tiptap/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false }
);

/** 学生问题库：课上学生提问的随手记录，文字/截图，按 课本→章→课时 归类 */

interface TextbookItem { id: number; name: string }
interface ChapterItem { id: number; title: string }
interface LessonItem { id: number; title: string }
interface QuestionItem {
  id: number;
  content: string;
  studentName: string | null;
  explanation: string;
  askedAt: string;
  textbook: { id: number; name: string } | null;
  chapter: { id: number; title: string } | null;
  lesson: { id: number; title: string } | null;
  images: { imageId: string }[];
}

function shortBook(name: string) {
  return name.replace(/^人教版高中物理/, "").replace(/^人教版/, "");
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `今天 ${hm}` : `${ymd} ${hm}`;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** AI 返回文本 → TipTap JSON：段落按空行分，$...$ 转公式节点，**粗体** 保留 */
function mdToTiptap(md: string): string {
  const pushText = (nodes: unknown[], t: string) => {
    for (const part of t.split(/(\*\*[^*]+\*\*)/)) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**")) {
        nodes.push({ type: "text", text: part.slice(2, -2), marks: [{ type: "bold" }] });
      } else {
        nodes.push({ type: "text", text: part });
      }
    }
  };
  const inline = (text: string) => {
    const nodes: unknown[] = [];
    let rest = text.replace(/^#{1,4}\s*/, "").replace(/^[-*]\s+/, "").replace(/^\d+[.、]\s*/, "");
    // 兼容四种 LaTeX 包裹：$$..$$  \[..\]  \(..\)  $..$
    const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+)\$/;
    let m: RegExpMatchArray | null;
    while ((m = rest.match(re))) {
      if (m.index && m.index > 0) pushText(nodes, rest.slice(0, m.index));
      nodes.push({ type: "inlineMath", attrs: { text: m[1] ?? m[2] ?? m[3] ?? m[4] } });
      rest = rest.slice((m.index || 0) + m[0].length);
    }
    if (rest) pushText(nodes, rest);
    return nodes.length ? nodes : undefined;
  };
  const paras = md.split(/\n{2,}|\n(?=[-\d#•])/).map((x) => x.trim()).filter(Boolean);
  return JSON.stringify({
    type: "doc",
    content: paras.map((t) => ({ type: "paragraph", content: inline(t) })),
  });
}

export function QuestionLibrary() {
  // ===== 筛选 =====
  const [textbooks, setTextbooks] = useState<TextbookItem[]>([]);
  const [textbookId, setTextbookId] = useState("");
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [expandedChapter, setExpandedChapter] = useState(0);
  const [lessonsMap, setLessonsMap] = useState<Record<number, LessonItem[]>>({});
  const [chapterId, setChapterId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [search, setSearch] = useState("");

  // ===== 列表 =====
  const [list, setList] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // ===== 弹窗（新建/编辑） =====
  const [editing, setEditing] = useState<QuestionItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "edit">("edit");
  const [viewMax, setViewMax] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiVia, setAiVia] = useState("");
  const [aiErr, setAiErr] = useState("");
  const [fContent, setFContent] = useState("");
  const [fStudent, setFStudent] = useState("");
  const [fTextbook, setFTextbook] = useState("");
  const [fChapter, setFChapter] = useState("");
  const [fLesson, setFLesson] = useState("");
  const [fExplanation, setFExplanation] = useState("");
  const [fAskedAt, setFAskedAt] = useState(toLocalInput(new Date().toISOString()));
  const [fImages, setFImages] = useState<string[]>([]);     // 新图 dataURL
  const [fOldImages, setFOldImages] = useState<string[]>([]); // 编辑时已有图的 imageId
  const [fChapters, setFChapters] = useState<ChapterItem[]>([]);
  const [fLessons, setFLessons] = useState<LessonItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [imgErr, setImgErr] = useState("");

  const [lightbox, setLightbox] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ===== 初始化 =====
  useEffect(() => {
    fetch("/tiku/api/textbooks").then((r) => r.json()).then((d) => {
      setTextbooks(d.data || []);
      if (d.data && d.data.length) setTextbookId(String(d.data[0].id));
    });
  }, []);

  useEffect(() => {
    if (!textbookId) { setChapters([]); return; }
    fetch(`/tiku/api/chapters?textbookId=${textbookId}`).then((r) => r.json())
      .then((d) => setChapters(d.data || []));
  }, [textbookId]);

  const expandChapter = useCallback((cid: number) => {
    setExpandedChapter((cur) => (cur === cid ? 0 : cid));
    if (!lessonsMap[cid]) {
      fetch(`/tiku/api/lessons?chapterId=${cid}`).then((r) => r.json())
        .then((d) => setLessonsMap((m) => ({ ...m, [cid]: d.data || [] })));
    }
  }, [lessonsMap]);

  // ===== 列表 =====
  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (textbookId) p.set("textbookId", textbookId);
    if (chapterId) p.set("chapterId", chapterId);
    if (lessonId) p.set("lessonId", lessonId);
    if (search.trim()) p.set("search", search.trim());
    fetch(`/tiku/api/student-questions?${p}`).then((r) => r.json())
      .then((d) => setList(d.data || []))
      .finally(() => setLoading(false));
  }, [textbookId, chapterId, lessonId, search]);

  useEffect(() => { load(); }, [load]);

  // ===== 弹窗级联 =====
  useEffect(() => {
    if (!fTextbook) { setFChapters([]); return; }
    fetch(`/tiku/api/chapters?textbookId=${fTextbook}`).then((r) => r.json())
      .then((d) => setFChapters(d.data || []));
  }, [fTextbook]);
  useEffect(() => {
    if (!fChapter) { setFLessons([]); return; }
    fetch(`/tiku/api/lessons?chapterId=${fChapter}`).then((r) => r.json())
      .then((d) => setFLessons(d.data || []));
  }, [fChapter]);

  // ===== 截图：粘贴 =====
  useEffect(() => {
    if (!modalOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (!f) continue;
          const rd = new FileReader();
          rd.onload = () => {
            const u = String(rd.result || "");
            if (u.length > 8 * 1024 * 1024) { setImgErr("截图太大，超过 6MB"); return; }
            setFImages((arr) => [...arr, u]);
            setImgErr("");
          };
          rd.readAsDataURL(f);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [modalOpen]);

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const rd = new FileReader();
      rd.onload = () => {
        const u = String(rd.result || "");
        if (u.length > 8 * 1024 * 1024) { setImgErr("图片太大，超过 6MB"); return; }
        setFImages((arr) => [...arr, u]);
        setImgErr("");
      };
      rd.readAsDataURL(f);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  // ===== 打开弹窗 =====
  const openNew = () => {
    setEditing(null);
    setFContent(""); setFStudent("");
    setFTextbook(textbookId || (textbooks[0] ? String(textbooks[0].id) : ""));
    setFChapter(chapterId); setFLesson(lessonId);
    setFExplanation("");
    setFAskedAt(toLocalInput(new Date().toISOString()));
    setFImages([]); setFOldImages([]); setImgErr("");
    setModalMode("edit");
    setModalOpen(true);
  };

  const fillForm = (q: QuestionItem) => {
    setEditing(q);
    setFContent(q.content);
    setFStudent(q.studentName || "");
    setFTextbook(q.textbook ? String(q.textbook.id) : "");
    setFChapter(q.chapter ? String(q.chapter.id) : "");
    setFLesson(q.lesson ? String(q.lesson.id) : "");
    setFExplanation(q.explanation || "");
    setFAskedAt(toLocalInput(q.askedAt));
    setFImages([]); setFOldImages(q.images.map((x) => x.imageId)); setImgErr("");
  };

  // 查看：只读展示问题 + 解释
  const openView = (q: QuestionItem, withAI = false) => {
    fillForm(q);
    setModalMode("view");
    setViewMax(false);
    setAiOpen(withAI); setAiAnswer(""); setAiErr("");
    setModalOpen(true);
  };

  const genAI = async () => {
    if (!editing || aiBusy) return;
    if (!aiPrompt.trim()) { setAiErr("先写一句你的解题思路提示"); return; }
    setAiBusy(true); setAiErr(""); setAiAnswer("");
    try {
      const r = await fetch(`/tiku/api/student-questions/${editing.id}/ai-answer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "AI 调用失败");
      setAiAnswer(d.data.answer); setAiVia(d.data.via || "");
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "AI 调用失败");
    } finally {
      setAiBusy(false);
    }
  };

  const writeAI = async (mode: "replace" | "append") => {
    if (!editing || !aiAnswer) return;
    const newDoc = JSON.parse(mdToTiptap(aiAnswer));
    let doc = newDoc;
    if (mode === "append" && editing.explanation) {
      try {
        const old = JSON.parse(editing.explanation);
        doc = { type: "doc", content: [...(old.content || []), ...newDoc.content] };
      } catch { /* 用新文档 */ }
    }
    const r = await fetch(`/tiku/api/student-questions/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ explanation: JSON.stringify(doc) }),
    });
    const d = await r.json();
    if (r.ok && d.data) {
      setList((arr) => arr.map((x) => (x.id === editing.id ? { ...x, explanation: d.data.explanation } : x)));
      setEditing(d.data);
      setFExplanation(d.data.explanation);
      setAiOpen(false); setAiAnswer("");
    } else {
      alert("写入失败，请重试");
    }
  };

  const openEdit = (q: QuestionItem) => {
    fillForm(q);
    setModalMode("edit");
    setModalOpen(true);
  };

  // ===== 保存 =====
  const save = async () => {
    if (!fContent.trim() && !fImages.length && !fOldImages.length) {
      alert("问题和截图至少要有一样"); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        content: fContent.trim(),
        studentName: fStudent.trim() || null,
        textbookId: fTextbook ? Number(fTextbook) : null,
        chapterId: fChapter ? Number(fChapter) : null,
        lessonId: fLesson ? Number(fLesson) : null,
        explanation: fExplanation,
        askedAt: new Date(fAskedAt).toISOString(),
      };
      if (editing) {
        // 编辑：保留的旧图读成 dataURL 传回（后端全量重建），简化处理
        const oldAsData: string[] = [];
        for (const id of fOldImages) {
          const r = await fetch(`/tiku/api/images/${id}`);
          const b = await r.blob();
          const u = await new Promise<string>((res) => {
            const rd = new FileReader();
            rd.onload = () => res(String(rd.result || ""));
            rd.readAsDataURL(b);
          });
          oldAsData.push(u);
        }
        payload.images = [...oldAsData, ...fImages];
        await fetch(`/tiku/api/student-questions/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        payload.images = fImages;
        await fetch("/tiku/api/student-questions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      load();
    } catch {
      alert("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("确定删除这条问题？")) return;
    await fetch(`/tiku/api/student-questions/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="flex h-full gap-0">
      {/* ===== 左栏：课本 → 章 → 课时 ===== */}
      <div className="w-60 shrink-0 border-r bg-white flex flex-col">
        <div className="p-2 border-b">
          <select
            value={textbookId}
            onChange={(e) => { setTextbookId(e.target.value); setChapterId(""); setLessonId(""); setExpandedChapter(0); }}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {textbooks.map((t) => <option key={t.id} value={t.id}>{shortBook(t.name)}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          <button
            onClick={() => { setChapterId(""); setLessonId(""); setExpandedChapter(0); }}
            className={`w-full text-left px-3 py-1.5 rounded text-sm ${!chapterId ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
          >
            全部章节
          </button>
          {chapters.map((c) => (
            <div key={c.id}>
              <button
                onClick={() => { setChapterId(String(c.id)); setLessonId(""); expandChapter(c.id); }}
                className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center justify-between ${
                  chapterId === String(c.id) ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="truncate">{c.title}</span>
                <span className="text-gray-400 text-xs">{expandedChapter === c.id ? "▾" : "▸"}</span>
              </button>
              {expandedChapter === c.id && (
                <div className="pl-4">
                  {(lessonsMap[c.id] || []).map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setLessonId(String(l.id))}
                      className={`w-full text-left px-3 py-1 rounded text-[13px] truncate ${
                        lessonId === String(l.id) ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {l.title}
                    </button>
                  ))}
                  {(lessonsMap[c.id] || []).length === 0 && (
                    <div className="px-3 py-1 text-xs text-gray-400">暂无课时</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ===== 右栏 ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2 flex items-center gap-2 border-b bg-white">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="搜索问题内容 / 学生名字…"
            className="flex-1 max-w-sm border rounded-lg px-3 py-1.5 text-sm"
          />
          <div className="flex-1" />
          <button
            onClick={openNew}
            className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            ＋ 记一个问题
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-100">
          {loading && <div className="text-center text-gray-400 text-sm py-8">加载中…</div>}
          {!loading && list.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-12">
              还没有问题记录。点右上角「记一个问题」，文字 + 截图都行。
            </div>
          )}
          {list.map((q) => (
            <div key={q.id} className="bg-white rounded-lg border shadow-sm p-3">
              {q.content && (
                <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{q.content}</div>
              )}
              {q.images.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {q.images.map((im) => (
                    <img
                      key={im.imageId}
                      src={`/tiku/api/images/${im.imageId}`}
                      alt="截图"
                      onClick={() => setLightbox(`/tiku/api/images/${im.imageId}`)}
                      className="h-24 rounded border cursor-zoom-in hover:opacity-90"
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 flex-wrap">
                {q.textbook && <span className="bg-gray-100 rounded px-1.5 py-0.5">{shortBook(q.textbook.name)}</span>}
                {q.chapter && <span className="bg-gray-100 rounded px-1.5 py-0.5">{q.chapter.title}</span>}
                {q.lesson && <span className="bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">{q.lesson.title}</span>}
                {q.studentName && <span className="text-gray-700">👤 {q.studentName}</span>}
                {q.explanation && q.explanation.length > 30 && (
                  <button
                    onClick={() => openView(q)}
                    className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 hover:bg-emerald-100"
                    title="已写解释，点击查看"
                  >💡 有解释</button>
                )}
                <span>{fmtTime(q.askedAt)}</span>
                <div className="flex-1" />
                <button onClick={() => openView(q)} className="text-blue-600 hover:underline">查看</button>
                <button onClick={() => openView(q, true)} className="text-violet-600 hover:underline">🤖 AI</button>
                <button onClick={() => remove(q.id)} className="text-red-500 hover:underline">删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 新建/编辑弹窗 ===== */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className={`bg-white shadow-2xl overflow-y-auto p-5 ${viewMax ? "w-[98vw] h-[94vh] max-w-none rounded-lg" : "w-full max-w-2xl max-h-[90vh] rounded-xl"}`} onClick={(e) => e.stopPropagation()}>
            {modalMode === "view" && editing ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-bold">问题详情</div>
                  <div className="flex gap-2">
                    <button onClick={() => { setAiOpen((o) => !o); setAiErr(""); }}
                      className={`px-3 py-1.5 rounded-lg text-sm ${aiOpen ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100"}`}>
                      🤖 AI 回答
                    </button>
                    <button onClick={() => setViewMax((v) => !v)}
                      className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
                      {viewMax ? "🗕 还原" : "⛶ 最大化"}
                    </button>
                    <button onClick={() => setModalMode("edit")}
                      className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">编辑</button>
                  </div>
                </div>

                {aiOpen && (
                  <div className="mb-3 border border-violet-200 bg-violet-50/60 rounded-lg p-3">
                    <div className="text-xs text-violet-700 font-medium mb-1.5">先写你的解题思路提示，AI 照着这个思路讲这道题</div>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={2}
                      placeholder="例：先做受力分析，用正交分解；重点讲静摩擦力方向怎么判断；最后给个口诀"
                      className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-violet-200 outline-none"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={genAI} disabled={aiBusy}
                        className="px-4 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                        {aiBusy ? "生成中（约10~30秒）…" : aiAnswer ? "重新生成" : "生成回答"}
                      </button>
                      {aiVia && <span className="text-[11px] text-gray-400">via {aiVia}</span>}
                      {aiErr && <span className="text-xs text-red-500">{aiErr}</span>}
                    </div>
                    {aiAnswer && (
                      <div className="mt-2 bg-white border border-violet-100 rounded-lg p-3">
                        <RichTextEditor key={aiAnswer.length + ":" + aiAnswer.slice(0, 20)} content={mdToTiptap(aiAnswer)} editable={false} plain />
                        <div className="flex gap-2 mt-2 pt-2 border-t border-dashed">
                          <button onClick={() => writeAI("replace")}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700">✅ 写入解释（替换）</button>
                          <button onClick={() => writeAI("append")}
                            className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs hover:bg-emerald-100">➕ 追加到解释</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {editing.content && (
                  <div className="text-[15px] text-gray-800 whitespace-pre-wrap leading-relaxed">{editing.content}</div>
                )}
                {editing.images.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {editing.images.map((im) => (
                      <img key={im.imageId} src={`/tiku/api/images/${im.imageId}`} alt="截图"
                        onClick={() => setLightbox(`/tiku/api/images/${im.imageId}`)}
                        className="max-h-56 rounded border cursor-zoom-in hover:opacity-90" />
                    ))}
                  </div>
                )}
                {/* 元信息：小字弱化展示 */}
                <div className="flex items-center gap-1.5 mt-3 text-[11px] text-gray-400 flex-wrap">
                  {editing.textbook && <span className="bg-gray-50 rounded px-1 py-px">{shortBook(editing.textbook.name)}</span>}
                  {editing.chapter && <span className="bg-gray-50 rounded px-1 py-px">{editing.chapter.title}</span>}
                  {editing.lesson && <span className="bg-gray-50 rounded px-1 py-px">{editing.lesson.title}</span>}
                  {editing.studentName && <span>{editing.studentName}</span>}
                  <span>{fmtTime(editing.askedAt)}</span>
                </div>
                {editing.explanation && editing.explanation.length > 30 ? (
                  <div className="mt-3 pt-3 border-t border-dashed">
                    <div className="text-xs text-emerald-700 font-medium mb-1">💡 我的解释</div>
                    <RichTextEditor content={editing.explanation} editable={false} plain />
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-dashed text-xs text-gray-400">还没写解释，点右上角「编辑」可以补。</div>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => { setModalOpen(false); remove(editing.id); }}
                    className="px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50">删除</button>
                  <button onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">关闭</button>
                </div>
              </>
            ) : (
              <>
            <div className="text-lg font-bold mb-3">{editing ? "编辑问题" : "记一个问题"}</div>

            <textarea
              value={fContent}
              onChange={(e) => setFContent(e.target.value)}
              placeholder="学生的原话，例如：为什么静摩擦力可以做正功？（也可以只留截图）"
              rows={3}
              autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
            />

            <div className="mt-3">
              <div className="text-sm text-gray-600 mb-1">截图（直接粘贴 Ctrl+V，或点按钮选择，可多张）</div>
              <div className="flex gap-2 flex-wrap items-center">
                {fOldImages.map((id) => (
                  <div key={id} className="relative">
                    <img src={`/tiku/api/images/${id}`} className="h-20 rounded border" alt="" />
                    <button
                      onClick={() => setFOldImages((a) => a.filter((x) => x !== id))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none"
                    >×</button>
                  </div>
                ))}
                {fImages.map((u, i) => (
                  <div key={i} className="relative">
                    <img src={u} className="h-20 rounded border" alt="" />
                    <button
                      onClick={() => setFImages((a) => a.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none"
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="h-20 w-20 border-2 border-dashed rounded text-gray-400 hover:text-blue-500 hover:border-blue-300 text-2xl"
                >＋</button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
              </div>
              {imgErr && <div className="text-xs text-red-500 mt-1">{imgErr}</div>}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-gray-500">提问人（可空）</label>
                <input value={fStudent} onChange={(e) => setFStudent(e.target.value)} placeholder="学生名字"
                  className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">提问时间</label>
                <input type="datetime-local" value={fAskedAt} onChange={(e) => setFAskedAt(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">课本</label>
                <select value={fTextbook} onChange={(e) => { setFTextbook(e.target.value); setFChapter(""); setFLesson(""); }}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">不归类</option>
                  {textbooks.map((t) => <option key={t.id} value={t.id}>{shortBook(t.name)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">章</label>
                <select value={fChapter} onChange={(e) => { setFChapter(e.target.value); setFLesson(""); }}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm" disabled={!fTextbook}>
                  <option value="">不选</option>
                  {fChapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">课时</label>
                <select value={fLesson} onChange={(e) => setFLesson(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm" disabled={!fChapter}>
                  <option value="">不选</option>
                  {fLessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>

            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-500">我的解释（可写文字、插公式、贴图，可后补）</label>
              <div className="border rounded-lg">
                <RichTextEditor
                  content={fExplanation}
                  editable={true}
                  plain
                  onChange={(_html, json) => setFExplanation(JSON.stringify(json))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">取消</button>
              <button onClick={save} disabled={saving}
                className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50">
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== 看图 ===== */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setLightbox("")}>
          <img src={lightbox} className="max-w-full max-h-full rounded shadow-2xl" alt="大图" />
        </div>
      )}
    </div>
  );
}
