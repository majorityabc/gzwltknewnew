import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromCookies } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.content !== undefined) {
      updateData.content = typeof body.content === "string" ? body.content : JSON.stringify(body.content);
    }
    if (body.difficulty !== undefined) {
      updateData.difficulty = Number(body.difficulty);
    }
    if (body.lessonTitle !== undefined) {
      updateData.lessonTitle = body.lessonTitle || null;
    }
    if (body.questionType !== undefined) {
      updateData.questionType = body.questionType || null;
    }
    if (body.sourceDate !== undefined) {
      updateData.sourceDate = body.sourceDate || null;
    }
    if (body.remarks !== undefined) {
      updateData.remarks = body.remarks || null;
    }

    if (body.knowledgePointIds) {
      await prisma.problemKnowledgePoint.deleteMany({
        where: { problemId: Number(id) },
      });
      updateData.knowledgePoints = {
        create: (body.knowledgePointIds as number[]).map((kpId: number) => ({
          knowledgePointId: kpId,
        })),
      };
    }

    const problem = await prisma.problem.update({
      where: { id: Number(id) },
      data: updateData,
      include: {
        knowledgePoints: {
          include: { knowledgePoint: true },
        },
      },
    });

    return NextResponse.json({ data: problem });
  } catch (error) {
    console.error("PUT /api/problems/[id] error:", error);
    return NextResponse.json(
      { error: "更新题目失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const { id } = await params;
    // Delete junction records first (CASCADE not automatic in SQLite with Prisma)
    await prisma.problemKnowledgePoint.deleteMany({
      where: { problemId: Number(id) },
    });
    await prisma.problem.delete({ where: { id: Number(id) } });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/problems/[id] error:", error);
    return NextResponse.json(
      { error: "删除题目失败" },
      { status: 500 },
    );
  }
}
