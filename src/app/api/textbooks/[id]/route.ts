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

    const data: { name?: string; grade?: string | null; sortOrder?: number } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.grade !== undefined) data.grade = body.grade;
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);

    const textbook = await prisma.textbook.update({
      where: { id: Number(id) },
      data,
    });

    return NextResponse.json({ data: textbook });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "课本不存在" },
        { status: 404 },
      );
    }
    console.error("PUT /api/textbooks/[id] error:", error);
    return NextResponse.json(
      { error: "更新课本失败" },
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

    const textbook = await prisma.textbook.findUnique({
      where: { id: numId },
    });
    if (!textbook) {
      return NextResponse.json(
        { error: "课本不存在" },
        { status: 404 },
      );
    }

    const chapters = await prisma.chapter.findMany({
      where: { textbookId: numId },
      select: { id: true },
    });
    const chapterIds = chapters.map((c) => c.id);

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
        where: { textbookId: numId },
      }),
      prisma.textbook.delete({
        where: { id: numId },
      }),
    ]);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/textbooks/[id] error:", error);
    return NextResponse.json(
      { error: "删除课本失败" },
      { status: 500 },
    );
  }
}
