import { prisma } from "@/lib/prisma";
import { lectureToDocxBuffer } from "@/lib/export-lecture";

// 问题篮导出：多个问题合并成一个 Word
// 每个问题一个区块：问题标题（编号）+ 原话 + 元信息 + 截图 + 我的解释

interface QuestionWithRels {
  id: number;
  content: string;
  studentName: string | null;
  explanation: string;
  askedAt: Date;
  textbook: { name: string } | null;
  chapter: { title: string } | null;
  lesson: { title: string } | null;
  images: { image: { mimeType: string; data: string } }[];
}

function questionBlocks(q: QuestionWithRels, idx: number): unknown[] {
  const blocks: unknown[] = [];

  // 标题 = 编号 + 问题原话（完整），不再重复一遍【问题】
  blocks.push({
    type: "paragraph",
    content: [{
      type: "text",
      text: (idx > 0 ? `问题 ${idx}：` : "") + (q.content || "（截图）"),
      marks: [{ type: "bold" }],
    }],
  });

  // 截图
  for (const im of q.images) {
    blocks.push({
      type: "paragraph",
      content: [{ type: "image", attrs: { src: `data:${im.image.mimeType};base64,${im.image.data}` } }],
    });
  }

  // 解释直接跟在题目后面，不加「我的解释」标签
  let expl: { content?: unknown[] } = { content: [] };
  try { expl = JSON.parse(q.explanation || "{}"); } catch { /* 忽略 */ }
  if (Array.isArray(expl.content) && expl.content.length > 0) {
    blocks.push(...expl.content);
  }

  return blocks;
}

/** 按 ids 顺序取问题并合成一个 docx（顺序以传入 ids 为准） */
export async function buildQuestionsDocx(ids: number[]): Promise<Buffer> {
  const rows = await prisma.studentQuestion.findMany({
    where: { id: { in: ids } },
    include: {
      textbook: { select: { name: true } },
      chapter: { select: { title: true } },
      lesson: { select: { title: true } },
      images: { include: { image: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x);

  const blocks: unknown[] = [];
  const numbered = ordered.length > 1;
  ordered.forEach((q, i) => {
    blocks.push(...questionBlocks(q as QuestionWithRels, numbered ? i + 1 : 0));
  });

  const d = new Date();
  const title = `问题集（${ordered.length} 题）`;
  return lectureToDocxBuffer(title, JSON.stringify({ type: "doc", content: blocks }));
}
