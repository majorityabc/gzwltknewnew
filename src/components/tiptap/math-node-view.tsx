"use client";

import { NodeViewWrapper } from "@tiptap/react";
import { useState, useRef, useEffect, useCallback } from "react";
import katex from "katex";

export function MathNodeView(props: {
  node: { attrs: { text: string } };
  updateAttributes: (attrs: { text: string }) => void;
  selected: boolean;
}) {
  const { text } = props.node.attrs;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const renderMath = useCallback((source: string) => {
    if (!source) return "";
    try {
      return katex.renderToString(source, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return `<span style="color:red">${source}</span>`;
    }
  }, []);

  const handleSave = useCallback(() => {
    props.updateAttributes({ text: editValue });
    setIsEditing(false);
  }, [editValue, props]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      }
      if (e.key === "Escape") {
        setEditValue(text);
        setIsEditing(false);
      }
    },
    [handleSave, text],
  );

  if (isEditing) {
    return (
      <NodeViewWrapper as="span" className="inline-math editing">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="border border-blue-400 rounded px-1 py-0.5 text-sm font-mono bg-blue-50 outline-none w-40"
          placeholder="LaTeX..."
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`inline-math cursor-pointer px-0.5 ${props.selected ? "bg-blue-100 rounded" : ""}`}
      onDoubleClick={() => {
        setEditValue(text);
        setIsEditing(true);
      }}
      dangerouslySetInnerHTML={{ __html: renderMath(text) }}
    />
  );
}
