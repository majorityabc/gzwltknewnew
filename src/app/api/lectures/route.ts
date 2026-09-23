import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/lectures → 讲义列表
export async function GET() {
  const lectures = await prisma.lecture.findMany({
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ data: lectures });
}

// POST /api/lectures { title } → 新建
export async function POST(req: Request) {
  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  const lecture = await prisma.lecture.create({ data: { title: title.trim() } });
  return NextResponse.json({ data: { id: lecture.id, title: lecture.title } });
}
