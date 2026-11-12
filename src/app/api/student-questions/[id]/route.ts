import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 学生问题库：PATCH 修改 / DELETE 删除

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/;

async function replaceImages(questionId: number, dataUrls: string[]) {
  const old = await prisma.studentQuestionImage.findMany({ where: { questionId } });
  if (old.length) {
    await prisma.studentQuestionImage.deleteMany({ where: { questionId } });
    await prisma.problemImage.deleteMany({ where: { id: { in: old.map((x) => x.imageId) } } });
  }
  for (let i = 0; i < dataUrls.length; i++) {
    const m = dataUrls[i].match(DATA_URL_RE);
    if (!m) continue;
    if (m[2].length > 12 * 1024 * 1024) continue;
    const img = await prisma.problemImage.create({ data: { mimeType: m[1], data: m[2] } });
    await prisma.studentQuestionImage.create({
      data: { questionId, imageId: img.id, sortOrder: i },
    });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const qid = Number(id);
    if (!Number.isFinite(qid)) return NextResponse.json({ error: "参数错误" }, { status: 400 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.content !== undefined) data.content = String(body.content).trim();
    if (body.studentName !== undefined) data.studentName = body.studentName ? String(body.studentName).trim().slice(0, 30) : null;
    if (body.textbookId !== undefined) data.textbookId = body.textbookId ? Number(body.textbookId) : null;
    if (body.chapterId !== undefined) data.chapterId = body.chapterId ? Number(body.chapterId) : null;
    if (body.lessonId !== undefined) data.lessonId = body.lessonId ? Number(body.lessonId) : null;
    if (body.status !== undefined && ["待讲解", "已解答"].includes(body.status)) data.status = body.status;
    if (body.askedAt !== undefined) {
      const d = new Date(body.askedAt);
      if (!isNaN(d.getTime())) data.askedAt = d;
    }

    await prisma.studentQuestion.update({ where: { id: qid }, data });
    if (Array.isArray(body.images)) {
      await replaceImages(qid, body.images.filter((x: unknown) => typeof x === "string"));
    }

    const full = await prisma.studentQuestion.findUnique({
      where: { id: qid },
      include: {
        textbook: { select: { id: true, name: true } },
        chapter: { select: { id: true, title: true } },
        lesson: { select: { id: true, title: true } },
        images: { select: { imageId: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } },
      },
    });
    return NextResponse.json({ data: full });
  } catch (error) {
    console.error("PATCH /api/student-questions/[id] error:", error);
    return NextResponse.json({ error: "修改问题失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const qid = Number(id);
    if (!Number.isFinite(qid)) return NextResponse.json({ error: "参数错误" }, { status: 400 });

    const links = await prisma.studentQuestionImage.findMany({ where: { questionId: qid } });
    await prisma.studentQuestion.delete({ where: { id: qid } }); // 级联删 student_question_images
    if (links.length) {
      await prisma.problemImage.deleteMany({ where: { id: { in: links.map((x) => x.imageId) } } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/student-questions/[id] error:", error);
    return NextResponse.json({ error: "删除问题失败" }, { status: 500 });
  }
}
