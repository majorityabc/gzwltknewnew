import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { knowledgePointId } = body;

    if (!knowledgePointId) {
      return NextResponse.json({ error: "请提供 knowledgePointId" }, { status: 400 });
    }

    // Check if already exists
    const existing = await prisma.problemKnowledgePoint.findUnique({
      where: {
        problemId_knowledgePointId: {
          problemId: Number(id),
          knowledgePointId: Number(knowledgePointId),
        },
      },
    });

    if (existing) {
      return NextResponse.json({ data: existing });
    }

    await prisma.problemKnowledgePoint.create({
      data: {
        problemId: Number(id),
        knowledgePointId: Number(knowledgePointId),
      },
    });

    // Return updated problem
    const problem = await prisma.problem.findUnique({
      where: { id: Number(id) },
      include: {
        knowledgePoints: {
          include: { knowledgePoint: true },
        },
      },
    });

    return NextResponse.json({ data: problem }, { status: 201 });
  } catch (error) {
    console.error("POST /api/problems/[id]/knowledge-points error:", error);
    return NextResponse.json({ error: "添加知识点失败" }, { status: 500 });
  }
}
