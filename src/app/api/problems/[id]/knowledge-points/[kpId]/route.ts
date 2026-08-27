import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; kpId: string }> },
) {
  try {
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
