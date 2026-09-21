"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

/**
 * 语音输入按钮（路线A：浏览器 Web Speech API）
 * 点击开始说话 → 实时识别 → 再点停止 → DeepSeek 把口语转成公式文本 → 插入编辑器
 * 仅 Chrome/Edge 可用；不支持的浏览器按钮禁用并提示。
 */

interface VoiceInputButtonProps {
  /** 拿到转换后的文本（含 $LaTeX$），由调用方决定插入到哪里 */
  onResult: (text: string) => void;
  disabled?: boolean;
}

type Phase = "idle" | "recording" | "converting";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** 把含 $...$ 的文本转成 tiptap 行内节点数组（文字 + inlineMath） */
export function latexTextToInlineNodes(text: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const parts = text.split(/(\$[^$]+\$)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.length > 2 && part.startsWith("$") && part.endsWith("$")) {
      const latex = part.slice(1, -1).trim();
      if (latex) nodes.push({ type: "inlineMath", attrs: { text: latex } });
      continue;
    }
    if (part.trim()) nodes.push({ type: "text", text: part });
  }
  return nodes;
}

/** 把转换后的答案文本作为新段落追加到编辑器末尾 */
export function insertVoiceTextIntoEditor(editor: Editor, text: string): void {
  const nodes = latexTextToInlineNodes(text);
  if (nodes.length === 0) return;
  editor
    .chain()
    .focus("end")
    .insertContent({ type: "paragraph", content: nodes })
    .run();
}

export function VoiceInputButton({ onResult, disabled }: VoiceInputButtonProps) {
  const [supported, setSupported] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    setSupported(getRecognition() !== null);
  }, []);

  useEffect(() => {
    return () => {
      try { recogRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  const convert = async (raw: string) => {
    setPhase("converting");
    try {
      const res = await fetch("/tiku/api/voice-to-formula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
      });
      const data = await res.json();
      onResult(data.text || raw);
    } catch {
      onResult(raw); // 网络失败也绝不丢用户的话
    } finally {
      setPhase("idle");
      setInterim("");
      finalRef.current = "";
    }
  };

  const toggle = () => {
    if (phase === "recording") {
      try { recogRef.current?.stop(); } catch { /* noop */ }
      return;
    }
    if (phase !== "idle") return;

    const recog = getRecognition();
    if (!recog) return;
    recogRef.current = recog;
    recog.lang = "zh-CN";
    recog.continuous = true;
    recog.interimResults = true;
    finalRef.current = "";

    recog.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    recog.onerror = (e) => {
      console.warn("[voice] error:", e.error);
      setPhase("idle");
      setInterim("");
      if (e.error === "not-allowed") {
        alert("麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试");
      }
    };
    recog.onend = () => {
      const said = (finalRef.current + " " + interim).trim();
      if (said) {
        void convert(said);
      } else {
        setPhase("idle");
        setInterim("");
      }
    };

    setPhase("recording");
    try {
      recog.start();
    } catch {
      setPhase("idle");
    }
  };

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="当前浏览器不支持语音输入，请用 Chrome 或 Edge"
        className="px-2.5 py-1 border rounded text-xs text-gray-300 cursor-not-allowed"
      >
        🎤 语音
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || phase === "converting"}
        className={`px-2.5 py-1 border rounded text-xs transition-colors ${
          phase === "recording"
            ? "bg-red-500 border-red-500 text-white animate-pulse"
            : phase === "converting"
              ? "bg-blue-50 border-blue-300 text-blue-500"
              : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        {phase === "recording" ? "⏹ 停止" : phase === "converting" ? "⏳ 转换中…" : "🎤 语音"}
      </button>
      {phase === "recording" && (
        <span className="text-xs text-red-500 max-w-[260px] truncate">
          正在听：{interim || "…"}
        </span>
      )}
    </span>
  );
}
