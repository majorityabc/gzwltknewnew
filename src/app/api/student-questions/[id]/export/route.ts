import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildQuestionsDocx } from "@/lib/export-question";

// 单个问题导出 Word（与问题篮同一个构建管线，格式一致）

function safeName(s: string) {
  return (s || "问题").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const qid = Number(id);
    if (!Number.isFinite(qid)) return NextResponse.json({ error: "参数错误" }, { status: 400 });

    const q = await prisma.studentQuestion.findUnique({ where: { id: qid }, select: { id: true, studentName: true, askedAt: true } });
    if (!q) return NextResponse.json({ error: "问题不存在" }, { status: 404 });

    const buf = await buildQuestionsDocx([qid]);
    const d = new Date(q.askedAt);
    const fname = safeName(`${q.studentName || "学生"}的问题_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.docx`,
      },
    });
  } catch (error) {
    console.error("GET export error:", error);
    return NextResponse.json({ error: "导出失败，请重试" }, { status: 500 });
  }
}
