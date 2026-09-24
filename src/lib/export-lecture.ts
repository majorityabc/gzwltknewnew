// 服务端讲义导出：TipTap JSON → docx Buffer（供 API 路由使用，不依赖浏览器 API）
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
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
} from "docx";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: { type: string }[];
}

type InlineChild = TextRun | ImageRun | ReturnType<(typeof import("@hungknguyen/docx-math-converter"))["convertLatex2Math"]>;

const MAX_PAGE_WIDTH_PX = 560; // A4 正文区约 560px @96dpi

/** 图片 src → 磁盘字节。/lectures/uploads/* 走 gzwljy 的 public 目录直读 */
async function loadImageBytes(src: string): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    if (src.startsWith("data:")) {
      const mime = src.match(/^data:([^;,]+)/)?.[1] || "image/png";
      return { buf: Buffer.from(src.replace(/^data:[^,]*,/, ""), "base64"), mime };
    }
    let p = src;
    if (p.startsWith("/lectures/uploads/")) {
      p = path.join("/root/gzwljy/public", p.replace("/lectures", ""));
    } else if (p.startsWith("/uploads/")) {
      p = path.join("/root/gzwljy/public", p);
    } else if (p.startsWith("/tiku/uploads/")) {
      p = path.join("/root/gzwltknewnew/public", p.replace("/tiku", ""));
    } else if (p.startsWith("http")) {
      const res = await fetch(src, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const mime = res.headers.get("content-type")?.split(";")[0] || "image/png";
      return { buf: Buffer.from(await res.arrayBuffer()), mime };
    } else {
      return null;
    }
    const buf = await fs.readFile(p);
    const mime = p.endsWith(".jpg") || p.endsWith(".jpeg") ? "image/jpeg" : p.endsWith(".gif") ? "image/gif" : "image/png";
    return { buf, mime };
  } catch {
    return null;
  }
}

async function inlineChildren(node: TipTapNode): Promise<InlineChild[]> {
  const out: InlineChild[] = [];

  if (node.type === "text" && node.text) {
    out.push(new TextRun({
      text: node.text,
      bold: node.marks?.some((m) => m.type === "bold"),
      italics: node.marks?.some((m) => m.type === "italic"),
      underline: node.marks?.some((m) => m.type === "underline") ? {} : undefined,
      superScript: node.marks?.some((m) => m.type === "superscript"),
      subScript: node.marks?.some((m) => m.type === "subscript"),
      size: 24,
      font: "SimSun",
    }));
  }

  if (node.type === "inlineMath" || node.type === "math") {
    const latex = (node.attrs?.text as string) || (node.attrs?.latex as string) || "";
    if (latex) {
      try {
        const { convertLatex2Math } = await loadMath();
        out.push(convertLatex2Math(latex));
      } catch {
        out.push(new TextRun({ text: `【公式：${latex}】`, size: 22, italics: true, font: "SimSun", color: "999999" }));
      }
    }
  }

  if (node.type === "image" || node.type === "figureFrame") {
    const src = (node.attrs?.src as string) || "";
    if (src) {
      const img = await loadImageBytes(src);
      if (img) {
        try {
          const meta = await sharp(img.buf).metadata();
          let w = meta.width || 400;
          let h = meta.height || 200;
          // 编辑器里的 width 是百分比（相对正文宽）
          const pct = typeof node.attrs?.width === "number" ? node.attrs.width : null;
          if (pct) {
            w = Math.round((MAX_PAGE_WIDTH_PX * pct) / 100);
            h = Math.round(h * (w / (meta.width || w)));
          }
          if (w > MAX_PAGE_WIDTH_PX) {
            h = Math.round(h * (MAX_PAGE_WIDTH_PX / w));
            w = MAX_PAGE_WIDTH_PX;
          }
          const type = img.mime === "image/jpeg" ? "jpg" : img.mime === "image/gif" ? "gif" : "png";
          out.push(new ImageRun({ type, data: img.buf, transformation: { width: w, height: h } }));
        } catch { /* 坏图跳过 */ }
      }
    }
  }

  if (node.type === "hardBreak") {
    out.push(new TextRun({ break: 1 }));
  }

  if (node.content) {
    for (const c of node.content) out.push(...(await inlineChildren(c)));
  }
  return out;
}

const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
};

async function blockToParagraphs(block: TipTapNode): Promise<(Paragraph | DocxTable)[]> {
  // 表格
  if (block.type === "table") {
    const rows = (block.content || []).filter((r) => r.type === "tableRow");
    const docxRows: DocxTableRow[] = [];
    for (const row of rows) {
      const cells = row.content || [];
      const cellNodes: DocxTableCell[] = [];
      for (const cell of cells) {
        const kids: InlineChild[] = [];
        for (const cb of cell.content || []) kids.push(...(await inlineChildren(cb)));
        cellNodes.push(new DocxTableCell({ children: [new Paragraph({ children: kids })] }));
      }
      if (cellNodes.length) docxRows.push(new DocxTableRow({ children: cellNodes }));
    }
    if (!docxRows.length) return [];
    return [new DocxTable({
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
    })];
  }

  // 列表
  if (block.type === "bulletList" || block.type === "orderedList") {
    const out: Paragraph[] = [];
    for (const item of block.content || []) {
      const kids: InlineChild[] = [];
      for (const cb of item.content || []) kids.push(...(await inlineChildren(cb)));
      out.push(new Paragraph({
        children: kids,
        bullet: block.type === "bulletList" ? { level: 0 } : undefined,
        numbering: block.type === "orderedList" ? { reference: "default-numbering", level: 0 } : undefined,
        spacing: { after: 80 },
      }));
    }
    return out;
  }

  const kids = await inlineChildren(block);
  const onlyImages = kids.length > 0 && kids.every((k) => k instanceof ImageRun);
  if (kids.length === 0) return [new Paragraph({ spacing: { after: 120 } })];

  return [new Paragraph({
    children: kids,
    heading: block.type === "heading" ? headingMap[(block.attrs?.level as number) || 1] || HeadingLevel.HEADING_3 : undefined,
    alignment: onlyImages ? AlignmentType.CENTER : undefined,
    spacing: { after: 120 },
  })];
}

/** 讲义 TipTap JSON → docx Buffer */
export async function lectureToDocxBuffer(title: string, docJson: string): Promise<Buffer> {
  await loadMath();
  let root: TipTapNode;
  try {
    root = JSON.parse(docJson);
  } catch {
    root = { type: "doc", content: [] };
  }
  const children: (Paragraph | DocxTable)[] = [
    new Paragraph({ text: title || "讲义", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
  ];
  for (const block of root.content || []) {
    children.push(...(await blockToParagraphs(block)));
  }
  const doc = new Document({
    numbering: { config: [{ reference: "default-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
