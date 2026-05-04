/**
 * Convert OMML (Office Math Markup Language) to LaTeX string.
 * Handles the subset of OMML used in high school physics:
 * fractions, radicals, sub/superscript, accents, delimiters, n-ary, arrays.
 */

interface OMMLNode {
  [key: string]: unknown;
  "#text"?: string;
}

// Which accent character maps to which LaTeX command
const ACCENT_MAP: Record<string, string> = {
  "̃": "tilde",
  "̂": "hat",
  "⃗": "vec",
  "̇": "dot",
  "̈": "ddot",
  "̄": "bar",
  "⃡": "vec",
  "⏞": "overbrace",
  "⏟": "underbrace",
  "→": "overrightarrow",
  "←": "overleftarrow",
};

// Which delimiter character maps to which LaTeX bracket
const DELIM_MAP: Record<string, [string, string]> = {
  "(": ["(", ")"],
  ")": ["(", ")"],
  "[": ["[", "]"],
  "]": ["[", "]"],
  "{": ["\\{", "\\}"],
  "}": ["\\{", "\\}"],
  "|": ["|", "|"],
  "∥": ["\\|", "\\|"],
  "⌈": ["\\lceil", "\\rceil"],
  "⌉": ["\\lceil", "\\rceil"],
  "⌊": ["\\lfloor", "\\rfloor"],
  "⌋": ["\\lfloor", "\\rfloor"],
};

function getText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    return node.map((v) => getText(v)).join("");
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj["#text"]) return String(obj["#text"]);
    if (obj["t"] !== undefined) return getText(obj["t"]);
  }
  return "";
}

function ensureArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

function convertMathStyle(node: OMMLNode): string {
  // Check for math style properties (bold, italic, normal)
  const argPr = node["argPr"] as OMMLNode | undefined;
  const ctrlPr = node["ctrlPr"] as OMMLNode | undefined;
  const sty = (argPr?.["sty"] || ctrlPr?.["sty"]) as OMMLNode | undefined;
  const nor = (argPr?.["nor"] || ctrlPr?.["nor"]) as OMMLNode | undefined;

  if (sty) {
    const val = sty["@_m:val"] || sty["@_val"];
    if (val === "b") return "\\mathbf";
    if (val === "i") return "\\mathit";
    if (val === "bi") return "\\mathbf";
  }
  if (nor) {
    // "normal" → use \mathrm for non-italic text (like units)
    return "\\mathrm";
  }
  return "";
}

function textNormalize(s: string): string {
  // Normalize some common Unicode math chars
  return s
    .replace(/⁡/g, "")   // invisible function application
    .replace(/⁢/g, "")   // invisible times
    .replace(/⁣/g, "")   // invisible separator
    .replace(/​/g, "");  // zero-width space
}

export function ommlToLatex(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return textNormalize(node);
  if (typeof node !== "object") return "";

  const obj = node as OMMLNode;

  // Text node
  if (obj["t"] !== undefined) {
    const mathStyle = convertMathStyle({});
    const txt = getText(obj["t"]);
    if (mathStyle === "\\mathrm") {
      return `\\text{${txt}}`;
    }
    return txt;
  }

  // Run: process children, apply style
  if (obj["r"] !== undefined) {
    const mathStyle = convertMathStyle(obj);
    const runs = ensureArray(obj["r"]);
    let result = "";
    for (const r of runs) {
      const t = (r as OMMLNode)["t"];
      const text = getText(t);
      result += textNormalize(text);
    }
    if (!result) return "";

    // Check for accent properties in argPr
    const argPr = obj["argPr"] as OMMLNode | undefined;
    if (argPr) {
      const acc = argPr["acc"] as OMMLNode | undefined;
      if (acc) {
        const accChr = (acc["@_m:val"] || acc["@_val"]) as string | undefined;
        if (accChr && ACCENT_MAP[accChr]) {
          return `\\${ACCENT_MAP[accChr]}{${result}}`;
        }
      }
    }

    if (mathStyle) {
      return `${mathStyle}{${result}}`;
    }
    return result;
  }

  // Fraction: m:f
  if (obj["f"] !== undefined) {
    const f = obj["f"] as OMMLNode;
    const num = ommlToLatex(f["num"]);
    const den = ommlToLatex(f["den"]);
    return `\\frac{${num}}{${den}}`;
  }

  // Radical: m:rad
  if (obj["rad"] !== undefined) {
    const rad = obj["rad"] as OMMLNode;
    const deg = ommlToLatex(rad["deg"]);
    const e = ommlToLatex(rad["e"]);
    if (deg && deg !== "2") {
      return `\\sqrt[${deg}]{${e}}`;
    }
    return `\\sqrt{${e}}`;
  }

  // Superscript: m:sSup
  if (obj["sSup"] !== undefined) {
    const ss = obj["sSup"] as OMMLNode;
    const base = ommlToLatex(ss["e"]);
    const sup = ommlToLatex(ss["sup"]);
    if (base.length > 1) {
      return `{${base}}^{${sup}}`;
    }
    return `${base}^{${sup}}`;
  }

  // Subscript: m:sSub
  if (obj["sSub"] !== undefined) {
    const ss = obj["sSub"] as OMMLNode;
    const base = ommlToLatex(ss["e"]);
    const sub = ommlToLatex(ss["sub"]);
    if (base.length > 1) {
      return `{${base}}_{${sub}}`;
    }
    return `${base}_{${sub}}`;
  }

  // Sub+Sup: m:sSubSup
  if (obj["sSubSup"] !== undefined) {
    const ss = obj["sSubSup"] as OMMLNode;
    const base = ommlToLatex(ss["e"]);
    const sub = ommlToLatex(ss["sub"]);
    const sup = ommlToLatex(ss["sup"]);
    const b = base.length > 1 ? `{${base}}` : base;
    return `${b}_{${sub}}^{${sup}}`;
  }

  // Accent: m:acc
  if (obj["acc"] !== undefined) {
    const acc = obj["acc"] as OMMLNode;
    const accChr = getText((acc["accPr"] as OMMLNode)?.["chr"] || acc["chr"])
      || (acc["@_m:val"] || acc["@_val"]) as string || "";
    const e = ommlToLatex(acc["e"]);
    const cmd = ACCENT_MAP[accChr];
    if (cmd) return `\\${cmd}{${e}}`;
    return e;
  }

  // Bar: m:bar
  if (obj["bar"] !== undefined) {
    const bar = obj["bar"] as OMMLNode;
    const e = ommlToLatex(bar["e"]);
    const barPr = bar["barPr"] as OMMLNode | undefined;
    const pos = barPr?.["@_m:val"] || barPr?.["@_val"] || "top";
    if (pos === "bot") return `\\underline{${e}}`;
    return `\\overline{${e}}`;
  }

  // Delimiter: m:d
  if (obj["d"] !== undefined) {
    const d = obj["d"] as OMMLNode;
    const e = ommlToLatex(d["e"]);
    const dPr = d["dPr"] as OMMLNode | undefined;
    const begChr = dPr ? getText(dPr["begChr"]) : "(";
    const endChr = dPr ? getText(dPr["endChr"]) : ")";
    const left = DELIM_MAP[begChr]?.[0] || begChr;
    const right = DELIM_MAP[endChr]?.[1] || endChr || ")";
    return `\\left${left}${e}\\right${right}`;
  }

  // Group character: m:groupChr
  if (obj["groupChr"] !== undefined) {
    const gc = obj["groupChr"] as OMMLNode;
    const e = ommlToLatex(gc["e"]);
    const gcPr = gc["groupChrPr"] as OMMLNode | undefined;
    const chr = gcPr ? getText(gcPr["chr"]) : "";
    if (chr === "⏞") return `\\overbrace{${e}}`;
    if (chr === "⏟") return `\\underbrace{${e}}`;
    return e;
  }

  // N-ary: m:nary
  if (obj["nary"] !== undefined) {
    const nary = obj["nary"] as OMMLNode;
    const sub = ommlToLatex(nary["sub"]);
    const sup = ommlToLatex(nary["sup"]);
    const e = ommlToLatex(nary["e"]);
    const naryPr = nary["naryPr"] as OMMLNode | undefined;
    const chr = naryPr ? getText(naryPr["chr"]) : "∑";
    const cmdMap: Record<string, string> = {
      "∑": "\\sum",
      "∏": "\\prod",
      "∐": "\\coprod",
      "∫": "\\int",
      "∮": "\\oint",
    };
    const cmd = cmdMap[chr] || chr;
    if (sub && sup) return `${cmd}_{${sub}}^{${sup}}{${e}}`;
    if (sub) return `${cmd}_{${sub}}{${e}}`;
    if (sup) return `${cmd}^{${sup}}{${e}}`;
    return `${cmd}{${e}}`;
  }

  // Equation array: m:eqArr
  if (obj["eqArr"] !== undefined) {
    const arr = obj["eqArr"] as OMMLNode;
    const eqs = ensureArray(arr["e"]);
    return eqs.map((eq) => ommlToLatex(eq)).join(" \\\\\n  ");
  }

  // Box (used for inline formula containers)
  if (obj["box"] !== undefined) {
    return ommlToLatex((obj["box"] as OMMLNode)["e"]);
  }

  // Phantom
  if (obj["phant"] !== undefined) {
    const e = ommlToLatex((obj["phant"] as OMMLNode)["e"]);
    return `\\phantom{${e}}`;
  }

  // Literal text content
  if (obj["#text"]) {
    return textNormalize(String(obj["#text"]));
  }

  // Paragraph of equations: m:oMathPara
  if (obj["oMathPara"] !== undefined) {
    const paras = ensureArray(obj["oMathPara"]);
    return paras.map((p: unknown) => ommlToLatex((p as OMMLNode)["oMath"])).join("\n");
  }

  // Single equation: m:oMath
  if (obj["oMath"] !== undefined) {
    const children = obj["oMath"];
    if (Array.isArray(children)) {
      return children.map((c) => ommlToLatex(c)).join("");
    }
    return ommlToLatex(children);
  }

  // equation-array as top-level
  if (obj["e"] !== undefined && obj["eqArr"] === undefined) {
    return ommlToLatex(obj["e"]);
  }

  // Catch-all: try to find and process any known OMML child
  const children = Object.entries(obj).filter(
    ([k]) => !k.startsWith("@") && !k.startsWith("#") && typeof obj[k] === "object",
  );
  if (children.length === 1) {
    return ommlToLatex(children[0][1]);
  }

  return "";
}
