import { mathJaxReady, convertLatex2Math } from "@hungknguyen/docx-math-converter";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Math as OMMLMath,
} from "docx";

// ---- types ----

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: { type: string }[];
}

export interface ProblemItem {
  id: number;
  content: string;
  difficulty: number;
  lessonTitle: string | null;
  questionType: string | null;
  sourceDate: string | null;
  remarks: string | null;
  knowledgePoints: { knowledgePoint: { id: number; name: string } }[];
}

export interface BasketItem {
  problemId: number;
  order: number;
  preview: string;
  knowledgePointName: string;
  chapterTitle: string;
  textbookName: string;
}

// ---- image dimension helper ----

function getImageNaturalSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 400, height: 200 });
    img.src = dataUrl;
  });
}

// ---- TipTap JSON → docx children ----

const MAX_PAGE_WIDTH_PX = 460;

type ParagraphInlineChild = TextRun | ImageRun | OMMLMath;

async function tipTapNodeToInlineChildren(
  node: TipTapNode,
): Promise<ParagraphInlineChild[]> {
  const results: ParagraphInlineChild[] = [];

  if (node.type === "text" && node.text) {
    const bold = node.marks?.some((m) => m.type === "bold");
    const italic = node.marks?.some((m) => m.type === "italic");
    const underline = node.marks?.some((m) => m.type === "underline");

    results.push(
      new TextRun({
        text: node.text,
        bold,
        italics: italic,
        underline: underline ? {} : undefined,
        size: 24,
        font: "SimSun",
      }),
    );
  }

  if (node.type === "inlineMath") {
    const latex = (node.attrs?.text as string) || "";
    if (latex) {
      try {
        const mathObj = convertLatex2Math(latex);
        results.push(mathObj);
      } catch (err) {
        console.warn("[export-docx] MathJax conversion failed for:", latex, err);
        // Fallback: display LaTeX as visible text
        results.push(
          new TextRun({
            text: `【公式：${latex}】`,
            size: 22,
            italics: true,
            font: "SimSun",
            color: "999999",
          }),
        );
      }
    }
  }

  if (node.type === "image") {
    const src = (node.attrs?.src as string) || "";
    if (src) {
      try {
        let w = 400;
        let h = 200;
        if (src.startsWith("data:")) {
          const natural = await getImageNaturalSize(src);
          w = natural.width;
          h = natural.height;
        }
        if (w > MAX_PAGE_WIDTH_PX) {
          h = Math.round(h * (MAX_PAGE_WIDTH_PX / w));
          w = MAX_PAGE_WIDTH_PX;
        }
        const base64 = src.replace(/^data:image\/\w+;base64,/, "");
        results.push(
          new ImageRun({
            type: "png",
            data: base64,
            transformation: { width: w, height: h },
          }),
        );
      } catch {
        // Skip broken images
      }
    }
  }

  if (node.content) {
    for (const child of node.content) {
      const childResults = await tipTapNodeToInlineChildren(child);
      results.push(...childResults);
    }
  }

  return results;
}

// ---- main export ----

export async function exportProblemsToDocx(
  problems: ProblemItem[],
  basketItems: BasketItem[],
): Promise<void> {
  // Wait for MathJax to initialize (loads fonts + macros)
  await mathJaxReady();

  const problemMap = new Map(problems.map((p) => [p.id, p]));
  const ordered = [...basketItems].sort((a, b) => a.order - b.order);
  const docChildren: Paragraph[] = [];

  docChildren.push(
    new Paragraph({
      text: "高中物理组卷",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  );

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const problem = problemMap.get(item.problemId);
    if (!problem) continue;

    const headerParts: string[] = [];
    headerParts.push(`第 ${i + 1} 题`);
    if (item.textbookName) headerParts.push(item.textbookName);
    if (item.chapterTitle) headerParts.push(item.chapterTitle);
    if (item.knowledgePointName) headerParts.push(item.knowledgePointName);

    const metaParts: string[] = [];
    metaParts.push(`难度：${"★".repeat(problem.difficulty)}`);
    if (problem.questionType) metaParts.push(`题型：${problem.questionType}`);
    if (problem.sourceDate) metaParts.push(`来源：${problem.sourceDate}`);

    docChildren.push(
      new Paragraph({
        spacing: { before: 300, after: 100 },
        children: [
          new TextRun({
            text: headerParts.join(" · "),
            bold: true,
            size: 26,
            font: "SimHei",
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: metaParts.join(" ｜ "),
            size: 20,
            color: "666666",
            font: "SimSun",
          }),
        ],
      }),
    );

    // --- Problem content ---
    try {
      const doc = JSON.parse(problem.content);
      const blockNodes: TipTapNode[] = doc.content || [];

      for (const block of blockNodes) {
        const isHeading = block.type === "heading";
        const level = (block.attrs?.level as number) || 1;

        const children = await tipTapNodeToInlineChildren(block);

        if (children.length === 0) {
          docChildren.push(new Paragraph({ spacing: { after: 120 } }));
          continue;
        }

        const headingMapping: Record<
          number,
          (typeof HeadingLevel)[keyof typeof HeadingLevel]
        > = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
        };

        docChildren.push(
          new Paragraph({
            spacing: { after: 120 },
            heading: isHeading
              ? headingMapping[level as number] || HeadingLevel.HEADING_3
              : undefined,
            children,
          }),
        );
      }
    } catch {
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "(题目内容解析失败)",
              italics: true,
              color: "999999",
              size: 24,
            }),
          ],
        }),
      );
    }

    // --- Notes ---
    if (problem.remarks) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 200, after: 120 },
          children: [
            new TextRun({
              text: `备注：${problem.remarks}`,
              size: 20,
              color: "888888",
              italics: true,
              font: "SimSun",
            }),
          ],
        }),
      );
    }

    // --- Separator ---
    if (i < ordered.length - 1) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          alignment: AlignmentType.CENTER,
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          },
          children: [],
        }),
      );
    }
  }

  if (ordered.length === 0) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "组卷篮为空", color: "999999", size: 24 }),
        ],
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `高中物理组卷_${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
