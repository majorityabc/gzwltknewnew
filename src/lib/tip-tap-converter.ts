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

  for (const para of paragraphs) {
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

  // If no content, add an empty paragraph to avoid empty editor error
  if (!content.length) {
    content.push({ type: "paragraph" });
  }

  return { type: "doc", content };
}
