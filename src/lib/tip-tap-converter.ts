import type { DocParagraph, ParagraphRun } from "./docx-parser";

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: TipTapNode[];
}

function styleToHeadingLevel(style: string | undefined): number | undefined {
  if (!style) return undefined;
  const match = style.match(/^heading(\d+)$/i);
  return match ? parseInt(match[1]) : undefined;
}

function runToInline(run: ParagraphRun): TipTapNode | null {
  if (run.type === "text") {
    const marks: TipTapNode[] = [];
    if (run.bold) marks.push({ type: "bold" });
    if (run.italic) marks.push({ type: "italic" });
    if (run.underline) marks.push({ type: "underline" });
    return {
      type: "text",
      text: run.text,
      ...(marks.length ? { marks } : {}),
    };
  }

  if (run.type === "formula") {
    return {
      type: "inlineMath",
      attrs: { text: run.latex },
    };
  }

  if (run.type === "image") {
    return {
      type: "image",
      attrs: { src: run.src, alt: run.alt || "" },
    };
  }

  return null;
}

export function docParagraphsToTipTapJson(paragraphs: DocParagraph[]): object {
  const content: TipTapNode[] = [];

  // 连续的表格行段落 → 一个 TipTap 表格节点（首行为表头）
  let tableBuffer: ParagraphRun[][][] = [];
  function flushTable() {
    if (!tableBuffer.length) return;
    const colCount = Math.max(...tableBuffer.map((r) => r.length));
    const rows = tableBuffer.map((cells, ri) => ({
      type: "tableRow",
      content: Array.from({ length: colCount }, (_, ci) => {
        const cellRuns = cells[ci] || [];
        const inlines = cellRuns.map(runToInline).filter(Boolean) as TipTapNode[];
        return {
          type: ri === 0 ? "tableHeader" : "tableCell",
          content: [inlines.length ? { type: "paragraph", content: inlines } : { type: "paragraph" }],
        };
      }),
    }));
    content.push({ type: "table", content: rows });
    tableBuffer = [];
  }

  for (const para of paragraphs) {
    if (para.tableCells && para.tableCells.length) {
      tableBuffer.push(para.tableCells);
      continue;
    }
    flushTable();

    const inlines = para.runs.map(runToInline).filter(Boolean) as TipTapNode[];

    // Skip empty paragraphs
    if (!inlines.length) continue;

    const headingLevel = styleToHeadingLevel(para.style);

    content.push({
      type: headingLevel ? "heading" : "paragraph",
      ...(headingLevel ? { attrs: { level: headingLevel } } : {}),
      content: inlines,
    });
  }
  flushTable();

  // If no content, add an empty paragraph to avoid empty editor error
  if (!content.length) {
    content.push({ type: "paragraph" });
  }

  return { type: "doc", content };
}
