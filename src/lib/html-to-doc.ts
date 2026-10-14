import type { DocContent, DocParagraph, ParagraphRun } from "./docx-parser";

/**
 * 把 Word / PowerPoint / 网页复制出来的 HTML 转成 DocContent（段落 + runs），
 * 供上传弹窗的「分割 → 标注 → 保存」流程复用。
 * - 保留加粗 / 斜体 / 下划线
 * - 图片：data: 直接保留；file:/// 按序替换为剪贴板读出的图片数据
 * - 表格：每行一段，单元格之间用「 ｜ 」分隔
 * - 标题 → style: "Heading"
 */

function preClean(html: string): string {
  let s = html;
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, "");
  s = s.replace(/<xml[\s\S]*?<\/xml>/gi, "");
  s = s.replace(/<o:p>\s*<\/o:p>/gi, "");
  return s;
}

const BLOCKS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
  "LI", "TR", "BLOCKQUOTE", "SECTION", "ARTICLE", "UL", "OL", "TABLE",
]);

interface InlineFmt {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export function htmlToDocContent(html: string, imageDataUrls: string[]): DocContent {
  const dom = new DOMParser().parseFromString(preClean(html), "text/html");
  const paragraphs: DocParagraph[] = [];
  let imgIdx = 0;

  let runs: ParagraphRun[] = [];
  let style: string | undefined;

  const flush = () => {
    while (runs.length && runs[0].type === "text" && !(runs[0] as { text: string }).text.trim()) runs.shift();
    while (runs.length) {
      const last = runs[runs.length - 1];
      if (last.type === "text" && !last.text.trim()) runs.pop();
      else break;
    }
    if (runs.length) paragraphs.push({ runs, style });
    runs = [];
    style = undefined;
  };

  const walk = (node: Node, fmt: InlineFmt) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").replace(/\s+/g, " ");
      if (t) runs.push({ type: "text", text: t, ...fmt });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (["SCRIPT", "STYLE", "HEAD", "TITLE", "META", "LINK"].includes(tag)) return;
    if (tag === "BR") { flush(); return; }
    if (tag === "IMG") {
      let src = el.getAttribute("src") || "";
      if (/^file:\/\/\//i.test(src)) {
        src = imageDataUrls[imgIdx] || "";
        imgIdx++;
      }
      if (src) {
        const w = parseInt(el.getAttribute("width") || "", 10);
        const run: ParagraphRun = { type: "image", src };
        if (Number.isFinite(w) && w > 0) (run as { width?: number }).width = w;
        runs.push(run);
      }
      return;
    }
    const isBlock = BLOCKS.has(tag);
    if (isBlock && tag !== "TABLE" && tag !== "UL" && tag !== "OL") {
      if (runs.length) flush();
      if (/^H[1-6]$/.test(tag)) style = "Heading";
    }
    const nf: InlineFmt = { ...fmt };
    if (tag === "B" || tag === "STRONG") nf.bold = true;
    if (tag === "I" || tag === "EM") nf.italic = true;
    if (tag === "U") nf.underline = true;
    const st = el.getAttribute("style") || "";
    if (/font-weight\s*:\s*(bold|[6-9]\d\d)/i.test(st)) nf.bold = true;
    if (/font-style\s*:\s*italic/i.test(st)) nf.italic = true;
    if (/text-decoration[^;]*underline/i.test(st)) nf.underline = true;
    if ((tag === "TD" || tag === "TH") && runs.length) {
      runs.push({ type: "text", text: " ｜ " });
    }
    for (const child of Array.from(el.childNodes)) walk(child, nf);
    if (isBlock && tag !== "TABLE" && tag !== "UL" && tag !== "OL") flush();
  };

  walk(dom.body, {});
  flush();
  return { paragraphs };
}

/** 纯文本 → DocContent（按行分段） */
export function textToDocContent(text: string): DocContent {
  const paragraphs: DocParagraph[] = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ runs: [{ type: "text" as const, text: line }] }));
  return { paragraphs };
}

/** 判断粘贴的 HTML 是否含有实质文字（有文字走文档解析，纯图走 OCR） */
export function htmlHasMeaningfulText(html: string, minLen = 5): boolean {
  const dom = new DOMParser().parseFromString(preClean(html), "text/html");
  return (dom.body.textContent || "").replace(/\s+/g, "").length >= minLen;
}
