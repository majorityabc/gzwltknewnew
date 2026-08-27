import { createHash } from "node:crypto";

interface TipTapLikeNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
}

/**
 * 递归提取 TipTap JSON 的纯文字内容：
 * - text 节点取 text
 * - inlineMath 节点取 attrs.text（LaTeX）
 * - image 节点贡献固定占位符 "[图片]"（不含 src，同一张图重新上传也能匹配）
 * - 其他节点递归子节点
 */
export function extractPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as TipTapLikeNode;

  let out = "";
  if (n.type === "text" && typeof n.text === "string") {
    out += n.text;
  } else if (n.type === "inlineMath" && typeof n.attrs?.text === "string") {
    out += n.attrs.text;
  } else if (n.type === "image") {
    out += "[图片]";
  }

  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      out += extractPlainText(child);
    }
  }
  return out;
}

/**
 * 计算题目内容的归一化哈希：
 * JSON.parse（失败则当纯文本）→ extractPlainText → 去掉所有空白字符 → sha256 hex
 */
export function computeContentHash(contentJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    parsed = contentJson;
  }
  const text = typeof parsed === "string" ? parsed : extractPlainText(parsed);
  const normalized = text.replace(/\s+/g, "");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
