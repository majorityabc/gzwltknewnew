"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface KnowledgePoint {
  id: number;
  name: string;
  chapterId: number;
  chapter?: { id: number; title: string; textbookId: number };
  _count?: { problems: number };
}

interface KnowledgePointListProps {
  chapterId: number | null;
  chapterTitle: string | null;
  textbookId: number | null;
  selectedKpId: number | null;
  onSelectKnowledgePoint: (id: number, name: string) => void;
}

export function KnowledgePointList({
  chapterId,
  chapterTitle,
  textbookId,
  selectedKpId,
  onSelectKnowledgePoint,
}: KnowledgePointListProps) {
  const [editingKpId, setEditingKpId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editChapterId, setEditChapterId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<{ id: number; title: string }[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [chapterKps, setChapterKps] = useState<KnowledgePoint[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgePoint[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // 合并知识点：源标签 → 目标标签
  const [mergeSource, setMergeSource] = useState<KnowledgePoint | null>(null);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeResults, setMergeResults] = useState<KnowledgePoint[]>([]);
  const [merging, setMerging] = useState(false);
  const [addingKp, setAddingKp] = useState(false);
  const [newKpName, setNewKpName] = useState("");
  const [savingKp, setSavingKp] = useState(false);

  // Load KPs for selected chapter
  const loadChapterKps = useCallback(async () => {
    if (!chapterId) {
      setChapterKps([]);
      return;
    }
    try {
      const r = await fetch(`/tiku/api/knowledge-points?chapterId=${chapterId}`);
      const d = await r.json();
      setChapterKps(d.data || []);
    } catch {
      setChapterKps([]);
    }
  }, [chapterId]);

  useEffect(() => { loadChapterKps(); }, [loadChapterKps]);

  const searchMergeTargets = useCallback(async (q: string, sourceId: number) => {
    setMergeQuery(q);
    if (!q.trim()) { setMergeResults([]); return; }
    try {
      const r = await fetch(`/tiku/api/knowledge-points?search=${encodeURIComponent(q.trim())}`);
      const d = await r.json();
      setMergeResults((d.data || []).filter((k: KnowledgePoint) => k.id !== sourceId));
    } catch { setMergeResults([]); }
  }, []);

  const handleMerge = useCallback(async (target: KnowledgePoint) => {
    if (!mergeSource) return;
    const srcCount = mergeSource._count?.problems ?? 0;
    if (!window.confirm(`把「${mergeSource.name}」的 ${srcCount} 道题并入「${target.name}」？\n合并后「${mergeSource.name}」标签将被删除，不可恢复。`)) return;
    setMerging(true);
    try {
      const r = await fetch("/tiku/api/knowledge-points/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: mergeSource.id, targetId: target.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "合并失败");
      alert(`✓ 已合并：${d.data.moved} 道题移入「${d.data.target.name}」`);
      if (selectedKpId === mergeSource.id) onSelectKnowledgePoint(target.id, target.name);
      setMergeSource(null);
      setMergeQuery("");
      setMergeResults([]);
      loadChapterKps();
    } catch (e) {
      alert(e instanceof Error ? e.message : "合并失败");
    } finally {
      setMerging(false);
    }
  }, [mergeSource, selectedKpId, onSelectKnowledgePoint, loadChapterKps]);

  const startEdit = useCallback(async (kp: KnowledgePoint) => {
    setEditingKpId(kp.id);
    setEditName(kp.name);
    setEditChapterId(kp.chapterId);
    if (textbookId && chapters.length === 0) {
      try {
        const r = await fetch(`/tiku/api/chapters?textbookId=${textbookId}`);
        const d = await r.json();
        setChapters(d.data || []);
      } catch { /* 忽略 */ }
    }
  }, [textbookId, chapters.length]);

  const handleSaveEdit = useCallback(async () => {
    if (editingKpId === null || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const r = await fetch(`/tiku/api/knowledge-points/${editingKpId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), chapterId: editChapterId }),
      });
      if (!r.ok) { alert("保存失败，请重试"); return; }
      if (editChapterId !== chapterId) {
        // 移到了别的章节：从当前列表移除
        setChapterKps((prev) => prev.filter((k) => k.id !== editingKpId));
      } else {
        setChapterKps((prev) => prev.map((k) => k.id === editingKpId ? { ...k, name: editName.trim() } : k));
      }
      setEditingKpId(null);
    } catch {
      alert("保存失败，请重试");
    } finally {
      setSavingEdit(false);
    }
  }, [editingKpId, editName, editChapterId, chapterId]);

  const handleDelete = useCallback(async (kpId: number) => {
    if (!window.confirm("确定删除该知识点？关联的题目将保留（仅移除标签关联）。")) return;
    setDeletingId(kpId);
    try {
      await fetch(`/tiku/api/knowledge-points/${kpId}`, { method: "DELETE" });
      setChapterKps((prev) => prev.filter((kp) => kp.id !== kpId));
      setSearchResults((prev) => prev.filter((kp) => kp.id !== kpId));
      if (selectedKpId === kpId) {
        onSelectKnowledgePoint(0, ""); // signal deselection
      }
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  }, [selectedKpId, onSelectKnowledgePoint]);

  const handleAddKp = useCallback(async () => {
    if (!newKpName.trim() || !chapterId) return;
    setSavingKp(true);
    try {
      await fetch("/tiku/api/knowledge-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, name: newKpName.trim() }),
      });
      setNewKpName("");
      setAddingKp(false);
      await loadChapterKps();
    } catch {
      // silent
    } finally {
      setSavingKp(false);
    }
  }, [newKpName, chapterId, loadChapterKps]);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const res = await fetch(`/tiku/api/knowledge-points?search=${encodeURIComponent(query)}`);
    const d = await res.json();
    setSearchResults(d.data || []);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayKps = chapterId ? chapterKps : [];

  return (
    <div className="bg-white border rounded-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">知识点</h3>
      </div>

      {/* Search bar */}
      <div className="p-3 border-b">
        <div ref={searchRef} className="relative">
          <div className="flex gap-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { doSearch(searchQuery); setShowDropdown(true); }
              }}
              placeholder="搜索知识点..."
              className="flex-1 border rounded px-2 py-1.5 text-xs"
            />
            <button
              onClick={() => { doSearch(searchQuery); setShowDropdown(true); }}
              className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
            >
              搜索
            </button>
          </div>

          {/* Search dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border rounded-b shadow-lg z-10 max-h-48 overflow-y-auto">
              {searchResults.map((kp) => {
                const isSelected = selectedKpId === kp.id;
                return (
                  <div
                    key={kp.id}
                    className={`flex items-center border-b last:border-b-0 ${
                      isSelected ? "bg-blue-50" : ""
                    }`}
                  >
                    <button
                      onClick={() => {
                        onSelectKnowledgePoint(kp.id, kp.name);
                        setSearchQuery("");
                        setSearchResults([]);
                        setShowDropdown(false);
                      }}
                      className={`flex-1 text-left px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors ${
                        isSelected ? "text-blue-700" : "text-gray-700"
                      }`}
                    >
                      {kp.name}
                      {kp.chapter && (
                        <span className="text-gray-400 ml-1">— {kp.chapter.title}</span>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(kp.id); }}
                      disabled={deletingId === kp.id}
                      className="px-2 py-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded text-xs font-bold transition-colors flex-shrink-0"
                      title="删除知识点"
                    >
                      {deletingId === kp.id ? "..." : "×"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add knowledge point button (only when chapter selected) */}
      {chapterId && (
        <div className="px-3 py-2 border-b">
          {addingKp ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={newKpName}
                onChange={(e) => setNewKpName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddKp(); }}
                placeholder="输入知识点名称"
                className="flex-1 border rounded px-2 py-1 text-xs"
                autoFocus
              />
              <button
                onClick={handleAddKp}
                disabled={savingKp || !newKpName.trim()}
                className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
              >
                {savingKp ? "..." : "确认"}
              </button>
              <button
                onClick={() => { setAddingKp(false); setNewKpName(""); }}
                className="px-2 py-1 text-gray-500 text-xs border rounded hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingKp(true)}
              className="w-full text-xs px-3 py-1.5 text-blue-600 hover:bg-blue-50 border border-dashed border-blue-300 rounded transition-colors"
            >
              + 添加知识点
            </button>
          )}
        </div>
      )}

      {/* Chapter KPs or empty state */}
      <div className="flex-1 overflow-y-auto">
        {!chapterId && (
          <div className="p-6 text-center text-sm text-gray-400">
            点击左侧章节查看知识点，或使用上方搜索
          </div>
        )}

        {chapterId && displayKps.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">
            {chapterTitle ? `「${chapterTitle}」下暂无知识点` : "加载中..."}
          </div>
        )}

        {displayKps.map((kp) => {
          const isSelected = selectedKpId === kp.id;
          if (editingKpId === kp.id) {
            return (
              <div key={kp.id} className="border-b last:border-b-0 border-l-4 border-l-amber-400 bg-amber-50/50 px-3 py-2 space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-xs"
                  autoFocus
                />
                <select
                  value={editChapterId ?? ""}
                  onChange={(e) => setEditChapterId(Number(e.target.value))}
                  className="w-full border rounded px-2 py-1 text-xs text-gray-600"
                >
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit || !editName.trim()}
                    className="flex-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:bg-gray-300"
                  >
                    {savingEdit ? "保存中..." : "保存"}
                  </button>
                  <button
                    onClick={() => setEditingKpId(null)}
                    className="flex-1 px-2 py-1 text-gray-500 text-xs border rounded hover:bg-gray-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div
              key={kp.id}
              className={`group flex items-center border-b last:border-b-0 transition-colors ${
                isSelected
                  ? "bg-blue-50 border-l-4 border-l-blue-500"
                  : "border-l-4 border-l-transparent"
              }`}
            >
              <button
                onClick={() => onSelectKnowledgePoint(kp.id, kp.name)}
                className={`flex-1 text-left px-3 py-2 text-sm ${
                  isSelected ? "text-blue-700" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {kp.name}
                {kp._count && (
                  <span className="ml-1.5 text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                    {kp._count.problems}题
                  </span>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMergeSource(kp); setMergeQuery(""); setMergeResults([]); }}
                className="px-1.5 py-1 text-gray-300 hover:text-purple-500 hover:bg-purple-50 rounded text-xs transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                title="合并到其他知识点（题目全部搬走，本标签删除）"
              >
                ⇄
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); startEdit(kp); }}
                className="px-1.5 py-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded text-xs transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                title="改名 / 移动到其他章节"
              >
                ✏️
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(kp.id); }}
                disabled={deletingId === kp.id}
                className="px-2 py-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded text-xs font-bold transition-colors flex-shrink-0"
                title="删除知识点"
              >
                {deletingId === kp.id ? "..." : "×"}
              </button>
            </div>
          );
        })}
      </div>

      {/* 合并知识点弹窗 */}
      {mergeSource && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setMergeSource(null)}>
          <div className="bg-white rounded-xl p-5 w-[420px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-1">合并知识点</h3>
            <p className="text-xs text-gray-500 mb-3">
              把「<span className="text-purple-600 font-medium">{mergeSource.name}</span>」（{mergeSource._count?.problems ?? 0} 题）并入另一个知识点，源标签删除。
            </p>
            <input
              type="text"
              value={mergeQuery}
              onChange={(e) => searchMergeTargets(e.target.value, mergeSource.id)}
              placeholder="搜索目标知识点…"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
              autoFocus
            />
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              {mergeResults.length === 0 ? (
                <p className="text-xs text-gray-400 p-3 text-center">{mergeQuery.trim() ? "没有匹配的知识点" : "输入关键词搜索目标"}</p>
              ) : (
                mergeResults.map((kp) => (
                  <button
                    key={kp.id}
                    onClick={() => handleMerge(kp)}
                    disabled={merging}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-b last:border-b-0 disabled:opacity-50"
                  >
                    <span className="text-gray-800">{kp.name}</span>
                    {kp._count && <span className="ml-1.5 text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">{kp._count.problems}题</span>}
                    {kp.chapter && <span className="block text-[11px] text-gray-400 mt-0.5">{kp.chapter.title}</span>}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={() => setMergeSource(null)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
