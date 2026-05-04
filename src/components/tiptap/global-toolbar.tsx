"use client";

import type { Editor } from "@tiptap/react";
import { useState, useCallback, useRef, useEffect } from "react";
import katex from "katex";

const GREEK_LETTERS = [
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ",
  "ν", "ξ", "π", "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω",
  "Δ", "Θ", "Λ", "Σ", "Φ", "Ψ", "Ω",
];

const LATEX_SYMBOLS: { label: string; code: string }[] = [
  { label: "分式", code: "\\frac{a}{b}" },
  { label: "平方根", code: "\\sqrt{x}" },
  { label: "n次根", code: "\\sqrt[n]{x}" },
  { label: "下标", code: "x_{0}" },
  { label: "上标", code: "x^{2}" },
  { label: "度数", code: "^{\\circ}" },
  { label: "点乘", code: "\\cdot" },
  { label: "叉乘", code: "\\times" },
  { label: "约等于", code: "\\approx" },
  { label: "不等于", code: "\\neq" },
  { label: "大于等于", code: "\\ge" },
  { label: "小于等于", code: "\\le" },
  { label: "矢量", code: "\\vec{F}" },
  { label: "积分", code: "\\int_{a}^{b}" },
  { label: "求和", code: "\\sum_{i=1}^{n}" },
];

interface GlobalToolbarProps {
  activeEditor: Editor | null;
  editorActive: Record<string, boolean>;
}

function ToolButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-sm rounded transition-colors ${
        active ? "bg-blue-500 text-white" : "hover:bg-gray-200 text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

export function GlobalToolbar({ activeEditor, editorActive }: GlobalToolbarProps) {
  const [showFormulaInput, setShowFormulaInput] = useState(false);
  const [formulaText, setFormulaText] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showFormulaInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showFormulaInput]);

  const insertFormula = useCallback(() => {
    if (!formulaText.trim() || !activeEditor) return;
    activeEditor
      .chain()
      .focus()
      .insertContent({ type: "inlineMath", attrs: { text: formulaText } })
      .run();
    setFormulaText("");
    setShowFormulaInput(false);
  }, [activeEditor, formulaText]);

  const updatePreview = useCallback((code: string) => {
    if (!code) { setPreviewHtml(""); return; }
    try {
      setPreviewHtml(katex.renderToString(code, { throwOnError: false, displayMode: false }));
    } catch {
      setPreviewHtml(`<span class="text-red-500">${code}</span>`);
    }
  }, []);

  const insertGreek = useCallback(
    (letter: string) => {
      if (!activeEditor) return;
      activeEditor.chain().focus().insertContent(letter).run();
    },
    [activeEditor],
  );

  const insertSymbol = useCallback(
    (code: string) => {
      if (!activeEditor) return;
      activeEditor
        .chain()
        .focus()
        .insertContent({ type: "inlineMath", attrs: { text: code } })
        .run();
    },
    [activeEditor],
  );

  return (
    <div className="bg-white border-b shadow-sm">
      {/* Formatting row */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 border-b">
        <ToolButton
          onClick={() => activeEditor?.chain().focus().toggleBold().run()}
          active={editorActive.bold}
          title="粗体"
        >
          <strong>B</strong>
        </ToolButton>
        <ToolButton
          onClick={() => activeEditor?.chain().focus().toggleItalic().run()}
          active={editorActive.italic}
          title="斜体"
        >
          <em>I</em>
        </ToolButton>
        <ToolButton
          onClick={() => activeEditor?.chain().focus().toggleUnderline().run()}
          active={editorActive.underline}
          title="下划线"
        >
          <span className="underline">U</span>
        </ToolButton>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        <ToolButton
          onClick={() => activeEditor?.chain().focus().toggleSuperscript().run()}
          active={editorActive.superscript}
          title="上标"
        >
          x<sup>2</sup>
        </ToolButton>
        <ToolButton
          onClick={() => activeEditor?.chain().focus().toggleSubscript().run()}
          active={editorActive.subscript}
          title="下标"
        >
          x<sub>0</sub>
        </ToolButton>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        <ToolButton
          onClick={() => setShowFormulaInput(!showFormulaInput)}
          active={showFormulaInput}
          title="插入公式"
        >
          <span className="font-serif italic text-blue-600 font-bold">𝑓</span>
        </ToolButton>
      </div>

      {/* Formula input panel */}
      {showFormulaInput && (
        <div className="px-3 py-2 border-b bg-blue-50">
          <div className="flex items-center gap-2 mb-2">
            <input
              ref={inputRef}
              type="text"
              value={formulaText}
              onChange={(e) => { setFormulaText(e.target.value); updatePreview(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") insertFormula();
                if (e.key === "Escape") { setShowFormulaInput(false); setFormulaText(""); }
              }}
              placeholder="输入 LaTeX, 如: \frac{v-v_0}{t}"
              className="flex-1 border rounded px-2 py-1 text-sm font-mono"
            />
            <button onClick={insertFormula} className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
              插入
            </button>
            {previewHtml && (
              <span className="px-2" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {LATEX_SYMBOLS.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => insertSymbol(s.code)}
                className="px-2 py-0.5 text-xs bg-white border rounded hover:bg-blue-100"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Greek letters */}
      <div className="flex flex-wrap gap-0.5 px-3 py-1.5">
        {GREEK_LETTERS.map((letter) => (
          <button
            key={letter}
            type="button"
            onClick={() => insertGreek(letter)}
            className="px-1.5 py-0.5 text-sm border rounded hover:bg-blue-50 transition-colors"
          >
            {letter}
          </button>
        ))}
      </div>
    </div>
  );
}
