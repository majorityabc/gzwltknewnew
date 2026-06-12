"use client";

import type { ProblemItem } from "./problem-list";

export interface BasketItem {
  problemId: number;
  order: number;
  preview: string;
  knowledgePointName: string;
  chapterTitle: string;
  textbookName: string;
}

interface ExamBasketProps {
  items: BasketItem[];
  problemMap: Map<number, ProblemItem>;
  onRemove: (problemId: number) => void;
  onClear: () => void;
  onMoveUp: (problemId: number) => void;
  onMoveDown: (problemId: number) => void;
  onExport: () => void;
  isOpen: boolean;
  onToggle: () => void;
  exporting: boolean;
}

export function ExamBasket({
  items,
  problemMap,
  onRemove,
  onClear,
  onMoveUp,
  onMoveDown,
  onExport,
  isOpen,
  onToggle,
  exporting,
}: ExamBasketProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      {/* Collapsed bar */}
      <div
        onClick={onToggle}
        className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-blue-700 transition-colors"
      >
        <div className="flex items-center gap-3 text-sm">
          <span>📋 组卷篮</span>
          <span className="bg-white text-blue-600 px-2 py-0.5 rounded-full text-xs font-bold">
            {items.length} 题
          </span>
        </div>
        <span className="text-xs">{isOpen ? "收起 ▼" : "展开 ▲"}</span>
      </div>

      {/* Expanded panel */}
      {isOpen && (
        <div className="bg-white border-t shadow-lg max-h-[40vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              从题目列表点击「加入组卷」来添加题目
            </div>
          ) : (
            <div>
              {items.map((item, idx) => {
                const p = problemMap.get(item.problemId);
                return (
                  <div
                    key={item.problemId}
                    className="border-b px-4 py-2 flex items-start gap-3 text-sm"
                  >
                    <div className="flex flex-col items-center gap-0.5 pt-0.5">
                      <button
                        onClick={() => onMoveUp(item.problemId)}
                        disabled={idx === 0}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 leading-none"
                        title="上移"
                      >
                        ▲
                      </button>
                      <span className="text-xs text-gray-300">{idx + 1}</span>
                      <button
                        onClick={() => onMoveDown(item.problemId)}
                        disabled={idx === items.length - 1}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 leading-none"
                        title="下移"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs text-gray-400">
                          {item.textbookName} · {item.chapterTitle}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 truncate">{item.preview}</p>
                      {p && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{"★".repeat(p.difficulty)}</span>
                          {p.questionType && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-1 rounded">
                              {p.questionType}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => onRemove(item.problemId)}
                      className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 mt-1"
                      title="移除"
                    >
                      移除
                    </button>
                  </div>
                );
              })}

              {/* Actions */}
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t">
                <button
                  onClick={onClear}
                  className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                >
                  清空全部
                </button>
                <button
                  onClick={onExport}
                  disabled={exporting || items.length === 0}
                  className="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {exporting ? "导出中..." : "导出 Word"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
