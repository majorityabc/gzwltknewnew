import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storeInlineImages } from "@/lib/images";

// 学生问题库：GET 列表 / POST 新建
// 与题库共用 problem_images 表存图，按 课本→章→课时 归类

const INCLUDE = {
  textbook: { select: { id: true, name: true } },
  chapter: { select: { id: true, title: true } },
  lesson: { select: { id: true, title: true } },
  images: { select: { imageId: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } },
};

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/;

async function saveImages(questionId: number, dataUrls: string[]) {
  for (let i = 0; i < dataUrls.length; i++) {
    const m = dataUrls[i].match(DATA_URL_RE);
    if (!m) continue;
    if (m[2].length > 12 * 1024 * 1024) continue; // 单张 base64 上限 12MB
    const img = await prisma.problemImage.create({ data: { mimeType: m[1], data: m[2] } });
    await prisma.studentQuestionImage.create({
      data: { questionId, imageId: img.id, sortOrder: i },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const textbookId = searchParams.get("textbookId");
    const chapterId = searchParams.get("chapterId");
    const lessonId = searchParams.get("lessonId");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (textbookId) where.textbookId = Number(textbookId);
    if (chapterId) where.chapterId = Number(chapterId);
    if (lessonId) where.lessonId = Number(lessonId);
    if (search) {
      where.OR = [
        { content: { contains: search } },
        { studentName: { contains: search } },
      ];
    }

    const rows = await prisma.studentQuestion.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ askedAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/student-questions error:", error);
    return NextResponse.json({ error: "获取问题列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const content = String(body.content ?? "").trim();
    const images: string[] = Array.isArray(body.images) ? body.images.filter((x: unknown) => typeof x === "string") : [];

    if (!content && images.length === 0) {
      return NextResponse.json({ error: "问题和截图至少要有一样" }, { status: 400 });
    }

    let askedAt = new Date();
    if (body.askedAt) {
      const d = new Date(body.askedAt);
      if (!isNaN(d.getTime())) askedAt = d;
    }

    const q = await prisma.studentQuestion.create({
      data: {
        content,
        studentName: body.studentName ? String(body.studentName).trim().slice(0, 30) : null,
        textbookId: body.textbookId ? Number(body.textbookId) : null,
        chapterId: body.chapterId ? Number(body.chapterId) : null,
        lessonId: body.lessonId ? Number(body.lessonId) : null,
        explanation: await storeInlineImages(String(body.explanation ?? "")),
        askedAt,
      },
      include: INCLUDE,
    });
    await saveImages(q.id, images);

    const full = await prisma.studentQuestion.findUnique({ where: { id: q.id }, include: INCLUDE });
    return NextResponse.json({ data: full });
  } catch (error) {
    console.error("POST /api/student-questions error:", error);
    return NextResponse.json({ error: "保存问题失败" }, { status: 500 });
  }
}
