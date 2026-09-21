import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

/** 生成（或复用已有）试卷的公开分享暗号 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const paper = await db.paper.findUnique({ where: { id: Number(id) } });
    if (!paper) {
      return NextResponse.json({ error: "试卷不存在" }, { status: 404 });
    }
    const shareToken = paper.shareToken ?? randomBytes(24).toString("hex");
    if (!paper.shareToken) {
      await db.paper.update({ where: { id: paper.id }, data: { shareToken } });
    }
    return NextResponse.json({ data: { shareToken } });
  } catch (error) {
    console.error("POST /api/papers/[id]/share error:", error);
    return NextResponse.json({ error: "生成分享链接失败" }, { status: 500 });
  }
}
