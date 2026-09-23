import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/lectures/[id] → 讲义详情
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lecture = await prisma.lecture.findUnique({ where: { id: Number(id) } });
  if (!lecture) return NextResponse.json({ error: "讲义不存在" }, { status: 404 });
  return NextResponse.json({ data: lecture });
}

// PUT /api/lectures/[id] { title?, content } → 保存
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: { title?: string; content?: string } = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.content === "string") data.content = body.content;
  const lecture = await prisma.lecture.update({ where: { id: Number(id) }, data });
  return NextResponse.json({ data: { id: lecture.id, updatedAt: lecture.updatedAt } });
}
