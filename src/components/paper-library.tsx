"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 试卷库：整卷存档（Word / PDF），支持上传、下载、编辑、删除、Word 拆题入库 */

interface PaperItem {
  id: number;
  title: string;
  paperType: string;
  remarks: string | null;
  fileName: string;
  fileSize: number;
  fileType: "docx" | "pdf";
  downloadCount: number;
  textbookId: number | null;
  textbook: { name: string } | null;
  createdAt: string;
}

interface TextbookItem {
  id: number;
  name: string;
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
  const [loading, setLoading] = useState(false);

  // 上传弹窗
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [paperType, setPaperType] = useState("其他");
  const [textbookId, setTextbookId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [uploading, setUploading] = useState(false);
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
      const res = await fetch(`/tiku/api/papers?${params.toString()}`);
      const data = await res.json();
      if (data.data) setPapers(data.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filterType, filterTextbook]);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  useEffect(() => {
    fetch("/tiku/api/textbooks")
      .then((r) => r.json())
      .then((d) => setTextbooks(d.data || []))
      .catch(() => {});
  }, []);

  const resetUpload = () => {
    setFile(null);
    setTitle("");
    setPaperType("其他");
    setTextbookId("");
    setRemarks("");
    setUploadOpen(false);
  };

  const handleUpload = async () => {
    if (!file) return alert("请先选择文件");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("paperType", paperType);
      fd.append("textbookId", textbookId);
      fd.append("remarks", remarks);
      const res = await fetch("/tiku/api/papers", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      resetUpload();
      loadPapers();
    } catch (e) {
      alert(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
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

  return (
    <div className="p-4 h-full overflow-y-auto">
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
          onClick={() => setUploadOpen(true)}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={resetUpload}>
          <div className="bg-white rounded-xl p-6 w-[520px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">上传试卷</h3>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f && /\.(docx|pdf)$/i.test(f.name)) setFile(f);
                else if (f) alert("仅支持 .docx 或 .pdf 文件");
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer mb-4 transition-colors ${
                dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300"
              }`}
            >
              {file ? (
                <div>
                  <p className="text-green-600 font-medium">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatSize(file.size)} · 点击重新选择</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-500">拖拽 Word / PDF 试卷到此处，或点击选择</p>
                  <p className="text-xs text-gray-400 mt-1">.docx ≤ 20MB · .pdf ≤ 30MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">标题（留空自动提取）</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="如：2026年上学期期末考试卷"
                  className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"
                />
              </div>
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

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={resetUpload} className="px-4 py-2 border rounded-lg text-sm text-gray-600">
                取消
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !file}
                className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:bg-gray-300"
              >
                {uploading ? "上传中..." : "存入试卷库"}
              </button>
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
  );
}
