"use client";

import { useState } from "react";
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

interface ProblemListProps {
  problems: ProblemItem[];
  loading: boolean;
  selectedProblemId: number | null;
  basketProblemIds: Set<number>;
  selectedKpName: string | null;
  chapterId: number | null;
  textbookId: number | null;
  selectedKpId: number | null;
  selectedChapterTitle: string | null;
  onSelectProblem: (id: number) => void;
  onToggleBasket: (problem: ProblemItem) => void;
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
  textbookId,
  selectedKpId,
  selectedChapterTitle,
  onSelectProblem,
  onToggleBasket,
  onRefresh,
  emptyMessage,
}: ProblemListProps) {
  const [showUploadModal, setShowUploadModal] = useState(false);

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
                        className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded"
                      >
                        {kp.knowledgePoint.name}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
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
                      onClick={() => onSelectProblem(p.id)}
                      className="text-xs px-2 py-0.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      编辑
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
                    <span className="text-yellow-600 font-medium">备注：</span>
                    {p.remarks}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {chapterId !== null && textbookId !== null && selectedKpId !== null && selectedKpName !== null && (
        <UploadModal
          open={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          textbookId={textbookId}
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
