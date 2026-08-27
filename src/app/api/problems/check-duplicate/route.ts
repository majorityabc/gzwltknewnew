import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeContentHash } from "@/lib/content-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const contents: unknown[] = Array.isArray(body?.contents) ? body.contents : [];

    if (contents.length === 0) {
      return NextResponse.json({ error: "缺少 contents 参数" }, { status: 400 });
    }

    const hashes = contents.map((c) =>
      computeContentHash(typeof c === "string" ? c : JSON.stringify(c)),
    );

    const matches = await prisma.problem.findMany({
      where: { contentHash: { in: [...new Set(hashes)] } },
      include: {
        knowledgePoints: {
          include: { knowledgePoint: true },
        },
      },
    });

    // 同一哈希可能有多条历史数据，取第一条
    const byHash = new Map<string, (typeof matches)[number]>();
    for (const m of matches) {
      if (!byHash.has(m.contentHash)) byHash.set(m.contentHash, m);
    }

    const duplicates = [];
    for (let index = 0; index < hashes.length; index++) {
      const problem = byHash.get(hashes[index]);
      if (!problem) continue;
      duplicates.push({
        index,
        problem: {
          id: problem.id,
          difficulty: problem.difficulty,
          lessonTitle: problem.lessonTitle,
          questionType: problem.questionType,
          sourceDate: problem.sourceDate,
          knowledgePoints: problem.knowledgePoints.map((kp) => ({
            id: kp.knowledgePoint.id,
            name: kp.knowledgePoint.name,
          })),
        },
      });
    }

    return NextResponse.json({ duplicates });
  } catch (error) {
    console.error("POST /api/problems/check-duplicate error:", error);
    return NextResponse.json({ error: "查重失败" }, { status: 500 });
  }
}
