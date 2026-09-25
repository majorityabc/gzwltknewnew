// 服务端讲义导出：TipTap JSON → docx Buffer（供 API 路由使用，不依赖浏览器 API）
// MathJax 在 Next 打包后必然坏（动态 require 被打包器吞掉）
// 方案：子进程跑原生 node 做 latex→mml；mml→omml 用纯 JS 库函数
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _convertMathMl2Math: ((mml: string) => any) | null = null;
let _formulaAsImage = false; // PDF 导出时公式渲染为图片（LibreOffice 对 OMML 支持差）

async function latexToMathPng(latex: string): Promise<ImageRunT | null> {
  try {
    const { stdout } = await execFileAsync("node", ["scripts/latex2png.mjs", latex], {
      cwd: "/root/gzwltknewnew",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const buf = Buffer.from(stdout.trim(), "base64");
    if (!buf.length) return null;
    const meta = await sharp(buf).metadata();
    const w0 = meta.width || 100;
    const h0 = meta.height || 30;
    // 缩放到正文合理尺寸：高度 ≈ 18px（行内公式）
    const h = Math.max(14, Math.min(40, Math.round(h0 / 4)));
    const w = Math.round((w0 / h0) * h);
    return new ImageRun({ type: "png", data: buf, transformation: { width: w, height: h } });
  } catch (e) {
    console.warn("[export-lecture] 公式转图失败:", latex.slice(0, 40), e instanceof Error ? e.message : e);
    return null;
  }
}

async function latexToMathObj(latex: string) {
  if (!_convertMathMl2Math) {
    const mod = await import("@hungknguyen/docx-math-converter");
    _convertMathMl2Math = mod.convertMathMl2Math;
  }
  const { stdout } = await execFileAsync("node", ["scripts/latex2mml.mjs", latex], {
    cwd: "/root/gzwltknewnew",
    timeout: 30000,
  });
  return _convertMathMl2Math(stdout);
}
// 必须用 CJS 入口的 docx：docx-math-converter 是 CJS require("docx")，
// 若这里用 ESM import 会拿到另一个模块实例，导致 instanceof 检查失败、公式被静默丢弃
import type { TextRun as TextRunT, ImageRun as ImageRunT, Paragraph as ParagraphT, Table as DocxTableT, TableRow as DocxTableRowT, TableCell as DocxTableCellT } from "docx";
import { createRequire } from "node:module";
const _req = createRequire(import.meta.url);
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table: DocxTable,
  TableRow: DocxTableRow,
  TableCell: DocxTableCell,
  WidthType,
} = _req("docx") as typeof import("docx");
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

type InlineChild = TextRunT | ImageRunT | ReturnType<(typeof import("@hungknguyen/docx-math-converter"))["convertLatex2Math"]>;

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
        if (_formulaAsImage) {
          const img = await latexToMathPng(latex);
          if (img) { out.push(img); } else { out.push(new TextRun({ text: latex, size: 22, font: "SimSun" })); }
        } else {
          out.push(await latexToMathObj(latex));
        }
      } catch (e) {
        console.warn("[export-lecture] 公式转换失败:", latex.slice(0, 50), e instanceof Error ? e.message : e);
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

async function blockToParagraphs(block: TipTapNode): Promise<(ParagraphT | DocxTableT)[]> {
  // 表格
  if (block.type === "table") {
    const rows = (block.content || []).filter((r) => r.type === "tableRow");
    const docxRows: DocxTableRowT[] = [];
    for (const row of rows) {
      const cells = row.content || [];
      const cellNodes: DocxTableCellT[] = [];
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
    const out: ParagraphT[] = [];
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
  const onlyImages = kids.length > 0 && kids.every((k) => k instanceof (ImageRun as never));
  if (kids.length === 0) return [new Paragraph({ spacing: { after: 120 } })];

  // 编辑器 textAlign → Word 对齐
  const ta = block.attrs?.textAlign as string | undefined;
  const alignMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  };
  const isHeading = block.type === "heading";
  const alignment = onlyImages ? AlignmentType.CENTER : (ta && alignMap[ta]) || undefined;

  return [new Paragraph({
    children: kids,
    heading: isHeading ? headingMap[(block.attrs?.level as number) || 1] || HeadingLevel.HEADING_3 : undefined,
    alignment,
    // 首行缩进跟随编辑器段落属性：textIndent="0" 显式关闭才不缩（默认 2em 缩进）
    // 标题、纯图段、居中/右对齐段落始终不缩
    indent: !isHeading && !onlyImages && (!ta || ta === "left" || ta === "justify")
      && (block.attrs?.textIndent !== "0" && block.attrs?.textIndent !== "0em")
      ? { firstLine: 480 }  // 480 twips = 2 × 小四号字宽
      : undefined,
    spacing: { after: 120 },
  })];
}

/** 讲义 TipTap JSON → docx Buffer */
export async function lectureToDocxBuffer(title: string, docJson: string, opts?: { formulaAsImage?: boolean }): Promise<Buffer> {
  _formulaAsImage = !!opts?.formulaAsImage;
  let root: TipTapNode;
  try {
    root = JSON.parse(docJson);
  } catch {
    root = { type: "doc", content: [] };
  }
  const children: (ParagraphT | DocxTableT)[] = [
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
