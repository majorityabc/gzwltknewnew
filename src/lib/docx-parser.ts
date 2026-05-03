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

export function parseDocx(buffer: Buffer): DocContent {
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


  return { paragraphs };
}
