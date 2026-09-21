import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

/** 试卷库：列表 + 上传 */

const PAPER_TYPES = ["单元测试", "月考", "期中", "期末", "其他"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paperType = searchParams.get("paperType");
    const textbookId = searchParams.get("textbookId");

    const papers = await db.paper.findMany({
      where: {
        ...(paperType ? { paperType } : {}),
        ...(textbookId ? { textbookId: Number(textbookId) } : {}),
      },
      select: {
        id: true,
        title: true,
        paperType: true,
        remarks: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        downloadCount: true,
        textbookId: true,
        textbook: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: papers });
  } catch (error) {
    console.error("GET /api/papers error:", error);
    return NextResponse.json({ error: "获取试卷列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    }

    const isDocx = file.name.toLowerCase().endsWith(".docx");
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    if (!isDocx && !isPdf) {
      return NextResponse.json({ error: "仅支持 .docx 或 .pdf 文件" }, { status: 400 });
    }
    const limit = isPdf ? 30 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > limit) {
      return NextResponse.json(
        { error: `文件过大（上限 ${isPdf ? 30 : 20}MB）` },
        { status: 400 },
      );
    }

    let title = String(formData.get("title") || "").trim();
    if (!title && isDocx) {
      // 自动提取 Word 第一段非空文字作为标题
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const { parseDocx } = await import("@/lib/docx-parser");
        const doc = await parseDocx(buffer);
        for (const para of doc.paragraphs) {
          const text = para.runs
            .map((r) => r.type === "text" ? r.text : "")
            .join("")
            .trim();
          if (text) {
            title = text.slice(0, 80);
            break;
          }
        }
      } catch {
        // 提取失败不阻断上传
      }
    }
    if (!title) {
      title = file.name.replace(/\.(docx|pdf)$/i, "").slice(0, 80) || "未命名试卷";
    }

    const paperTypeRaw = String(formData.get("paperType") || "其他");
    const paperType = PAPER_TYPES.includes(paperTypeRaw) ? paperTypeRaw : "其他";
    const textbookIdRaw = String(formData.get("textbookId") || "");
    const textbookId = textbookIdRaw ? Number(textbookIdRaw) : null;
    const remarks = String(formData.get("remarks") || "").trim() || null;

    const fileData = Buffer.from(await file.arrayBuffer()).toString("base64");

    const paper = await db.paper.create({
      data: {
        title,
        paperType,
        remarks,
        fileName: file.name,
        fileSize: file.size,
        fileType: isPdf ? "pdf" : "docx",
        fileData,
        ...(textbookId ? { textbookId } : {}),
      },
      select: { id: true },
    });
    return NextResponse.json({ data: paper });
  } catch (error) {
    console.error("POST /api/papers error:", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
