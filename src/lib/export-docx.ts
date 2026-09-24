// MathJax 在 SSR 求值时崩溃，必须运行时动态加载
let _mathMod: typeof import("@hungknguyen/docx-math-converter") | null = null;
async function loadMath() {
  if (!_mathMod) {
    _mathMod = await import("@hungknguyen/docx-math-converter");
    await _mathMod.mathJaxReady();
  }
  return _mathMod;
}
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
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
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
  answer?: string | null;
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

function mimeToImageRunType(mime: string): "png" | "jpg" | "gif" {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/gif") return "gif";
  return "png"; // 其他格式按 png 兜底
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ---- TipTap JSON → docx children ----

const MAX_PAGE_WIDTH_PX = 460;

// ---- 导出排版：题干 / 图片 / 选项·小问 分类 ----

function nodePlainText(node: TipTapNode): string {
  let out = node.text || "";
  if (Array.isArray(node.content)) {
    for (const child of node.content) out += nodePlainText(child);
  }
  return out;
}

/** 选项行：A. / A、/ A．/ A) / A： 等（仅限单字母 A–D 开头） */
const OPTION_LINE_RE = /^\s*[A-D][.、．:：)）]/;
/** 小问行：（1）/ (1) / ① 等 */
const SUB_QUESTION_RE = /^\s*[（(]\s*\d+\s*[）)]|^\s*[①-⑳]/;

export function isOptionLine(text: string): boolean {
  return OPTION_LINE_RE.test(text);
}

export function isSubQuestionLine(text: string): boolean {
  return SUB_QUESTION_RE.test(text);
}

/** 把 block 里的 image 行内节点抽出来，返回去图后的 block 和图片节点列表 */
function splitOutImages(block: TipTapNode): {
  stripped: TipTapNode;
  images: TipTapNode[];
} {
  const images: TipTapNode[] = [];
  const copy = JSON.parse(JSON.stringify(block)) as TipTapNode;
  const walk = (nodes: TipTapNode[]): TipTapNode[] =>
    nodes.filter((n) => {
      if (n.type === "image") {
        images.push(n);
        return false;
      }
      if (Array.isArray(n.content)) n.content = walk(n.content);
      return true;
    });
  if (Array.isArray(copy.content)) copy.content = walk(copy.content);
  return { stripped: copy, images };
}

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
        const { convertLatex2Math } = await loadMath();
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
        let base64: string;
        let mimeType = "image/png";
        let w = 400;
        let h = 200;

        if (src.startsWith("data:")) {
          // data URL：从 mime 部分解析真实类型
          const mimeMatch = src.match(/^data:([^;,]+)/);
          if (mimeMatch) mimeType = mimeMatch[1];
          base64 = src.replace(/^data:[^,]*,/, "");
          const natural = await getImageNaturalSize(src);
          w = natural.width;
          h = natural.height;
        } else {
          // /api/images/<id> 等引用：fetch 获取字节和真实 Content-Type
          const res = await fetch(src);
          if (!res.ok) throw new Error(`获取图片失败: ${res.status}`);
          mimeType =
            res.headers.get("Content-Type")?.split(";")[0].trim() || mimeType;
          const buffer = await res.arrayBuffer();
          base64 = arrayBufferToBase64(buffer);
          const blobUrl = URL.createObjectURL(
            new Blob([buffer], { type: mimeType }),
          );
          try {
            const natural = await getImageNaturalSize(blobUrl);
            w = natural.width;
            h = natural.height;
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        }

        if (w > MAX_PAGE_WIDTH_PX) {
          h = Math.round(h * (MAX_PAGE_WIDTH_PX / w));
          w = MAX_PAGE_WIDTH_PX;
        }
        results.push(
          new ImageRun({
            type: mimeToImageRunType(mimeType),
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
  includeAnswers = false,
): Promise<void> {
  // Wait for MathJax to initialize (loads fonts + macros)
  const { convertLatex2Math } = await loadMath();

  const problemMap = new Map(problems.map((p) => [p.id, p]));
  const ordered = [...basketItems].sort((a, b) => a.order - b.order);
  const docChildren: (Paragraph | DocxTable)[] = [];

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

    // --- Problem content ---
    try {
      const doc = JSON.parse(problem.content);
      const blockNodes: TipTapNode[] = doc.content || [];

      // 按版式要求分三组：题干文字 → 图片 → 选项/小问
      const stemBlocks: TipTapNode[] = [];
      const tailBlocks: TipTapNode[] = [];
      const imageNodes: TipTapNode[] = [];

      for (const block of blockNodes) {
        const { stripped, images } = splitOutImages(block);
        imageNodes.push(...images);
        if (!nodePlainText(stripped).trim()) continue; // 纯图片段
        const text = nodePlainText(block);
        if (isOptionLine(text) || isSubQuestionLine(text)) {
          tailBlocks.push(stripped);
        } else {
          stemBlocks.push(stripped);
        }
      }

      const headingMapping: Record<
        number,
        (typeof HeadingLevel)[keyof typeof HeadingLevel]
      > = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
      };

      const renderBlocks = async (blocks: TipTapNode[]) => {
        for (const block of blocks) {
          // 表格节点 → Word 表格（带边框）
          if (block.type === "table") {
            const rows = (block.content || []).filter((r) => r.type === "tableRow");
            const docxRows: DocxTableRow[] = [];
            for (const row of rows) {
              const cells = (row.content || []) as TipTapNode[];
              if (!cells.length) continue;
              const cellNodes: DocxTableCell[] = [];
              for (const cell of cells) {
                const inlineChildren: ParagraphInlineChild[] = [];
                for (const cellBlock of cell.content || []) {
                  const ch = await tipTapNodeToInlineChildren(cellBlock);
                  inlineChildren.push(...ch);
                }
                cellNodes.push(
                  new DocxTableCell({
                    children: [new Paragraph({ children: inlineChildren })],
                  }),
                );
              }
              docxRows.push(new DocxTableRow({ children: cellNodes }));
            }
            if (docxRows.length > 0) {
              docChildren.push(
                new DocxTable({
                  rows: docxRows,
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
                  },
                }),
              );
            }
            continue;
          }

          const isHeading = block.type === "heading";
          const level = (block.attrs?.level as number) || 1;

          const children = await tipTapNodeToInlineChildren(block);

          if (children.length === 0) {
            docChildren.push(new Paragraph({ spacing: { after: 120 } }));
            continue;
          }

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
      };

      // 1) 题干：所有文字行在一起
      await renderBlocks(stemBlocks);

      // 2) 题目图片：集中居中排版
      for (const img of imageNodes) {
        const children = await tipTapNodeToInlineChildren(img);
        if (children.length > 0) {
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 },
              children,
            }),
          );
        }
      }

      // 3) 选项（选择题）/ 小问（解答题）
      await renderBlocks(tailBlocks);

      // 4) 答案（可选）
      if (includeAnswers && problem.answer) {
        try {
          const adoc = JSON.parse(problem.answer);
          const ablocks = (adoc.content || []) as TipTapNode[];
          if (ablocks.some((b) => nodePlainText(b).trim() || b.type === "image")) {
            docChildren.push(
              new Paragraph({
                spacing: { before: 80, after: 60 },
                children: [new TextRun({ text: "【答案】", bold: true, color: "2F5496", size: 24 })],
              }),
            );
            await renderBlocks(ablocks);
          }
        } catch { /* 答案解析失败则跳过 */ }
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


// ---- 拍照转 Word：整卷不入库直接导出（客户端生成下载，复用上面的渲染函数）----
export async function exportBlocksToDocxDownload(
  title: string,
  blockNodes: TipTapNode[],
): Promise<void> {
  const { convertLatex2Math } = await loadMath();

  const docChildren: (Paragraph | DocxTable)[] = [];

  // 卷头：标题 + 日期
  docChildren.push(
    new Paragraph({
      text: title || "试卷",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: new Date().toISOString().slice(0, 10),
          size: 20,
          color: "888888",
        }),
      ],
    }),
  );

  const headingMapping: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  };

  for (const block of blockNodes) {
    // 表格 → 带边框 Word 表格
    if (block.type === "table") {
      const rows = (block.content || []).filter((r) => r.type === "tableRow");
      const docxRows: DocxTableRow[] = [];
      for (const row of rows) {
        const cells = (row.content || []) as TipTapNode[];
        if (!cells.length) continue;
        const cellNodes: DocxTableCell[] = [];
        for (const cell of cells) {
          const inlineChildren: ParagraphInlineChild[] = [];
          for (const cellBlock of cell.content || []) {
            const ch = await tipTapNodeToInlineChildren(cellBlock);
            inlineChildren.push(...ch);
          }
          cellNodes.push(
            new DocxTableCell({
              children: [new Paragraph({ children: inlineChildren })],
            }),
          );
        }
        docxRows.push(new DocxTableRow({ children: cellNodes }));
      }
      if (docxRows.length > 0) {
        docChildren.push(
          new DocxTable({
            rows: docxRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
              left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
              right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
            },
          }),
        );
      }
      continue;
    }

    // 图片段 → 居中
    const plain = nodePlainText(block).trim();
    const isImageBlock =
      !plain &&
      JSON.stringify(block).includes('"image"');
    if (isImageBlock) {
      const children = await tipTapNodeToInlineChildren(block);
      if (children.length > 0) {
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children,
          }),
        );
      }
      continue;
    }

    const isHeading = block.type === "heading";
    const level = (block.attrs?.level as number) || 1;
    const children = await tipTapNodeToInlineChildren(block);
    if (children.length === 0) {
      docChildren.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }
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

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(title || "试卷").replace(/[\\/:*?"<>|]/g, "_")}_${new Date()
    .toISOString()
    .slice(0, 10)}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
