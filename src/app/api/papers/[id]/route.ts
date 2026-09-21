import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

/** 试卷：改信息 / 删除 */

const PAPER_TYPES = ["单元测试", "月考", "期中", "期末", "其他"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data: {
      title?: string;
      paperType?: string;
      remarks?: string | null;
      textbookId?: number | null;
    } = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 120);
    if (typeof body.paperType === "string" && PAPER_TYPES.includes(body.paperType)) data.paperType = body.paperType;
    if (body.remarks !== undefined) data.remarks = String(body.remarks).trim() || null;
    if (body.textbookId !== undefined) data.textbookId = body.textbookId ? Number(body.textbookId) : null;

    await db.paper.update({ where: { id: Number(id) }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/papers/[id] error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.paper.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/papers/[id] error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
