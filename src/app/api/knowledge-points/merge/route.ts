import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 合并知识点：把 source 的全部题目关联转移到 target，然后删除 source 标签 */

export async function POST(request: NextRequest) {
  try {
    const { sourceId, targetId } = await request.json();
    const sid = Number(sourceId);
    const tid = Number(targetId);
    if (!sid || !tid || sid === tid) {
      return NextResponse.json({ error: "参数无效（源和目标不能相同）" }, { status: 400 });
    }

    const [source, target] = await Promise.all([
      prisma.knowledgePoint.findUnique({ where: { id: sid }, include: { _count: { select: { problems: true } } } }),
      prisma.knowledgePoint.findUnique({ where: { id: tid } }),
    ]);
    if (!source || !target) {
      return NextResponse.json({ error: "知识点不存在" }, { status: 404 });
    }

    const moved = await prisma.$transaction(async (tx) => {
      // 源标签下的全部题目关联
      const links = await tx.problemKnowledgePoint.findMany({ where: { knowledgePointId: sid } });
      let n = 0;
      for (const l of links) {
        // 目标标签已关联该题则跳过（防重复）
        const dup = await tx.problemKnowledgePoint.findFirst({
          where: { problemId: l.problemId, knowledgePointId: tid },
        });
        if (!dup) {
          await tx.problemKnowledgePoint.create({
            data: { problemId: l.problemId, knowledgePointId: tid },
          });
          n++;
        }
      }
      await tx.problemKnowledgePoint.deleteMany({ where: { knowledgePointId: sid } });
      await tx.knowledgePoint.delete({ where: { id: sid } });
      return n;
    });

    return NextResponse.json({ data: { moved, target: { id: target.id, name: target.name } } });
  } catch (error) {
    console.error("POST /api/knowledge-points/merge error:", error);
    return NextResponse.json({ error: "合并失败" }, { status: 500 });
  }
}
