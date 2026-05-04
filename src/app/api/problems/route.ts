import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const knowledgePointId = searchParams.get("knowledgePointId");
    const search = searchParams.get("search");

    if (search) {
      const problems = await prisma.problem.findMany({
        where: {
          knowledgePoints: {
            some: { knowledgePoint: { name: { contains: search } } },
          },
        },
        include: {
          knowledgePoints: {
            include: { knowledgePoint: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ data: problems });
    }

    if (!knowledgePointId) {
      return NextResponse.json(
        { error: "请提供 knowledgePointId 或 search 参数" },
        { status: 400 },
      );
    }

    const problems = await prisma.problem.findMany({
      where: {
        knowledgePoints: {
          some: { knowledgePointId: Number(knowledgePointId) },
        },
      },
      include: {
        knowledgePoints: {
          include: { knowledgePoint: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: problems });
  } catch (error) {
    console.error("GET /api/problems error:", error);
    return NextResponse.json(
      { error: "获取题目列表失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: "请求体必须是题目数组" },
        { status: 400 },
      );
    }

    const created = [];
    for (const item of body) {
      const { content, difficulty, lessonTitle, questionType, sourceDate, knowledgePointIds } = item;

      if (!content || !knowledgePointIds || knowledgePointIds.length === 0) {
        return NextResponse.json(
          { error: "每道题必须提供 content 和 knowledgePointIds" },
          { status: 400 },
        );
      }

      const problem = await prisma.problem.create({
        data: {
          content: typeof content === "string" ? content : JSON.stringify(content),
          difficulty: difficulty ?? 1,
          lessonTitle: lessonTitle ?? null,
          questionType: questionType ?? null,
          sourceDate: sourceDate ?? null,
          knowledgePoints: {
            create: (knowledgePointIds as number[]).map((kpId) => ({
              knowledgePointId: kpId,
            })),
          },
        },
        include: {
          knowledgePoints: {
            include: { knowledgePoint: true },
          },
        },
      });
      created.push(problem);
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/problems error:", error);
    return NextResponse.json(
      { error: "创建题目失败" },
      { status: 500 },
    );
  }
}
