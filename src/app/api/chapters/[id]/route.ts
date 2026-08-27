import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data: { title?: string; sortOrder?: number } = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);

    const chapter = await prisma.chapter.update({
      where: { id: Number(id) },
      data,
    });

    return NextResponse.json({ data: chapter });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "章节不存在" },
        { status: 404 },
      );
    }
    console.error("PUT /api/chapters/[id] error:", error);
    return NextResponse.json(
      { error: "更新章节失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const numId = Number(id);

    const chapter = await prisma.chapter.findUnique({
      where: { id: numId },
    });
    if (!chapter) {
      return NextResponse.json(
        { error: "章节不存在" },
        { status: 404 },
      );
    }

    // 收集该章节及所有子孙章节的 id
    const all = await prisma.chapter.findMany({
      select: { id: true, parentId: true },
    });
    const chapterIds: number[] = [numId];
    const queue: number[] = [numId];
    while (queue.length > 0) {
      const current = queue.shift() as number;
      for (const c of all) {
        if (c.parentId === current && !chapterIds.includes(c.id)) {
          chapterIds.push(c.id);
          queue.push(c.id);
        }
      }
    }

    // 按外键顺序级联删除（题目 Problem 本身保留，只解除知识点关联）
    await prisma.$transaction([
      prisma.problemKnowledgePoint.deleteMany({
        where: { knowledgePoint: { chapterId: { in: chapterIds } } },
      }),
      prisma.knowledgePoint.deleteMany({
        where: { chapterId: { in: chapterIds } },
      }),
      prisma.lesson.deleteMany({
        where: { chapterId: { in: chapterIds } },
      }),
      prisma.chapter.deleteMany({
        where: { id: { in: chapterIds } },
      }),
    ]);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/chapters/[id] error:", error);
    return NextResponse.json(
      { error: "删除章节失败" },
      { status: 500 },
    );
  }
}
