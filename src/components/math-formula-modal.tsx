"use client";

import { useEffect, useRef, useState } from "react";
import "mathlive/static.css";
import "mathlive/fonts.css";

/**
 * 可视化公式编辑弹窗（MathLive，网页版 Word 公式编辑器）
 * - 点符号键盘拼公式：根号、分数、上下标、希腊字母全都有
 * - 确认后输出 LaTeX，由调用方插入编辑器
 */

interface MathFormulaModalProps {
  open: boolean;
  initialLatex?: string;
  title?: string;
  onConfirm: (latex: string) => void;
  onCancel: () => void;
}

interface MathFieldElement extends HTMLElement {
  value: string;
  focus: () => void;
  setOptions: (opts: Record<string, unknown>) => void;
}

export function MathFormulaModal({
  open,
  initialLatex = "",
  title = "插入公式",
  onConfirm,
  onCancel,
}: MathFormulaModalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<MathFieldElement | null>(null);
  const [ready, setReady] = useState(false);

  // 打开时才懒加载 mathlive（~1MB 不进首屏）
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      await import("mathlive");
      if (mounted) setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !ready || !hostRef.current) return;
    hostRef.current.innerHTML = "";
    const mf = document.createElement("math-field") as MathFieldElement;
    mf.setOptions({
      virtualKeyboardMode: "onfocus", // 聚焦即弹出符号键盘（桌面也弹）
      keypressSound: null,
    });
    mf.value = initialLatex;
    mf.style.width = "100%";
    mf.style.fontSize = "22px";
    mf.style.padding = "10px";
    mf.style.border = "2px solid #93c5fd";
    mf.style.borderRadius = "8px";
    hostRef.current.appendChild(mf);
    mfRef.current = mf;
    setTimeout(() => mf.focus(), 50);
  }, [open, ready, initialLatex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[92vw] max-w-[560px] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-800">∑ {title}</h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="text-xs text-gray-500 mb-2">
          在下方输入框点一下，会弹出符号键盘：√ 根号、分数、上标下标、α β θ ω 希腊字母都能点出来
        </div>

        {ready ? (
          <div ref={hostRef} />
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">公式编辑器加载中…</div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => {
              const latex = mfRef.current?.value?.trim() || "";
              if (latex) onConfirm(latex);
              else onCancel();
            }}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            插入
          </button>
        </div>
      </div>
    </div>
  );
}
