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
  { label: "角度", code: "\\theta" },
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

interface ToolbarProps {
  editor: Editor;
}

export function Toolbar({ editor }: ToolbarProps) {
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
    if (!formulaText.trim()) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "inlineMath",
        attrs: { text: formulaText },
      })
      .run();
    setFormulaText("");
    setShowFormulaInput(false);
  }, [editor, formulaText]);

  const updatePreview = useCallback((code: string) => {
    if (!code) {
      setPreviewHtml("");
      return;
    }
    try {
      setPreviewHtml(
        katex.renderToString(code, { throwOnError: false, displayMode: false }),
      );
    } catch {
      setPreviewHtml(`<span class="text-red-500">${code}</span>`);
    }
  }, []);

  const insertGreek = useCallback(
    (letter: string) => {
      editor.chain().focus().insertContent(letter).run();
    },
    [editor],
  );

  const insertSymbol = useCallback(
    (code: string) => {
      // Insert directly as a formula node
      editor
        .chain()
        .focus()
        .insertContent({
          type: "inlineMath",
          attrs: { text: code },
        })
        .run();
    },
    [editor],
  );

  const ToolButton = ({
    onClick,
    active,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-sm rounded transition-colors ${
        active
          ? "bg-blue-500 text-white"
          : "hover:bg-gray-200 text-gray-700"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="border-b bg-gray-50">
      {/* Formatting toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b">
        <ToolButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="粗体"
        >
          <strong>B</strong>
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="斜体"
        >
          <em>I</em>
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="下划线"
        >
          <span className="underline">U</span>
        </ToolButton>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        <ToolButton
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          active={editor.isActive("superscript")}
          title="上标 (x²)"
        >
          x<sup>2</sup>
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          active={editor.isActive("subscript")}
          title="下标 (x₀)"
        >
          x<sub>0</sub>
        </ToolButton>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        <ToolButton
          onClick={() => setShowFormulaInput(!showFormulaInput)}
          active={showFormulaInput}
          title="插入公式 (LaTeX)"
        >
          <span className="font-serif italic text-blue-600">𝑓</span>
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
              onChange={(e) => {
                setFormulaText(e.target.value);
                updatePreview(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") insertFormula();
                if (e.key === "Escape") {
                  setShowFormulaInput(false);
                  setFormulaText("");
                }
              }}
              placeholder="输入 LaTeX 公式, 如: \frac{v-v_0}{t}"
              className="flex-1 border rounded px-2 py-1 text-sm font-mono"
            />
            <button
              type="button"
              onClick={insertFormula}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
            >
              插入
            </button>
            {previewHtml && (
              <span
                className="px-2 text-lg"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>

          {/* Quick LaTeX templates */}
          <div className="flex flex-wrap gap-1 mb-2">
            {LATEX_SYMBOLS.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => insertSymbol(s.code)}
                className="px-2 py-0.5 text-xs bg-white border rounded hover:bg-blue-100"
                title={s.code}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Greek letters panel */}
      <div className="flex flex-wrap gap-0.5 px-2 py-1">
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
