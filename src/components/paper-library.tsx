"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 试卷库：整卷存档（Word / PDF），支持上传、下载、编辑、删除、Word 拆题入库 */

interface FolderItem {
  id: number;
  name: string;
  parentId: number | null;
  _count: { papers: number };
}

interface PaperItem {
  id: number;
  title: string;
  paperType: string;
  remarks: string | null;
  fileName: string;
  fileSize: number;
  fileType: "docx" | "pdf";
  downloadCount: number;
  lecturesPaperId: number | null;
  lecturesSentAt: string | null;
  textbookId: number | null;
  folderId: number | null;
  textbook: { name: string } | null;
  createdAt: string;
}

interface TextbookItem {
  id: number;
  name: string;
}

interface UploadFileItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const PAPER_TYPES = ["单元测试", "月考", "期中", "期末", "其他"];

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

export function PaperLibrary() {
  const [papers, setPapers] = useState<PaperItem[]>([]);
  const [textbooks, setTextbooks] = useState<TextbookItem[]>([]);
  const [filterType, setFilterType] = useState("");
  const [filterTextbook, setFilterTextbook] = useState("");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [filterFolder, setFilterFolder] = useState("");  // ""=全部 "none"=未分类 数字串=指定目录
  const [uploadFolder, setUploadFolder] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [loading, setLoading] = useState(false);

  // 上传弹窗
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [title, setTitle] = useState("");
  const [paperType, setPaperType] = useState("其他");
  const [textbookId, setTextbookId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSummary, setUploadSummary] = useState<{ ok: number; fail: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // 编辑弹窗
  const [editPaper, setEditPaper] = useState<PaperItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("其他");
  const [editTextbook, setEditTextbook] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 分享：刚复制成功的试卷 id（用于按钮短暂变色提示）
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 发送到讲题页：正在发送中的试卷 id
  const [sendingId, setSendingId] = useState<number | null>(null);

  const handleSendToLectures = async (p: PaperItem) => {
    setSendingId(p.id);
    try {
      const res = await fetch(`/tiku/api/papers/${p.id}/send-to-lectures`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送到讲题页失败");
      const lecturesPaperId = data.data.lecturesPaperId as number;
      setPapers((cur) =>
        cur.map((it) =>
          it.id === p.id
            ? { ...it, lecturesPaperId, lecturesSentAt: new Date().toISOString() }
            : it,
        ),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "发送到讲题页失败");
    } finally {
      setSendingId(null);
    }
  };

  const handleShare = async (p: PaperItem) => {
    try {
      const res = await fetch(`/tiku/api/papers/${p.id}/share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成分享链接失败");
      const url = `${window.location.origin}/tiku/api/share/${data.data.shareToken}/download`;
      // 剪贴板 API 在非 HTTPS 环境可能不可用，失败时回退到隐藏输入框复制
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopiedId(p.id);
      setTimeout(() => setCopiedId((cur) => (cur === p.id ? null : cur)), 2000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成分享链接失败");
    }
  };

  const loadPapers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("paperType", filterType);
      if (filterTextbook) params.set("textbookId", filterTextbook);
      if (filterFolder) params.set("folderId", filterFolder);
      const res = await fetch(`/tiku/api/papers?${params.toString()}`);
      const data = await res.json();
      if (data.data) setPapers(data.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filterType, filterTextbook, filterFolder]);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  useEffect(() => {
    fetch("/tiku/api/textbooks")
      .then((r) => r.json())
      .then((d) => setTextbooks(d.data || []))
      .catch(() => {});
  }, []);

  const loadFolders = useCallback(() => {
    fetch("/tiku/api/paper-folders")
      .then((r) => r.json())
      .then((d) => setFolders(d.data || []))
      .catch(() => {});
  }, []);
  useEffect(() => { loadFolders(); }, [loadFolders]);

  const handleAddFolder = async () => {
    const name = window.prompt("新目录名称：", "");
    if (!name || !name.trim()) return;
    const res = await fetch("/tiku/api/paper-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return alert(d.error || "创建失败");
    loadFolders();
  };

  const handleAddSubFolder = async (parent: FolderItem) => {
    const name = window.prompt(`在「${parent.name}」下新建子目录：`, "");
    if (!name || !name.trim()) return;
    const res = await fetch("/tiku/api/paper-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), parentId: parent.id }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return alert(d.error || "创建失败");
    loadFolders();
  };

  const handleRenameFolder = async (f: FolderItem) => {
    const name = window.prompt("目录改名：", f.name);
    if (!name || !name.trim() || name.trim() === f.name) return;
    const res = await fetch("/tiku/api/paper-folders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, name: name.trim() }),
    });
    if (!res.ok) return alert("改名失败");
    loadFolders();
  };

  const handleDeleteFolder = async (f: FolderItem) => {
    const kids = folders.filter((c) => c.parentId === f.id);
    const extra = kids.length > 0 ? `，其 ${kids.length} 个子目录会提升为一级目录（子目录内试卷不动）` : "";
    if (!confirm(`删除目录「${f.name}」？里面的 ${f._count.papers} 份试卷会移回「未分类」${extra}，不会被删除。`)) return;
    const res = await fetch("/tiku/api/paper-folders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id }),
    });
    if (!res.ok) return alert("删除失败");
    if (filterFolder === String(f.id)) setFilterFolder("");
    loadFolders();
    loadPapers();
  };

  const resetUpload = () => {
    setFiles([]);
    setTitle("");
    setPaperType("其他");
    setTextbookId("");
    setRemarks("");
    setUploadProgress(0);
    setUploadSummary(null);
    setUploadOpen(false);
  };

  const tryCloseUpload = () => {
    if (uploading) {
      alert("上传中请稍候");
      return;
    }
    resetUpload();
  };

  const addFiles = (list: FileList | File[]) => {
    const all = Array.from(list);
    const accepted = all.filter((f) => /\.(docx|pdf)$/i.test(f.name));
    const rejected = all.filter((f) => !/\.(docx|pdf)$/i.test(f.name));
    if (rejected.length > 0) {
      alert(`以下文件已拒绝（仅支持 .docx 或 .pdf）：\n${rejected.map((f) => f.name).join("\n")}`);
    }
    if (accepted.length > 0) {
      setFiles(accepted.map((file) => ({ file, status: "pending" as const })));
      setUploadSummary(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return alert("请先选择文件");
    setUploading(true);
    setUploadSummary(null);
    setUploadProgress(0);
    const single = files.length === 1;
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(i + 1);
      setFiles((cur) => cur.map((it, j) => (j === i ? { ...it, status: "uploading", error: undefined } : it)));
      try {
        const fd = new FormData();
        fd.append("file", files[i].file);
        fd.append("title", single ? title : "");
        fd.append("paperType", paperType);
        fd.append("textbookId", textbookId);
        fd.append("folderId", uploadFolder);
        fd.append("remarks", remarks);
        const res = await fetch("/tiku/api/papers", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "上传失败");
        ok++;
        setFiles((cur) => cur.map((it, j) => (j === i ? { ...it, status: "done" } : it)));
      } catch (e) {
        fail++;
        const msg = e instanceof Error ? e.message : "上传失败";
        setFiles((cur) => cur.map((it, j) => (j === i ? { ...it, status: "error", error: msg } : it)));
      }
    }
    setUploading(false);
    setUploadSummary({ ok, fail });
    loadPapers();
    if (fail === 0) setTimeout(() => resetUpload(), 1500);
  };

  const handleDelete = async (p: PaperItem) => {
    if (!confirm(`确定删除「${p.title}」？此操作不可恢复。`)) return;
    try {
      const res = await fetch(`/tiku/api/papers/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      loadPapers();
    } catch {
      alert("删除失败");
    }
  };

  const openEdit = (p: PaperItem) => {
    setEditPaper(p);
    setEditTitle(p.title);
    setEditType(p.paperType);
    setEditTextbook(p.textbookId ? String(p.textbookId) : "");
    setEditFolder(p.folderId ? String(p.folderId) : "");
    setEditRemarks(p.remarks || "");
  };

  const handleSaveEdit = async () => {
    if (!editPaper) return;
    setSaving(true);
    try {
      const res = await fetch(`/tiku/api/papers/${editPaper.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          paperType: editType,
          textbookId: editTextbook || null,
          folderId: editFolder || null,
          remarks: editRemarks,
        }),
      });
      if (!res.ok) throw new Error();
      setEditPaper(null);
      loadPapers();
    } catch {
      alert("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSplit = (p: PaperItem) => {
    window.location.href = `/tiku/upload?fromPaper=${p.id}`;
  };

  // 侧栏宽度可拖（120~480px），记住用户习惯
  const [sideW, setSideW] = useState(176);
  useEffect(() => {
    const saved = Number(localStorage.getItem("paperLib.sideW"));
    if (saved >= 120 && saved <= 480) setSideW(saved);
  }, []);
  const sideDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onSideDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    sideDragRef.current = { startX: e.clientX, startW: sideW };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const d = sideDragRef.current;
      if (!d) return;
      setSideW(Math.min(480, Math.max(120, d.startW + ev.clientX - d.startX)));
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      sideDragRef.current = null;
      setSideW((w) => { localStorage.setItem("paperLib.sideW", String(w)); return w; });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp, { once: true });
    el.addEventListener("pointercancel", onUp, { once: true });
  };

  const sideItem = (active: boolean) =>
    `w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
      active ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-100"
    }`;

  // 两级目录树：一级 parentId 为 null，二级挂在一级下
  const topFolders = folders.filter((f) => f.parentId == null);
  const childFolders = (pid: number) => folders.filter((f) => f.parentId === pid);

  // 折叠状态（默认展开），localStorage 记住
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("paperLib.foldsCollapsed") || "[]");
      if (Array.isArray(saved)) setCollapsedIds(new Set(saved.map(Number)));
    } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = (id: number) => {
    setCollapsedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("paperLib.foldsCollapsed", JSON.stringify([...next]));
      return next;
    });
  };

  // 「存入目录」下拉：按树展开，二级目录加全角缩进前缀
  const folderOptions = topFolders.flatMap((f) => [
    { id: f.id, label: f.name },
    ...childFolders(f.id).map((c) => ({ id: c.id, label: `　├ ${c.name}` })),
  ]);

  return (
    <div className="flex h-full">
      {/* 左侧目录栏（目录多了纵向滚动，不挤内容区） */}
      <div style={{ width: sideW }} className="flex-shrink-0 bg-gray-50/60 p-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-medium text-gray-400">目录</span>
          <button onClick={handleAddFolder} className="text-blue-500 hover:text-blue-600 text-base leading-none" title="新建目录">＋</button>
        </div>
        <button onClick={() => setFilterFolder("")} className={sideItem(filterFolder === "")}>
          <span>📁 全部</span>
        </button>
        <button onClick={() => setFilterFolder("none")} className={sideItem(filterFolder === "none")}>
          <span>📂 未分类</span>
        </button>
        {folders.length > 0 && <div className="border-t my-2" />}
        {topFolders.map((f) => {
          const kids = childFolders(f.id);
          const active = filterFolder === String(f.id);
          const collapsed = collapsedIds.has(f.id);
          const iconCls = active ? "text-blue-100 hover:text-white" : "text-gray-400 hover:text-gray-600";
          return (
            <div key={f.id}>
              <div className="group relative">
                <button onClick={() => setFilterFolder(String(f.id))} className={sideItem(active) + (active ? " pr-16" : " group-hover:pr-16")}>
                  <span className="truncate">
                    {kids.length > 0 && (
                      <span
                        onClick={(e) => { e.stopPropagation(); toggleCollapsed(f.id); }}
                        className="inline-block w-4 text-center cursor-pointer select-none"
                        title={collapsed ? "展开子目录" : "折叠子目录"}
                      >{collapsed ? "▸" : "▾"}</span>
                    )}
                    📁 {f.name}
                  </span>
                  <span className={`text-xs ml-1 ${active ? "text-blue-100" : "text-gray-400"}`}>{f._count.papers}</span>
                </button>
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 ${active ? "" : "opacity-0 group-hover:opacity-100"}`}>
                  <button onClick={() => handleAddSubFolder(f)} className={`text-xs ${iconCls}`} title="新建子目录">＋</button>
                  <button onClick={() => handleRenameFolder(f)} className={`text-xs ${iconCls}`} title="改名">✏️</button>
                  <button onClick={() => handleDeleteFolder(f)} className={`text-xs ${iconCls}`} title="删除目录（试卷移回未分类，子目录提升为一级）">🗑</button>
                </span>
              </div>
              {!collapsed && kids.map((c) => {
                const cActive = filterFolder === String(c.id);
                const cIconCls = cActive ? "text-blue-100 hover:text-white" : "text-gray-400 hover:text-gray-600";
                return (
                  <div key={c.id} className="group relative pl-4">
                    <button onClick={() => setFilterFolder(String(c.id))} className={sideItem(cActive) + (cActive ? " pr-12" : " group-hover:pr-12")}>
                      <span className="truncate">📂 {c.name}</span>
                      <span className={`text-xs ml-1 ${cActive ? "text-blue-100" : "text-gray-400"}`}>{c._count.papers}</span>
                    </button>
                    <span className={`absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 ${cActive ? "" : "opacity-0 group-hover:opacity-100"}`}>
                      <button onClick={() => handleRenameFolder(c)} className={`text-xs ${cIconCls}`} title="改名">✏️</button>
                      <button onClick={() => handleDeleteFolder(c)} className={`text-xs ${cIconCls}`} title="删除目录（试卷移回未分类）">🗑</button>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 分隔拖拽条：左右拖动调侧栏宽度 */}
      <div
        onPointerDown={onSideDragStart}
        style={{ touchAction: "none" }}
        className="w-1.5 flex-shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-300 active:bg-blue-400 transition-colors"
        title="拖动调整目录栏宽度"
      />

      {/* 右侧内容区 */}
      <div className="flex-1 p-4 overflow-y-auto min-w-0 border-l">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-700">📄 试卷库</h2>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
        >
          <option value="">全部类型</option>
          {PAPER_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterTextbook}
          onChange={(e) => setFilterTextbook(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
        >
          <option value="">全部课本</option>
          {textbooks.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <a
          href="/tiku/snapshot"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
          title="拍照/截图识别后直接导出 Word，不入库"
        >
          📷 拍照转 Word
        </a>
        <button
          onClick={() => { setUploadFolder(filterFolder && filterFolder !== "none" ? filterFolder : ""); setUploadOpen(true); }}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
        >
          ＋ 上传试卷
        </button>
      </div>

      {/* 列表 */}
      {loading && papers.length === 0 ? (
        <p className="text-gray-400 text-sm p-4">加载中...</p>
      ) : papers.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📄</p>
          <p>还没有试卷，点击右上角「上传试卷」存入你的第一份 Word / PDF 试卷</p>
        </div>
      ) : (
        <div className="space-y-2">
          {papers.map((p) => (
            <div
              key={p.id}
              className="bg-white border rounded-lg px-4 py-3 flex items-center gap-3 hover:shadow-sm transition-shadow"
            >
              <span className="text-2xl">{p.fileType === "pdf" ? "📕" : "📘"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800 truncate">{p.title}</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{p.paperType}</span>
                  {p.textbook && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">{p.textbook.name}</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {p.fileName} · {formatSize(p.fileSize)} · {new Date(p.createdAt).toLocaleDateString("zh-CN")} · ⬇ 下载 {p.downloadCount} 次
                  {p.remarks ? ` · ${p.remarks}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleShare(p)}
                  className={`px-3 py-1.5 border rounded text-sm ${
                    copiedId === p.id
                      ? "text-green-600 border-green-300 bg-green-50"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  title="生成免登录的公开下载链接并复制，可发给任何人"
                >
                  {copiedId === p.id ? "✓ 链接已复制" : "分享"}
                </button>
                <a
                  href={`/tiku/api/papers/${p.id}/preview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 border rounded text-sm text-blue-600 hover:bg-blue-50"
                  title={p.fileType === "docx" ? "浏览器里直接打开（首次打开需服务器转换几秒）" : "浏览器里直接打开"}
                >
                  打开
                </a>
                <a
                  href={`/tiku/api/papers/${p.id}/download`}
                  className="px-3 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50"
                >
                  下载
                </a>
                {p.fileType === "docx" && (
                  <button
                    onClick={() => handleSplit(p)}
                    className="px-3 py-1.5 border rounded text-sm text-blue-600 hover:bg-blue-50"
                    title="跳转到上传分割页，把这份卷子拆成一道道题目入库"
                  >
                    拆题入库
                  </button>
                )}
                {p.lecturesPaperId ? (
                  <a
                    href={`/lectures/papers/${p.lecturesPaperId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 border rounded text-sm text-green-600 border-green-300 hover:bg-green-50"
                    title="已发送到讲义站，点击打开涂画讲题页"
                  >
                    已送讲题页 · 打开
                  </a>
                ) : (
                  <button
                    onClick={() => handleSendToLectures(p)}
                    disabled={sendingId === p.id}
                    className="px-3 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    title="把试卷原文件推给讲义站，涂画试卷页即可打开讲解"
                  >
                    {sendingId === p.id ? "发送中…" : "➡ 送讲题页"}
                  </button>
                )}
                <button
                  onClick={() => openEdit(p)}
                  className="px-3 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="px-3 py-1.5 border rounded text-sm text-red-500 hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 上传弹窗 */}
      {uploadOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={tryCloseUpload}>
          <div className="bg-white rounded-xl p-6 w-[520px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">上传试卷</h3>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (uploading) return;
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
              onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer mb-4 transition-colors ${
                dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300"
              }`}
            >
              {files.length > 0 ? (
                <div>
                  <p className="text-green-600 font-medium">已选择 {files.length} 个文件</p>
                  <p className="text-xs text-gray-400 mt-1">点击或拖拽可重新选择</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-500">拖拽 Word / PDF 试卷到此处，或点击选择（可多选）</p>
                  <p className="text-xs text-gray-400 mt-1">.docx ≤ 20MB · .pdf ≤ 30MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {files.length > 0 && (
              <div className="mb-4 border rounded-lg divide-y max-h-44 overflow-y-auto">
                {files.map((it, i) => (
                  <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0 truncate text-gray-700" title={it.file.name}>{it.file.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(it.file.size)}</span>
                    <span className={`text-xs flex-shrink-0 ${
                      it.status === "done" ? "text-green-600"
                      : it.status === "error" ? "text-red-500"
                      : it.status === "uploading" ? "text-blue-500"
                      : "text-gray-400"
                    }`}>
                      {it.status === "done" ? "✓ 成功"
                        : it.status === "error" ? `✗ 失败：${it.error || "未知错误"}`
                        : it.status === "uploading" ? "上传中…"
                        : "等待中"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {files.length > 1 ? (
                <p className="text-xs text-gray-400">多文件上传时各按文件名自动命名</p>
              ) : (
                <div>
                  <label className="text-sm text-gray-600">标题（留空用原文件名）</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="如：2026年上学期期末考试卷"
                    className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"
                  />
                </div>
              )}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm text-gray-600">类型</label>
                  <select
                    value={paperType}
                    onChange={(e) => setPaperType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg mt-1 text-sm bg-white"
                  >
                    {PAPER_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-sm text-gray-600">关联课本（可选）</label>
                  <select
                    value={textbookId}
                    onChange={(e) => setTextbookId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg mt-1 text-sm bg-white"
                  >
                    <option value="">不关联</option>
                    {textbooks.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-sm text-gray-600">存入目录</label>
                  <select
                    value={uploadFolder}
                    onChange={(e) => setUploadFolder(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg mt-1 text-sm bg-white"
                  >
                    <option value="">未分类</option>
                    {folderOptions.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">备注（可选）</label>
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="如：重点班用卷"
                  className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end items-center gap-2 mt-5">
              {uploadSummary && (
                <span className="text-sm text-gray-600 mr-auto">
                  完成：成功 {uploadSummary.ok} 个{uploadSummary.fail > 0 ? `，失败 ${uploadSummary.fail} 个` : ""}
                </span>
              )}
              {uploadSummary ? (
                <button onClick={tryCloseUpload} className="px-4 py-2 border rounded-lg text-sm text-gray-600">
                  关闭
                </button>
              ) : (
                <>
                  <button onClick={tryCloseUpload} className="px-4 py-2 border rounded-lg text-sm text-gray-600">
                    取消
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading || files.length === 0}
                    className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:bg-gray-300"
                  >
                    {uploading ? `上传中 ${uploadProgress}/${files.length}` : "存入试卷库"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editPaper && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditPaper(null)}>
          <div className="bg-white rounded-xl p-6 w-[480px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">编辑试卷信息</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">标题</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm text-gray-600">类型</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg mt-1 text-sm bg-white"
                  >
                    {PAPER_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-sm text-gray-600">关联课本</label>
                  <select
                    value={editTextbook}
                    onChange={(e) => setEditTextbook(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg mt-1 text-sm bg-white"
                  >
                    <option value="">不关联</option>
                    {textbooks.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-sm text-gray-600">目录</label>
                  <select
                    value={editFolder}
                    onChange={(e) => setEditFolder(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg mt-1 text-sm bg-white"
                  >
                    <option value="">未分类</option>
                    {folderOptions.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">备注</label>
                <input
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditPaper(null)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:bg-gray-300"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
