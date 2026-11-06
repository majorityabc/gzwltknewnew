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
    const { name, parentId } = await request.json();
    const n = String(name || "").trim().slice(0, 40);
    if (!n) return NextResponse.json({ error: "目录名不能为空" }, { status: 400 });
    const dup = await db.paperFolder.findFirst({ where: { name: n } });
    if (dup) return NextResponse.json({ error: "已存在同名目录" }, { status: 400 });
    // 最多两级：子目录只能挂在一级目录（parentId 为 null）下
    let pid: number | null = null;
    if (parentId !== undefined && parentId !== null && parentId !== "") {
      pid = Number(parentId);
      const parent = await db.paperFolder.findUnique({ where: { id: pid } });
      if (!parent) return NextResponse.json({ error: "父目录不存在" }, { status: 400 });
      if (parent.parentId !== null) {
        return NextResponse.json({ error: "最多两级目录：只能在一级目录下建子目录" }, { status: 400 });
      }
    }
    const folder = await db.paperFolder.create({ data: { name: n, parentId: pid } });
    return NextResponse.json({ data: folder });
  } catch (error) {
    console.error("POST /api/paper-folders error:", error);
    return NextResponse.json({ error: "创建目录失败" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, name, parentId } = await request.json();
    if (!id) return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    const folder = await db.paperFolder.findUnique({ where: { id: Number(id) } });
    if (!folder) return NextResponse.json({ error: "目录不存在" }, { status: 400 });
    const data: { name?: string; parentId?: number | null } = {};
    if (name !== undefined) {
      const n = String(name || "").trim().slice(0, 40);
      if (!n) return NextResponse.json({ error: "目录名不能为空" }, { status: 400 });
      data.name = n;
    }
    if (parentId !== undefined) {
      if (parentId === null || parentId === "") {
        data.parentId = null;
      } else {
        const pid = Number(parentId);
        if (pid === Number(id)) {
          return NextResponse.json({ error: "不能把目录挂到自己名下" }, { status: 400 });
        }
        const parent = await db.paperFolder.findUnique({ where: { id: pid } });
        if (!parent) return NextResponse.json({ error: "父目录不存在" }, { status: 400 });
        if (parent.parentId !== null) {
          return NextResponse.json({ error: "最多两级目录：只能挂到一级目录下" }, { status: 400 });
        }
        // 自己已有子目录时再降级为子目录会造出第三层
        const childCount = await db.paperFolder.count({ where: { parentId: Number(id) } });
        if (childCount > 0) {
          return NextResponse.json({ error: "该目录已有子目录，不能再移动为子目录（最多两级）" }, { status: 400 });
        }
        data.parentId = pid;
      }
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    await db.paperFolder.update({ where: { id: Number(id) }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/paper-folders error:", error);
    return NextResponse.json({ error: "修改目录失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "缺 id" }, { status: 400 });
    // 目录里的试卷不丢：移回「未分类」
    await db.paper.updateMany({ where: { folderId: Number(id) }, data: { folderId: null } });
    // 子目录提升为一级，子目录里的试卷不动
    await db.paperFolder.updateMany({ where: { parentId: Number(id) }, data: { parentId: null } });
    await db.paperFolder.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/paper-folders error:", error);
    return NextResponse.json({ error: "删除目录失败" }, { status: 500 });
  }
}
