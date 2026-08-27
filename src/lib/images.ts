import { prisma } from "@/lib/prisma";

interface TipTapLikeNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
}

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/;
const IMAGE_REF_RE = /^\/api\/images\/([^/?#]+)$/;

/**
 * 遍历 TipTap JSON，把 src 为 data URL 的 image 节点抽出来存入 ProblemImage 表，
 * src 改写为 /api/images/<id>；已是 /api/images/... 或 http(s) 的跳过。
 * 返回改写后的 JSON 字符串（解析失败时原样返回）。
 */
export async function storeInlineImages(contentJson: string): Promise<string> {
  let doc: unknown;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return contentJson;
  }

  async function walk(node: unknown): Promise<void> {
    if (!node || typeof node !== "object") return;
    const n = node as TipTapLikeNode;

    if (n.type === "image" && n.attrs && typeof n.attrs.src === "string") {
      const match = n.attrs.src.match(DATA_URL_RE);
      if (match) {
        const image = await prisma.problemImage.create({
          data: { mimeType: match[1], data: match[2] },
        });
        n.attrs.src = `/api/images/${image.id}`;
      }
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        await walk(child);
      }
    }
  }

  await walk(doc);
  return JSON.stringify(doc);
}

/** 提取 content 里所有 /api/images/<id> 引用 */
export function collectImageIds(contentJson: string): string[] {
  const ids: string[] = [];

  let doc: unknown;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return ids;
  }

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as TipTapLikeNode;

    if (n.type === "image" && n.attrs && typeof n.attrs.src === "string") {
      const match = n.attrs.src.match(IMAGE_REF_RE);
      if (match) ids.push(match[1]);
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
    }
  }

  walk(doc);
  return ids;
}

/** 按 id 删除图片 */
export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.problemImage.deleteMany({ where: { id: { in: ids } } });
}
