import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const textbookId = searchParams.get("textbookId");

    if (!textbookId) {
      return NextResponse.json(
        { error: "请提供 textbookId 参数" },
        { status: 400 },
      );
    }

    const chapters = await prisma.chapter.findMany({
      where: { textbookId: Number(textbookId), parentId: null },
      orderBy: { sortOrder: "asc" },
      include: {
        children: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json({ data: chapters });
  } catch (error) {
    console.error("GET /api/chapters error:", error);
    return NextResponse.json(
      { error: "获取章节列表失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { textbookId, title, parentId, sortOrder } = await request.json();

    if (!textbookId || !title) {
      return NextResponse.json(
        { error: "请提供 textbookId 和 title" },
        { status: 400 },
      );
    }

    let order = sortOrder;
    if (order === undefined || order === null) {
      // 同级（同课本、同父章节）max+1
      const max = await prisma.chapter.findFirst({
        where: { textbookId: Number(textbookId), parentId: parentId ?? null },
        orderBy: { sortOrder: "desc" },
      });
      order = (max?.sortOrder ?? -1) + 1;
    }

    const chapter = await prisma.chapter.create({
      data: {
        textbookId: Number(textbookId),
        title,
        parentId: parentId ?? null,
        sortOrder: order,
      },
    });

    return NextResponse.json({ data: chapter }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chapters error:", error);
    return NextResponse.json(
      { error: "创建章节失败" },
      { status: 500 },
    );
  }
}
