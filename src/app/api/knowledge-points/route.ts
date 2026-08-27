import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get("chapterId");
    const search = searchParams.get("search");

    if (search) {
      const knowledgePoints = await prisma.knowledgePoint.findMany({
        where: { name: { contains: search } },
        include: { chapter: { select: { id: true, title: true, textbookId: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ data: knowledgePoints });
    }

    if (!chapterId) {
      return NextResponse.json(
        { error: "请提供 chapterId 或 search 参数" },
        { status: 400 },
      );
    }

    const knowledgePoints = await prisma.knowledgePoint.findMany({
      where: { chapterId: Number(chapterId) },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: knowledgePoints });
  } catch (error) {
    console.error("GET /api/knowledge-points error:", error);
    return NextResponse.json(
      { error: "获取知识点列表失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();    const { chapterId, name } = body;

    if (!chapterId || !name) {
      return NextResponse.json(
        { error: "请提供 chapterId 和 name" },
        { status: 400 },
      );
    }

    const knowledgePoint = await prisma.knowledgePoint.create({
      data: {
        chapterId: Number(chapterId),
        name: String(name),
      },
    });

    return NextResponse.json({ data: knowledgePoint }, { status: 201 });
  } catch (error) {
    console.error("POST /api/knowledge-points error:", error);
    return NextResponse.json(
      { error: "创建知识点失败" },
      { status: 500 },
    );
  }
}
