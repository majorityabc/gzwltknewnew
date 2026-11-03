import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

/** 试卷目录（自定义文件夹）：列表/新建/改名/删除 */

export async function GET() {
  try {
    const folders = await db.paperFolder.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { papers: true } } },
    });
    return NextResponse.json({ data: folders });
  } catch (error) {
    console.error("GET /api/paper-folders error:", error);
    return NextResponse.json({ error: "获取目录失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    const n = String(name || "").trim().slice(0, 40);
    if (!n) return NextResponse.json({ error: "目录名不能为空" }, { status: 400 });
    const dup = await db.paperFolder.findFirst({ where: { name: n } });
    if (dup) return NextResponse.json({ error: "已存在同名目录" }, { status: 400 });
    const folder = await db.paperFolder.create({ data: { name: n } });
    return NextResponse.json({ data: folder });
  } catch (error) {
    console.error("POST /api/paper-folders error:", error);
    return NextResponse.json({ error: "创建目录失败" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, name } = await request.json();
    const n = String(name || "").trim().slice(0, 40);
    if (!id || !n) return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    await db.paperFolder.update({ where: { id: Number(id) }, data: { name: n } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/paper-folders error:", error);
    return NextResponse.json({ error: "改名失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "缺 id" }, { status: 400 });
    // 目录里的试卷不丢：移回「未分类」
    await db.paper.updateMany({ where: { folderId: Number(id) }, data: { folderId: null } });
    await db.paperFolder.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/paper-folders error:", error);
    return NextResponse.json({ error: "删除目录失败" }, { status: 500 });
  }
}
