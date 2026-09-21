import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/** 改名 / 移动到其他章节 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const numId = Number(id);
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.chapterId !== undefined && body.chapterId !== null) data.chapterId = Number(body.chapterId);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "没有要更新的字段" }, { status: 400 });
    }
    const kp = await prisma.knowledgePoint.update({ where: { id: numId }, data });
    return NextResponse.json({ data: kp });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "知识点不存在" }, { status: 404 });
    }
    console.error("PUT /api/knowledge-points/[id] error:", error);
    return NextResponse.json({ error: "更新知识点失败" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const numId = Number(id);

    // Delete all problem-knowledge-point links first
    await prisma.problemKnowledgePoint.deleteMany({
      where: { knowledgePointId: numId },
    });

    // Delete the knowledge point
    await prisma.knowledgePoint.delete({
      where: { id: numId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "知识点不存在" },
        { status: 404 },
      );
    }
    console.error("DELETE /api/knowledge-points/[id] error:", error);
    return NextResponse.json(
      { error: "删除知识点失败" },
      { status: 500 },
    );
  }
}
