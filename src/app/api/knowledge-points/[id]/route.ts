import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const numId = Number(id);

    // Delete all problem-knowledge-point links first
    await prisma.problemKnowledgePoint.deleteMany({
      where: { knowledgePointId: numId },
    });

    // Delete the knowledge point
    await prisma.knowledgePoint.delete({
      where: { id: numId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "知识点不存在" },
        { status: 404 },
      );
    }
    console.error("DELETE /api/knowledge-points/[id] error:", error);
    return NextResponse.json(
      { error: "删除知识点失败" },
      { status: 500 },
    );
  }
}
