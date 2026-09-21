"use client";

import { useState } from "react";
import type { ProblemItem } from "./problem-list";

export interface BasketItem {
  problemId: number;
  order: number;
  preview: string;
  knowledgePointName: string;
  chapterTitle: string;
  textbookName: string;
}

interface BasketViewProps {
  items: BasketItem[];
  problemMap: Map<number, ProblemItem>;
  onRemove: (problemId: number) => void;
  onClear: () => void;
  onMoveUp: (problemId: number) => void;
  onMoveDown: (problemId: number) => void;
  onExport: (includeAnswers: boolean) => void;
  exporting: boolean;
  onBack: () => void;
}

/** 组卷篮全屏页：调整顺序 / 移除 / 下载 Word / 返回继续组卷 */
export function BasketView({
  items,
  problemMap,
  onRemove,
  onClear,
  onMoveUp,
  onMoveDown,
  onExport,
  exporting,
  onBack,
}: BasketViewProps) {
  const [includeAnswers, setIncludeAnswers] = useState(false);

  return (
    <div className="flex-1 min-h-0 mt-2 flex flex-col bg-white rounded-lg shadow-sm border">
      {/* 头部 */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-lg">
        <h2 className="text-base font-bold text-gray-800">🧺 组卷篮（{items.length} 题）</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAnswers}
              onChange={(e) => setIncludeAnswers(e.target.checked)}
            />
            附答案
          </label>
          <button
            onClick={() => onExport(includeAnswers)}
            disabled={exporting || items.length === 0}
            className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? "导出中..." : "⬇ 下载 Word"}
          </button>
          <button
            onClick={onBack}
            className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
          >
            ← 继续组卷
          </button>
        </div>
      </div>

      {/* 题目列表 */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            篮子是空的——从题目列表点击「加入组卷」来添加题目
          </div>
        ) : (
          items.map((item, idx) => {
            const p = problemMap.get(item.problemId);
            return (
              <div
                key={item.problemId}
                className="border-b px-5 py-3 flex items-start gap-3 text-sm"
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
                  <span className="text-xs font-bold text-blue-600">{idx + 1}</span>
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
                      {item.textbookName} · {item.chapterTitle} · {item.knowledgePointName}
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
          })
        )}
      </div>

      {items.length > 0 && (
        <div className="px-5 py-2 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            清空全部
          </button>
        </div>
      )}
    </div>
  );
}
