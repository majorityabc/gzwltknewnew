import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromCookies } from "@/lib/auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; kpId: string }> },
) {
  try {
    const user = await getUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const { id, kpId } = await params;

    await prisma.problemKnowledgePoint.deleteMany({
      where: {
        problemId: Number(id),
        knowledgePointId: Number(kpId),
      },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/problems/[id]/knowledge-points/[kpId] error:", error);
    return NextResponse.json({ error: "移除知识点失败" }, { status: 500 });
  }
}
