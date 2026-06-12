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
