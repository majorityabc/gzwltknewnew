import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeContentHash } from "@/lib/content-utils";
import { storeInlineImages } from "@/lib/images";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const knowledgePointId = searchParams.get("knowledgePointId");
    const search = searchParams.get("search");
    const ids = searchParams.get("ids");

    // 按 id 批量取（组卷导出用：篮子里的题可能来自多个知识点）
    if (ids) {
      const idList = ids.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
      if (idList.length === 0) return NextResponse.json({ data: [] });
      const problems = await prisma.problem.findMany({
        where: { id: { in: idList } },
        include: { knowledgePoints: { include: { knowledgePoint: true } } },
      });
      return NextResponse.json({ data: problems });
    }

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
      const { content, difficulty, lessonTitle, questionType, sourceDate, knowledgePointIds, answer } = item;

      if (!content || !knowledgePointIds || knowledgePointIds.length === 0) {
        return NextResponse.json(
          { error: "每道题必须提供 content 和 knowledgePointIds" },
          { status: 400 },
        );
      }

      const contentStr = typeof content === "string" ? content : JSON.stringify(content);
      // 先用原始 content 算哈希（图片节点只是 "[图片]" 占位符），再把内联图片抽出入库
      const contentHash = computeContentHash(contentStr);
      const storedContent = await storeInlineImages(contentStr);
      const answerStr = answer == null ? null : (typeof answer === "string" ? answer : JSON.stringify(answer));
      const storedAnswer = answerStr && answerStr.trim() ? await storeInlineImages(answerStr) : null;

      const problem = await prisma.problem.create({
        data: {
          content: storedContent,
          contentHash,
          answer: storedAnswer,
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
