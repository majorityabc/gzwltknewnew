import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get("chapterId");

    if (!chapterId) {
      return NextResponse.json(
        { error: "请提供 chapterId 参数" },
        { status: 400 },
      );
    }

    const lessons = await prisma.lesson.findMany({
      where: { chapterId: Number(chapterId) },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: lessons });
  } catch (error) {
    console.error("GET /api/lessons error:", error);
    return NextResponse.json({ error: "获取课时列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { chapterId, title } = await request.json();

    if (!chapterId || !title) {
      return NextResponse.json(
        { error: "请提供 chapterId 和 title" },
        { status: 400 },
      );
    }

    // Get max sortOrder
    const max = await prisma.lesson.findFirst({
      where: { chapterId },
      orderBy: { sortOrder: "desc" },
    });

    const lesson = await prisma.lesson.create({
      data: {
        chapterId,
        title,
        sortOrder: (max?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ data: lesson }, { status: 201 });
  } catch (error) {
    console.error("POST /api/lessons error:", error);
    return NextResponse.json({ error: "创建课时失败" }, { status: 500 });
  }
}
