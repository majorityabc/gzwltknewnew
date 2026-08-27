import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { title } = await request.json();
    const lesson = await prisma.lesson.update({
      where: { id: Number(id) },
      data: { title },
    });

    return NextResponse.json({ data: lesson });
  } catch (error) {
    console.error("PUT /api/lessons/[id] error:", error);
    return NextResponse.json({ error: "更新课时失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.lesson.delete({ where: { id: Number(id) } });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/lessons/[id] error:", error);
    return NextResponse.json({ error: "删除课时失败" }, { status: 500 });
  }
}
