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
  answer?: string | null;
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
  const [copyingId, setCopyingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  /** 复制到讲义：tiptap JSON → 讲义可识别的 HTML（公式带回 data-inline-math 标记，图片转存公开目录） */
  async function copyToLecture(prob: ProblemItem) {
    setCopyingId(prob.id);
    try {
      const doc = JSON.parse(prob.content) as { content?: TiptapNode[] };
      const htmlParts: string[] = [];
      const plainParts: string[] = [];
      for (const node of doc.content || []) {
        htmlParts.push(await nodeToHtml(node));
        plainParts.push(nodeToText(node));
      }
      const html = htmlParts.join("");
      const plain = plainParts.join("\n");
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      setCopiedId(prob.id);
      setTimeout(() => setCopiedId((c) => (c === prob.id ? null : c)), 3000);
    } catch (e) {
      alert("复制失败：" + (e instanceof Error ? e.message : e));
    } finally {
      setCopyingId(null);
    }
  }

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
                      onClick={() => copyToLecture(p)}
                      disabled={copyingId === p.id}
                      className={`text-xs px-2 py-0.5 rounded transition-colors disabled:opacity-50 ${
                        copiedId === p.id ? "bg-green-100 text-green-700" : "text-purple-600 hover:bg-purple-50"
                      }`}
                      title="复制为讲义格式（公式/图片都能正常显示），到讲义编辑器里 Ctrl+V"
                    >
                      {copyingId === p.id ? "复制中…" : copiedId === p.id ? "✓ 已复制" : "复制到讲义"}
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


/* ========= 复制到讲义：tiptap JSON → HTML 转换 ========= */

type TiptapNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string }[];
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 题目图片转存到讲义公开目录（/tiku/api/images 是管理员专属，学生访问会裂图） */
async function migrateImage(src: string): Promise<string> {
  if (!src.startsWith("/tiku/api/images/")) return src;  // 已是公开地址直接用
  const blob = await fetch(src).then((r) => {
    if (!r.ok) throw new Error("图片拉取失败");
    return r.blob();
  });
  // 统一转 PNG dataURL（pad-image 接口只收 png）
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = URL.createObjectURL(blob);
  });
  const r = await fetch("/lectures/api/pad-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  }).then((r) => r.json());
  if (!r.data?.url) throw new Error("图片转存失败");
  return r.data.url as string;
}

async function inlineToHtml(node: TiptapNode): Promise<string> {
  if (node.type === "text") {
    let s = escapeHtml(node.text || "");
    for (const m of node.marks || []) {
      if (m.type === "bold") s = `<strong>${s}</strong>`;
      else if (m.type === "italic") s = `<em>${s}</em>`;
      else if (m.type === "underline") s = `<u>${s}</u>`;
      else if (m.type === "superscript") s = `<sup>${s}</sup>`;
      else if (m.type === "subscript") s = `<sub>${s}</sub>`;
    }
    return s;
  }
  if (node.type === "inlineMath") {
    const tex = String(node.attrs?.text || "");
    return `<span data-inline-math data-text="${escapeHtml(tex)}">${escapeHtml(tex)}</span>`;
  }
  if (node.type === "image") {
    const src = await migrateImage(String(node.attrs?.src || ""));
    const w = node.attrs?.width ? ` style="width:${node.attrs.width}%" data-width="${node.attrs.width}"` : "";
    return `<img src="${src}"${w}>`;
  }
  if (node.type === "hardBreak") return "<br>";
  return "";
}

async function nodeToHtml(node: TiptapNode): Promise<string> {
  const inner = (await Promise.all((node.content || []).map(inlineToHtml))).join("");
  switch (node.type) {
    case "paragraph": return `<p>${inner}</p>`;
    case "heading": return `<h${node.attrs?.level || 2}>${inner}</h${node.attrs?.level || 2}>`;
    case "bulletList": {
      const items = (await Promise.all((node.content || []).map(nodeToHtml))).join("");
      return `<ul>${items}</ul>`;
    }
    case "orderedList": {
      const items = (await Promise.all((node.content || []).map(nodeToHtml))).join("");
      return `<ol>${items}</ol>`;
    }
    case "listItem": return `<li>${inner}</li>`;
    case "blockquote": return `<blockquote>${inner}</blockquote>`;
    default: return inner ? `<p>${inner}</p>` : "";
  }
}

function nodeToText(node: TiptapNode): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "inlineMath") return `$${node.attrs?.text || ""}$`;
  return (node.content || []).map(nodeToText).join("");
}
