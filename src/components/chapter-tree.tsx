"use client";

import { useState, useEffect, useCallback } from "react";

interface Textbook {
  id: number;
  name: string;
}

interface Chapter {
  id: number;
  textbookId: number;
  parentId: number | null;
  title: string;
}

interface ChapterTreeProps {
  selectedChapterId: number | null;
  onSelectChapter: (id: number | null, title: string | null) => void;
  onTextbookChange?: (id: number | null, name: string | null) => void;
}

export function ChapterTree({ selectedChapterId, onSelectChapter, onTextbookChange }: ChapterTreeProps) {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [selectedTextbookId, setSelectedTextbookId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const fetchTextbooks = useCallback(() => {
    fetch("/api/textbooks")
      .then((r) => r.json())
      .then((d) => setTextbooks(d.data || []))
      .catch(() => {});
  }, []);

  const fetchChapters = useCallback((textbookId: number) => {
    fetch(`/api/chapters?textbookId=${textbookId}`)
      .then((r) => r.json())
      .then((d) => setChapters(d.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTextbooks();
  }, [fetchTextbooks]);

  useEffect(() => {
    if (!selectedTextbookId) return;
    fetchChapters(selectedTextbookId);
  }, [selectedTextbookId, fetchChapters]);

  const selectedTextbook = textbooks.find((t) => t.id === selectedTextbookId) || null;

  // 新增课本
  const handleAddTextbook = async () => {
    const name = window.prompt("请输入新课本的名称：");
    if (!name || !name.trim()) return;
    const res = await fetch("/api/textbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => null) : null;
      alert(d?.error || "新增课本失败");
      return;
    }
    fetchTextbooks();
  };

  // 重命名课本
  const handleRenameTextbook = async () => {
    if (!selectedTextbook) return;
    const name = window.prompt("新的课本名称：", selectedTextbook.name);
    if (!name || !name.trim() || name.trim() === selectedTextbook.name) return;
    const res = await fetch(`/api/textbooks/${selectedTextbook.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => null) : null;
      alert(d?.error || "重命名课本失败");
      return;
    }
    fetchTextbooks();
    onTextbookChange?.(selectedTextbook.id, name.trim());
  };

  // 删除课本
  const handleDeleteTextbook = async () => {
    if (!selectedTextbook) return;
    if (!window.confirm(`确定删除课本「${selectedTextbook.name}」吗？将同时删除该课本下的所有章节、课时和知识点（题目本身保留），此操作无法撤销。`)) return;
    const res = await fetch(`/api/textbooks/${selectedTextbook.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => null) : null;
      alert(d?.error || "删除课本失败");
      return;
    }
    setSelectedTextbookId(null);
    setChapters([]);
    fetchTextbooks();
    onTextbookChange?.(null, null);
    onSelectChapter(null, null);
  };

  // 新增章节
  const handleAddChapter = async () => {
    if (!selectedTextbookId) return;
    const title = window.prompt("请输入新章节的标题：");
    if (!title || !title.trim()) return;
    const res = await fetch("/api/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textbookId: selectedTextbookId, title: title.trim() }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => null) : null;
      alert(d?.error || "新增章节失败");
      return;
    }
    fetchChapters(selectedTextbookId);
  };

  // 重命名章节
  const handleRenameChapter = async (ch: Chapter) => {
    const title = window.prompt("新的章节标题：", ch.title);
    if (!title || !title.trim() || title.trim() === ch.title) return;
    const res = await fetch(`/api/chapters/${ch.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => null) : null;
      alert(d?.error || "重命名章节失败");
      return;
    }
    if (selectedTextbookId) fetchChapters(selectedTextbookId);
    // 如果改的正是当前选中的章节，同步更新父组件里的标题
    if (selectedChapterId === ch.id) onSelectChapter(ch.id, title.trim());
  };

  // 删除章节
  const handleDeleteChapter = async (ch: Chapter) => {
    if (!window.confirm(`确定删除章节「${ch.title}」吗？将同时删除该章节下的所有课时和知识点（题目本身保留），此操作无法撤销。`)) return;
    const res = await fetch(`/api/chapters/${ch.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => null) : null;
      alert(d?.error || "删除章节失败");
      return;
    }
    if (selectedTextbookId) fetchChapters(selectedTextbookId);
    // 如果删的正是当前选中的章节，通知父组件清空选中态
    if (selectedChapterId === ch.id) onSelectChapter(null, null);
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">章节目录</h3>
      </div>

      {/* Textbook selector */}
      <div className="p-3 border-b">
        <select
          value={selectedTextbookId ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            setChapters([]);
            setSelectedTextbookId(id);
            if (id) {
              const tb = textbooks.find((t) => t.id === id);
              if (tb) onTextbookChange?.(tb.id, tb.name);
            }
          }}
          className="w-full border rounded px-2 py-1.5 text-sm bg-white"
        >
          <option value="">选择课本</option>
          {textbooks.map((tb) => (
            <option key={tb.id} value={tb.id}>{tb.name}</option>
          ))}
        </select>

        {/* Textbook management */}
        <div className="flex gap-3 mt-2 text-xs">
          <button
            onClick={handleAddTextbook}
            className="text-blue-500 hover:text-blue-700 transition-colors"
          >
            + 新增课本
          </button>
          {selectedTextbook && (
            <>
              <button
                onClick={handleRenameTextbook}
                className="text-gray-400 hover:text-blue-600 transition-colors"
              >
                重命名课本
              </button>
              <button
                onClick={handleDeleteTextbook}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                删除课本
              </button>
            </>
          )}
        </div>
      </div>

      {/* Chapter list */}
      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
        {!selectedTextbookId && (
          <div className="p-6 text-center text-sm text-gray-400">请先选择课本</div>
        )}

        {selectedTextbookId && chapters.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">加载中...</div>
        )}

        {chapters.map((ch) => {
          const isSelected = selectedChapterId === ch.id;
          return (
            <div
              key={ch.id}
              className={`flex items-center border-b last:border-b-0 transition-colors ${
                isSelected
                  ? "bg-blue-50 border-l-4 border-l-blue-500"
                  : "hover:bg-gray-50 border-l-4 border-l-transparent"
              }`}
            >
              <button
                onClick={() => onSelectChapter(ch.id, ch.title)}
                className={`flex-1 text-left px-3 py-2 text-sm ${
                  isSelected ? "text-blue-700" : "text-gray-700"
                }`}
              >
                {ch.title}
              </button>
              <button
                onClick={() => handleRenameChapter(ch)}
                className="px-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                title="重命名章节"
              >
                改名
              </button>
              <button
                onClick={() => handleDeleteChapter(ch)}
                className="px-1 pr-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                title="删除章节"
              >
                删除
              </button>
            </div>
          );
        })}

        {selectedTextbookId && (
          <button
            onClick={handleAddChapter}
            className="w-full text-left px-3 py-2 text-xs text-blue-500 hover:bg-blue-50 transition-colors"
          >
            + 新增章节
          </button>
        )}
      </div>
    </div>
  );
}
