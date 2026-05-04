"use client";

import { useState, useEffect } from "react";

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
  onSelectChapter: (id: number, title: string) => void;
  onTextbookChange?: (id: number, name: string) => void;
}

export function ChapterTree({ selectedChapterId, onSelectChapter, onTextbookChange }: ChapterTreeProps) {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [selectedTextbookId, setSelectedTextbookId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  useEffect(() => {
    fetch("/api/textbooks")
      .then((r) => r.json())
      .then((d) => setTextbooks(d.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTextbookId) {
      setChapters([]);
      return;
    }
    fetch(`/api/chapters?textbookId=${selectedTextbookId}`)
      .then((r) => r.json())
      .then((d) => setChapters(d.data || []))
      .catch(() => {});
  }, [selectedTextbookId]);

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
            <button
              key={ch.id}
              onClick={() => onSelectChapter(ch.id, ch.title)}
              className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 transition-colors ${
                isSelected
                  ? "bg-blue-50 text-blue-700 border-l-4 border-l-blue-500"
                  : "text-gray-700 hover:bg-gray-50 border-l-4 border-l-transparent"
              }`}
            >
              {ch.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
