"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { UploadModal } from "@/components/upload-modal";

const ReadonlyContent = dynamic(
  () => import("@/components/tiptap/rich-text-editor").then((mod) => mod.RichTextEditor),
  { ssr: false },
);

interface ProblemKnowledgePoint {
  knowledgePoint: {
    id: number;
    name: string;
  };
}

export interface ProblemItem {
  id: number;
  content: string;
  difficulty: number;
  lessonTitle: string | null;
  questionType: string | null;
  sourceDate: string | null;
  remarks: string | null;
  createdAt: string;
  knowledgePoints: ProblemKnowledgePoint[];
}

interface KpSearchResult {
  id: number;
  name: string;
  chapterId: number;
  chapter?: { id: number; title: string; textbookId: number };
}

interface ProblemListProps {
  problems: ProblemItem[];
  loading: boolean;
  selectedProblemId: number | null;
  basketProblemIds: Set<number>;
  selectedKpName: string | null;
  chapterId: number | null;
  selectedKpId: number | null;
  selectedChapterTitle: string | null;
  onSelectProblem: (id: number) => void;
  onToggleBasket: (problem: ProblemItem) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
  emptyMessage?: string;
}

export function ProblemList({
  problems,
  loading,
  selectedProblemId,
  basketProblemIds,
  selectedKpName,
  chapterId,
  selectedKpId,
  selectedChapterTitle,
  onSelectProblem,
  onToggleBasket,
  onDelete,
  onRefresh,
  emptyMessage,
}: ProblemListProps) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  // Notes editing state
  const [notesOpenId, setNotesOpenId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // KP add state
  const [kpAddOpenId, setKpAddOpenId] = useState<number | null>(null);
  const [kpAddSearch, setKpAddSearch] = useState("");
  const [kpAddResults, setKpAddResults] = useState<KpSearchResult[]>([]);
  const [addingKp, setAddingKp] = useState(false);
  const kpSearchRef = useRef<HTMLDivElement>(null);

  // --- Notes handlers ---

  const openNotes = useCallback((p: ProblemItem) => {
    setNotesOpenId(p.id);
    setNotesDraft(p.remarks || "");
  }, []);

  const closeNotes = useCallback(() => {
    setNotesOpenId(null);
    setNotesDraft("");
  }, []);

  const saveNotes = useCallback(async (problemId: number) => {
    setSavingNotes(true);
    try {
      await fetch(`/api/problems/${problemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: notesDraft }),
      });
      closeNotes();
      onRefresh();
    } catch {
      // silent
    } finally {
      setSavingNotes(false);
    }
  }, [notesDraft, closeNotes, onRefresh]);

  // --- KP handlers ---

  const searchKps = useCallback(async (query: string) => {
    if (!query.trim()) {
      setKpAddResults([]);
      return;
    }
    const res = await fetch(`/api/knowledge-points?search=${encodeURIComponent(query)}`);
    const d = await res.json();
    setKpAddResults(d.data || []);
  }, []);

  const addKp = useCallback(async (problemId: number, kpId: number) => {
    setAddingKp(true);
    try {
      await fetch(`/api/problems/${problemId}/knowledge-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgePointId: kpId }),
      });
      setKpAddOpenId(null);
      setKpAddSearch("");
      setKpAddResults([]);
      onRefresh();
    } catch {
      // silent
    } finally {
      setAddingKp(false);
    }
  }, [onRefresh]);

  const removeKp = useCallback(async (problemId: number, kpId: number) => {
    try {
      await fetch(`/api/problems/${problemId}/knowledge-points/${kpId}`, {
        method: "DELETE",
      });
      onRefresh();
    } catch {
      // silent
    }
  }, [onRefresh]);

  // Close KP search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (kpSearchRef.current && !kpSearchRef.current.contains(e.target as Node)) {
        setKpAddOpenId(null);
        setKpAddSearch("");
        setKpAddResults([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="bg-white border rounded-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-gray-50 flex-shrink-0 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          {selectedKpName ? `「${selectedKpName}」题目列表` : "题目列表"}
        </h3>
        {chapterId !== null && selectedKpId !== null && selectedKpName !== null && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="text-xs px-2.5 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            + 上传题目
          </button>
        )}
      </div>

      {/* Problem list — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-8 text-center text-sm text-gray-400">加载中...</div>
        )}

        {!loading && problems.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            {emptyMessage || (selectedKpName ? `「${selectedKpName}」下暂无题目` : "暂无题目")}
          </div>
        )}

        {problems.map((p) => {
          const isInBasket = basketProblemIds.has(p.id);
          const isSelected = selectedProblemId === p.id;
          const isNotesOpen = notesOpenId === p.id;
          const isKpAddOpen = kpAddOpenId === p.id;

          return (
            <div
              key={p.id}
              className={`border-b hover:bg-gray-50 transition-colors ${
                isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "border-l-4 border-l-transparent"
              }`}
            >
              <div className="px-3 py-2">
                {/* Row 1: KP tags (left) + Action buttons (right) */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
                    {p.knowledgePoints.map((kp) => (
                      <span
                        key={kp.knowledgePoint.id}
                        className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded inline-flex items-center gap-0.5 group"
                      >
                        {kp.knowledgePoint.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeKp(p.id, kp.knowledgePoint.id);
                          }}
                          className="text-blue-400 hover:text-red-500 leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                          title="移除此标签"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setKpAddOpenId(isKpAddOpen ? null : p.id);
                        setKpAddSearch("");
                        setKpAddResults([]);
                      }}
                      className="text-xs px-1.5 py-0.5 text-blue-500 hover:bg-blue-50 rounded border border-dashed border-blue-300 transition-colors"
                    >
                      + 添加标签
                    </button>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleBasket(p)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        isInBasket
                          ? "bg-green-100 text-green-700"
                          : "text-green-600 hover:bg-green-50"
                      }`}
                    >
                      {isInBasket ? "已加入" : "加入组卷"}
                    </button>
                    <button
                      onClick={() => {
                        if (isNotesOpen) { closeNotes(); } else { openNotes(p); }
                      }}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        isNotesOpen
                          ? "bg-yellow-100 text-yellow-700"
                          : "text-yellow-600 hover:bg-yellow-50"
                      }`}
                    >
                      备注
                    </button>
                    <button
                      onClick={() => onSelectProblem(p.id)}
                      className="text-xs px-2 py-0.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("确定删除这道题？")) onDelete(p.id);
                      }}
                      className="text-xs px-2 py-0.5 text-red-400 hover:bg-red-50 rounded transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>

                {/* Row 2: Meta info */}
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                  <span>{"★".repeat(p.difficulty)}</span>
                  {p.questionType && <span className="bg-gray-100 px-1 rounded">{p.questionType}</span>}
                  {p.sourceDate && <span>{p.sourceDate}</span>}
                  {p.remarks && (
                    <span className="text-yellow-600">📝 有备注</span>
                  )}
                </div>

                {/* Problem content */}
                <div className="problem-card-content border-t pt-2 mt-1">
                  <ReadonlyContent
                    content={p.content}
                    editable={false}
                    plain={true}
                  />
                </div>

                {/* Remarks display */}
                {p.remarks && (
                  <div className="mt-2 text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded px-2.5 py-1.5">
                    <span className="text-yellow-600 font-medium">📝 备注：</span>
                    {p.remarks}
                  </div>
                )}

                {/* Notes editor (inline) */}
                {isNotesOpen && (
                  <div
                    className="mt-2 border-t pt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="输入备注..."
                      rows={3}
                      className="w-full border rounded px-2 py-1.5 text-xs resize-y"
                    />
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        onClick={() => saveNotes(p.id)}
                        disabled={savingNotes}
                        className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
                      >
                        {savingNotes ? "保存中..." : "保存备注"}
                      </button>
                      <button
                        onClick={closeNotes}
                        className="text-xs px-3 py-1 text-gray-500 border rounded hover:bg-gray-50 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {/* KP add search (inline) */}
                {isKpAddOpen && (
                  <div
                    className="mt-2 border-t pt-2"
                    onClick={(e) => e.stopPropagation()}
                    ref={kpSearchRef}
                  >
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={kpAddSearch}
                        onChange={(e) => setKpAddSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") searchKps(kpAddSearch);
                        }}
                        placeholder="搜索知识点..."
                        className="flex-1 border rounded px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => searchKps(kpAddSearch)}
                        className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                      >
                        搜索
                      </button>
                    </div>
                    {/* Search results */}
                    {kpAddResults.length > 0 && (
                      <div className="mt-1 border rounded max-h-32 overflow-y-auto">
                        {kpAddResults.map((kp) => {
                          const alreadyAdded = p.knowledgePoints.some(
                            (pkp) => pkp.knowledgePoint.id === kp.id
                          );
                          return (
                            <button
                              key={kp.id}
                              onClick={() => addKp(p.id, kp.id)}
                              disabled={alreadyAdded || addingKp}
                              className={`w-full text-left px-2 py-1 text-xs border-b last:border-b-0 transition-colors ${
                                alreadyAdded
                                  ? "text-gray-300 cursor-not-allowed bg-gray-50"
                                  : "hover:bg-blue-50 text-gray-700"
                              }`}
                            >
                              {kp.name}
                              {kp.chapter && (
                                <span className="text-gray-400 ml-1">— {kp.chapter.title}</span>
                              )}
                              {alreadyAdded && <span className="text-gray-300 ml-1">已添加</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {chapterId !== null && selectedKpId !== null && selectedKpName !== null && (
        <UploadModal
          open={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          chapterId={chapterId}
          chapterTitle={selectedChapterTitle || ""}
          kpId={selectedKpId}
          kpName={selectedKpName}
          onSaved={() => {
            setShowUploadModal(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
