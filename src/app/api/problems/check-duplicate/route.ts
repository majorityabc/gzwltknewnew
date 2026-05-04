import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json();

    if (!content) {
      return NextResponse.json({ error: "缺少 content 参数" }, { status: 400 });
    }

    const contentStr = typeof content === "string" ? content : JSON.stringify(content);

    const existing = await prisma.problem.findFirst({
      where: { content: contentStr },
      include: {
        knowledgePoints: {
          include: { knowledgePoint: true },
        },
      },
    });

    if (existing) {
      return NextResponse.json({
        duplicate: true,
        existing: {
          id: existing.id,
          difficulty: existing.difficulty,
          lessonTitle: existing.lessonTitle,
          questionType: existing.questionType,
          sourceDate: existing.sourceDate,
          knowledgePoints: existing.knowledgePoints.map((kp) => ({
            id: kp.knowledgePoint.id,
            name: kp.knowledgePoint.name,
          })),
        },
      });
    }

    return NextResponse.json({ duplicate: false });
  } catch (error) {
    console.error("POST /api/problems/check-duplicate error:", error);
    return NextResponse.json({ error: "查重失败" }, { status: 500 });
  }
}
