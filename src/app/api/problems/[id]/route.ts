import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeContentHash } from "@/lib/content-utils";
import { storeInlineImages, collectImageIds, deleteImages } from "@/lib/images";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    let orphanedImageIds: string[] = [];

    if (body.content !== undefined) {
      const contentStr = typeof body.content === "string" ? body.content : JSON.stringify(body.content);
      // 先用原始 content 重算哈希，再把内联图片抽出入库
      updateData.contentHash = computeContentHash(contentStr);
      const storedContent = await storeInlineImages(contentStr);

      const old = await prisma.problem.findUnique({
        where: { id: Number(id) },
        select: { content: true },
      });
      if (old) {
        const newImageIds = new Set(collectImageIds(storedContent));
        orphanedImageIds = collectImageIds(old.content).filter(
          (imageId) => !newImageIds.has(imageId),
        );
      }
      updateData.content = storedContent;
    }
    if (body.difficulty !== undefined) {
      updateData.difficulty = Number(body.difficulty);
    }
    if (body.lessonTitle !== undefined) {
      updateData.lessonTitle = body.lessonTitle || null;
    }
    if (body.questionType !== undefined) {
      updateData.questionType = body.questionType || null;
    }
    if (body.sourceDate !== undefined) {
      updateData.sourceDate = body.sourceDate || null;
    }
    if (body.remarks !== undefined) {
      updateData.remarks = body.remarks || null;
    }

    if (body.knowledgePointIds) {
      await prisma.problemKnowledgePoint.deleteMany({
        where: { problemId: Number(id) },
      });
      updateData.knowledgePoints = {
        create: (body.knowledgePointIds as number[]).map((kpId: number) => ({
          knowledgePointId: kpId,
        })),
      };
    }

    const problem = await prisma.problem.update({
      where: { id: Number(id) },
      data: updateData,
      include: {
        knowledgePoints: {
          include: { knowledgePoint: true },
        },
      },
    });

    // 更新成功后清理不再被引用的旧图片
    if (orphanedImageIds.length > 0) {
      await deleteImages(orphanedImageIds);
    }

    return NextResponse.json({ data: problem });
  } catch (error) {
    console.error("PUT /api/problems/[id] error:", error);
    return NextResponse.json(
      { error: "更新题目失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const problem = await prisma.problem.findUnique({
      where: { id: Number(id) },
      select: { content: true },
    });
    // Delete junction records first (CASCADE not automatic in SQLite with Prisma)
    await prisma.problemKnowledgePoint.deleteMany({
      where: { problemId: Number(id) },
    });
    await prisma.problem.delete({ where: { id: Number(id) } });
    // 删除题目引用的图片
    if (problem) {
      await deleteImages(collectImageIds(problem.content));
    }
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/problems/[id] error:", error);
    return NextResponse.json(
      { error: "删除题目失败" },
      { status: 500 },
    );
  }
}
