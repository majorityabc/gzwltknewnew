/**
 * Parse .docx files: walk the document XML, extract paragraphs.
 * Each paragraph contains runs of text interleaved with OMML formulas.
 *
 * With preserveOrder:true, fast-xml-parser outputs:
 *   { tagName: [child, child, ...], ":@": { "@_attr": val } }
 *   where child is { tagName: [...], ":@": {...} } or { "#text": "..." }
 */

import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { ommlToLatex } from "./omml-to-latex";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

const execFileAsync = promisify(execFile);

/** OLE 公式预览图（wmf/emf）→ {display: 显示用 PNG, ocr: 识别用高清 PNG} */
async function convertVectorToPng(
  zip: AdmZip,
  filePath: string,
  wPt: number,
  _hPt: number,
): Promise<{ display: string; ocr: string } | null> {
  const entry = zip.getEntry(filePath);
  if (!entry) return null;
  const base = path.join(os.tmpdir(), `ole_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const srcPath = `${base}.${filePath.split(".").pop() || "wmf"}`;
  const pngPath = `${base}.png`;
  try {
    fs.writeFileSync(srcPath, entry.getData());
    const displayPx = wPt > 0 ? Math.round((wPt * 96) / 72) : 0;
    const rasterW = 1600;
    await execFileAsync("wmf2gd", ["-t", "png", `--maxwidth=${rasterW}`, "--maxpect", "-o", pngPath, srcPath], { timeout: 15000 });
    const sharp = (await import("sharp")).default;
    const trimmed = sharp(pngPath).trim({ threshold: 15 });
    const ocrBuf = await trimmed.clone().resize({ width: 1600, withoutEnlargement: true }).png().toBuffer();
    const dispBuf = await trimmed
      .resize({ width: displayPx > 0 ? displayPx * 2 : 600, withoutEnlargement: true })
      .png()
      .toBuffer();
    return {
      display: `data:image/png;base64,${dispBuf.toString("base64")}`,
      ocr: `data:image/png;base64,${ocrBuf.toString("base64")}`,
    };
  } catch (e) {
    console.warn("[ole] 公式预览图转换失败:", filePath, e instanceof Error ? e.message : e);
    return null;
  } finally {
    for (const f of [srcPath, pngPath]) { try { fs.unlinkSync(f); } catch { /* noop */ } }
  }
}

/** DeepSeek 视觉：公式图片 → LaTeX（失败返回 null，调用方回退图片） */
async function ocrFormulaImage(dataUrl: string): Promise<string | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const base = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `这是一张高中物理试卷中的公式图片。请把它精确转成 LaTeX。
规则：只输出 LaTeX 代码本身，不要用 $ 包裹，不要任何解释；
上下标用 ^ 和 _（如 F_1、v^2），分数 \frac{a}{b}，根号 \sqrt{x}，希腊字母 \alpha \theta \omega \pi \Delta 等；
向量写法 \overrightarrow{AB}；特别注意：下标字符（A、B、1、2 等）极易混淆，请逐个仔细对比辨认，左右两侧的下标通常不同；看不清的字符给最合理猜测。`,
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 800,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn("[ole-ocr] deepseek error:", res.status);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let latex = (data.choices?.[0]?.message?.content || "").trim();
    // 去掉模型可能加的 $ 包裹和代码块
    latex = latex.replace(/^```(?:latex)?\s*/i, "").replace(/```\s*$/, "").trim();
    latex = latex.replace(/^\$+|\$+$/g, "").trim();
    if (!latex || latex.length > 600 || /无法|看不清|抱歉/.test(latex)) return null;
    return latex;
  } catch (e) {
    console.warn("[ole-ocr] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 解析后处理：ole-vector:// 占位 → 先转 PNG，再 DeepSeek 视觉识别成可编辑 LaTeX 公式（失败回退图片） */
async function resolveOleVectorImages(paragraphs: DocParagraph[], zip: AdmZip): Promise<void> {
  interface OleResult { display: string; latex: string | null }
  const cache = new Map<string, OleResult | null>();

  // 1) 收集唯一占位
  const unique: { key: string; filePath: string; wPt: number; hPt: number }[] = [];
  const seen = new Set<string>();
  for (const para of paragraphs) {
    for (const run of para.runs || []) {
      if (run.type !== "image" || !run.src.startsWith("ole-vector://")) continue;
      const key = run.src.slice("ole-vector://".length);
      if (seen.has(key)) continue;
      seen.add(key);
      const [filePath, qs] = key.split("?");
      unique.push({
        key,
        filePath,
        wPt: parseFloat(new URLSearchParams(qs || "").get("w") || "0"),
        hPt: parseFloat(new URLSearchParams(qs || "").get("h") || "0"),
      });
    }
  }
  if (unique.length === 0) return;

  // 2) 转换 + OCR，8 路并行
  let ocrOk = 0;
  for (let c = 0; c < unique.length; c += 8) {
    await Promise.all(
      unique.slice(c, c + 8).map(async (u) => {
        const imgs = await convertVectorToPng(zip, u.filePath, u.wPt, u.hPt);
        if (!imgs) { cache.set(u.key, null); return; }
        const latex = await ocrFormulaImage(imgs.ocr);
        if (latex) ocrOk++;
        cache.set(u.key, { display: imgs.display, latex });
      }),
    );
  }

  // 3) 应用：识别成功 → 可编辑公式 run；失败 → 图片 run 回退；转换失败 → 占位文本
  let applied = 0;
  for (const para of paragraphs) {
    for (let i = 0; i < (para.runs || []).length; i++) {
      const run = para.runs[i];
      if (run.type !== "image" || !run.src.startsWith("ole-vector://")) continue;
      const r = cache.get(run.src.slice("ole-vector://".length));
      if (r?.latex) {
        para.runs[i] = { type: "formula", latex: r.latex } as unknown as typeof run;
        applied++;
      } else if (r) {
        run.src = r.display;
      } else {
        para.runs[i] = { type: "text", text: "[公式]" } as unknown as typeof run;
      }
    }
  }
  console.log(`[ole] 公式处理：共 ${unique.length} 个唯一公式，OCR 成功 ${ocrOk}，应用公式节点 ${applied}`);
}

export interface TextRun {
  type: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface FormulaRun {
  type: "formula";
  latex: string;
}

export interface ImageRun {
  type: "image";
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export type ParagraphRun = TextRun | FormulaRun | ImageRun;

export interface DocParagraph {
  runs: ParagraphRun[];
  style?: string;
  /** 表格行（OCR 识别的表格）：每个元素是一列的 runs */
  tableCells?: ParagraphRun[][];
}

export interface DocContent {
  paragraphs: DocParagraph[];
}

// ---- fast-xml-parser preserveOrder helpers ----

/** The value of a tag key is always an array of children */
type Children = ElChild[];
interface ElChild {
  "#text"?: string;
  ":@"?: Record<string, string>;
  [tagName: string]: Children | string | Record<string, string> | undefined;
}

function tagNameOf(child: ElChild): string {
  const keys = Object.keys(child).filter((k) => k !== "#text" && k !== ":@");
  return keys[0] || "";
}

function childrenOf(child: ElChild): Children {
  const key = tagNameOf(child);
  if (!key) return [];
  const val = child[key];
  return Array.isArray(val) ? (val as unknown as Children) : [];
}

function attrsOf(child: ElChild): Record<string, string> {
  const a = child[":@"];
  return (a as Record<string, string>) || {};
}

function attr(child: ElChild, name: string): string | undefined {
  return attrsOf(child)[`@_${name}`];
}

function textOf(child: ElChild): string {
  if (child["#text"]) return child["#text"];
  // Text may be inside the element's children, e.g. <t>hello</t> produces
  // { "t": [{ "#text": "hello" }] }
  const kids = childrenOf(child);
  return kids.map((k) => k["#text"] || "").join("");
}

function findChild(el: ElChild, tag: string): ElChild | undefined {
  return childrenOf(el).find((c) => tagNameOf(c) === tag);
}

function findChildren(el: ElChild, tag: string): ElChild[] {
  return childrenOf(el).filter((c) => tagNameOf(c) === tag);
}

function findDescendant(el: ElChild, tag: string): ElChild | undefined {
  for (const child of childrenOf(el)) {
    if (tagNameOf(child) === tag) return child;
    const found = findDescendant(child, tag);
    if (found) return found;
  }
  return undefined;
}

// ---- Paragraph extraction ----

function extractParagraph(
  pEl: ElChild,
  imageMap: Map<string, string>,
  zip: AdmZip,
): DocParagraph {
  const pPr = findChild(pEl, "pPr");
  let style = "";
  if (pPr) {
    const pStyle = findChild(pPr, "pStyle");
    if (pStyle) {
      style = attr(pStyle, "val") || "";
    }
  }

  const children = childrenOf(pEl);
  const runs: ParagraphRun[] = [];
  let currentText = "";

  function flush() {
    if (currentText) {
      runs.push({ type: "text", text: currentText });
      currentText = "";
    }
  }

  for (const child of children) {
    const name = tagNameOf(child);

    if (name === "oMath" || name === "oMathPara") {
      flush();
      const obj = toOmmlFormat(child);
      const latex = ommlToLatex(obj);
      if (latex) runs.push({ type: "formula", latex });
    } else if (name === "r") {
      // Check if this run contains a drawing or pict (may be nested deeply,
      // e.g. inside mc:AlternateContent -> Choice -> drawing)
      const drawing = findDescendant(child, "drawing");
      const pict = findDescendant(child, "pict");
      // 旧版公式编辑器（OLE 对象）：v:shape/v:imagedata 里的预览图就是公式
      const oleObj = findDescendant(child, "object");
      if (oleObj) {
        const shape = findDescendant(oleObj, "shape");
        const imgData = shape ? findDescendant(shape, "imagedata") : null;
        const rId = imgData ? (attr(imgData, "id") || attrsOf(imgData)["@_r:id"] || "") : "";
        const filePath = rId ? imageMap.get(rId) : undefined;
        if (filePath) {
          flush();
          const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
          // v:shape style 里的 pt 尺寸 = Word 中的预期显示大小
          let wPt = 0, hPt = 0;
          const style = shape ? (attr(shape, "style") || "") : "";
          const mH = /height:([\d.]+)pt/.exec(style);
          const mW = /width:([\d.]+)pt/.exec(style);
          if (mH) hPt = parseFloat(mH[1]);
          if (mW) wPt = parseFloat(mW[1]);
          if (ext === "wmf" || ext === "emf") {
            // 浏览器不认 wmf/emf：标记占位（带尺寸），解析完后统一转 PNG
            runs.push({ type: "image", src: `ole-vector://${filePath}?w=${wPt}&h=${hPt}`, alt: "公式" });
          } else {
            const imgRun = getImageRun(rId, "公式", undefined, undefined, imageMap, zip);
            if (imgRun) runs.push(imgRun);
          }
          continue;
        }
      }
      if (drawing || pict) {
        flush();
        const imgRun = drawing
          ? extractDrawingImage(drawing, imageMap, zip)
          : extractPictImage(pict!, imageMap, zip);
        if (imgRun) runs.push(imgRun);
      } else {
        const rPr = findChild(child, "rPr");
        let bold = false, italic = false, underline = false;
        if (rPr) {
          if (findChild(rPr, "b") || findChild(rPr, "bCs")) bold = true;
          if (findChild(rPr, "i") || findChild(rPr, "iCs")) italic = true;
          if (findChild(rPr, "u")) underline = true;
        }

        // Gather text from t elements
        const tEls = findChildren(child, "t");
        let text = tEls.map((t) => textOf(t)).join("");

        // Line breaks
        const brs = findChildren(child, "br");
        if (brs.length > 0) text += "\n";

        if (text) {
          if (bold || italic || underline) {
            flush();
            runs.push({ type: "text", text, bold, italic, underline });
          } else {
            currentText += text;
          }
        }
      }
    } else if (name === "drawing") {
      // Direct drawing in paragraph (not inside run)
      flush();
      const imgRun = extractDrawingImage(child, imageMap, zip);
      if (imgRun) runs.push(imgRun);
    } else if (name === "pict") {
      // Direct pict in paragraph (not inside run)
      flush();
      const imgRun = extractPictImage(child, imageMap, zip);
      if (imgRun) runs.push(imgRun);
    } else if (name === "br") {
      currentText += "\n";
    } else if (name === "tab") {
      currentText += "\t";
    }
  }

  flush();
  return { style, runs };
}

// ---- Image extraction helpers ----

function extractDrawingImage(
  drawing: ElChild,
  imageMap: Map<string, string>,
  zip: AdmZip,
): ImageRun | null {
  // wp:inline = embedded, wp:anchor = floating/wrapped
  const container = findChild(drawing, "inline") || findChild(drawing, "anchor");
  if (!container) return null;
  const graphic = findChild(container, "graphic");
  if (!graphic) return null;
  const graphicData = findChild(graphic, "graphicData");
  if (!graphicData) return null;
  const pic = findChild(graphicData, "pic");
  if (!pic) return null;
  const blipFill = findChild(pic, "blipFill");
  if (!blipFill) return null;
  const blip = findChild(blipFill, "blip");
  if (!blip) return null;

  // r:embed → @_embed (or @_r:embed depending on parser behavior)
  const rId = attr(blip, "embed") || attrsOf(blip)["@_r:embed"] || "";
  if (!rId) return null;

  // Alt text from docPr
  const docPr = findChild(container, "docPr");
  const alt = docPr ? (attr(docPr, "descr") || attr(docPr, "name")) : undefined;

  // Dimensions from extent (EMU → px, 1px ≈ 9525 EMU)
  const ext = findChild(container, "extent");
  let width: number | undefined;
  let height: number | undefined;
  if (ext) {
    const cx = attr(ext, "cx");
    const cy = attr(ext, "cy");
    if (cx) width = Math.round(parseInt(cx) / 9525);
    if (cy) height = Math.round(parseInt(cy) / 9525);
  }

  return getImageRun(rId, alt, width, height, imageMap, zip);
}

function extractPictImage(
  pict: ElChild,
  imageMap: Map<string, string>,
  zip: AdmZip,
): ImageRun | null {
  const shape = findChild(pict, "shape");
  if (!shape) return null;
  const imgData = findChild(shape, "imagedata");
  if (!imgData) return null;

  // r:id → @_id (or @_r:id)
  const rId = attr(imgData, "id") || attrsOf(imgData)["@_r:id"] || "";
  if (!rId) return null;

  const alt = attr(shape, "alt");

  return getImageRun(rId, alt, undefined, undefined, imageMap, zip);
}

function getImageRun(
  rId: string,
  alt: string | undefined,
  width: number | undefined,
  height: number | undefined,
  imageMap: Map<string, string>,
  zip: AdmZip,
): ImageRun | null {
  const filePath = imageMap.get(rId);
  if (!filePath) return null;

  const imgEntry = zip.getEntry(filePath);
  if (!imgEntry) return null;

  const imgBuffer = imgEntry.getData();
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "png";
  const mime =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "gif" ? "image/gif"
    : ext === "svg" ? "image/svg+xml"
    : ext === "bmp" ? "image/bmp"
    : "image/png";

  const base64 = imgBuffer.toString("base64");
  const src = `data:${mime};base64,${base64}`;

  return { type: "image", src, alt, width, height };
}

// ---- OMML format conversion ----

/**
 * Convert a preserveOrder-format element tree into the nested-object format
 * that ommlToLatex expects. E.g.,
 *   { "#text": "hello" }   →   "#text"
 *   { "f": [{num:...}, {den:...}] }  →  { "f": { "num": {...}, "den": {...} } }
 *   { "r": [{t:[{text}]}, {t:[{text}]}] } → { "r": [{t: {text}}, ...] }
 */
function toOmmlFormat(child: ElChild): unknown {
  // Text node
  if (child["#text"] !== undefined) {
    return child["#text"];
  }

  const name = tagNameOf(child);
  if (!name) return "";

  const kids = childrenOf(child);

  // If all children are text nodes, return concatenated text
  if (kids.length > 0 && kids.every((k) => k["#text"] !== undefined)) {
    return kids.map((k) => k["#text"]).join("");
  }

  const attrs = attrsOf(child);
  const result: Record<string, unknown> = {};

  // Attributes
  for (const [key, value] of Object.entries(attrs)) {
    result[key] = value;
  }

  // Group children by tag name
  const grouped = new Map<string, ElChild[]>();
  for (const k of kids) {
    const n = tagNameOf(k);
    if (!n) {
      // Text-only child → skip grouping
      continue;
    }
    if (!grouped.has(n)) grouped.set(n, []);
    grouped.get(n)!.push(k);
  }

  for (const [n, group] of grouped) {
    const converted = group.map(toOmmlFormat);
    if (n === "oMathPara") {
      result["oMathPara"] = converted;
    } else if (["r", "t"].includes(n)) {
      result[n] = converted;
    } else if ([
      "e", "num", "den", "deg", "sub", "sup",
      "f", "rad", "acc", "bar", "d", "box",
      "nary", "sSup", "sSub", "sSubSup",
      "groupChr", "phant", "eqArr",
      "naryPr", "accPr", "dPr", "barPr", "groupChrPr",
      "argPr", "ctrlPr", "chr",
    ].includes(n)) {
      result[n] = converted[0];
    } else {
      result[n] = converted.length === 1 ? converted[0] : converted;
    }
  }

  return result;
}

// ---- Rels file parsing ----

function parseRelationships(zip: AdmZip): Map<string, string> {
  const relsEntry = zip.getEntry("word/_rels/document.xml.rels");
  if (!relsEntry) return new Map();

  const relsXml = relsEntry.getData().toString("utf-8");

  // Use preserveOrder:false for simpler output with .rels (flat structure)
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    ignoreNameSpace: true,
  } as Record<string, unknown> as never);

  const parsed = parser.parse(relsXml);
  const map = new Map<string, string>();

  const rels = parsed?.Relationships?.Relationship;
  if (!rels) return map;
  const arr = Array.isArray(rels) ? rels : [rels];
  for (const rel of arr) {
    const id = rel["@_Id"] || rel["@_r:Id"] || rel["@_ID"] || "";
    const target = rel["@_Target"] || rel["@_target"] || "";
    if (id && target) {
      map.set(id, `word/${target}`);
    }
  }

  return map;
}

// ---- Main parser ----

export async function parseDocx(buffer: Buffer): Promise<DocContent> {
  const zip = new AdmZip(buffer);
  const docEntry = zip.getEntry("word/document.xml");
  if (!docEntry) {
    throw new Error("Invalid .docx: word/document.xml not found");
  }

  const xmlString = docEntry.getData().toString("utf-8");

  // Parse relationships to map image rIds to zip paths
  const imageMap = parseRelationships(zip);
  console.log(`Image rels found: ${imageMap.size}`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    preserveOrder: true,
    transformTagName: (tagName: string) => {
      return tagName.replace(
        /^(w:|m:|v:|r:|wp:|a:|pic:|mc:|mo:|w14:|wp14:|wpc:|wpg:|wps:)/,
        "",
      );
    },
    // @ts-expect-error - ignoreNameSpace is a valid runtime option
    ignoreNameSpace: true,
  });

  const result = parser.parse(xmlString);
  if (!Array.isArray(result) || result.length === 0) {
    return { paragraphs: [] };
  }

  // The result array may contain XML declaration (?xml) as first element.
  // Find the element whose own tag name is "document".
  let docEl: ElChild | undefined;
  for (const item of result) {
    if (typeof item === "object" && tagNameOf(item as ElChild) === "document") {
      docEl = item as ElChild;
      break;
    }
  }
  if (!docEl) return { paragraphs: [] };

  const body = findChild(docEl, "body");
  if (!body) return { paragraphs: [] };


  const paragraphs: DocParagraph[] = [];

  for (const child of childrenOf(body)) {
    const name = tagNameOf(child);
    if (name === "p") {
      paragraphs.push(extractParagraph(child, imageMap, zip));
    } else if (name === "tbl") {
      for (const row of findChildren(child, "tr")) {
        for (const cell of findChildren(row, "tc")) {
          for (const p of findChildren(cell, "p")) {
            paragraphs.push(extractParagraph(p, imageMap, zip));
          }
        }
      }
    }
  }


  await resolveOleVectorImages(paragraphs, zip);
  return { paragraphs };
}
