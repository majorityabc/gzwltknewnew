import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

/** 试卷原文件下载 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const paper = await db.paper.findUnique({ where: { id: Number(id) } });
    if (!paper) {
      return NextResponse.json({ error: "试卷不存在" }, { status: 404 });
    }
    // 下载计数（失败不影响下载本身）
    db.paper.update({ where: { id: paper.id }, data: { downloadCount: { increment: 1 } } }).catch(() => {});

    const buffer = Buffer.from(paper.fileData, "base64");
    const mime = paper.fileType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    // RFC 5987：中文文件名用 filename* 编码，避免乱码
    const encodedName = encodeURIComponent(paper.fileName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch (error) {
    console.error("GET /api/papers/[id]/download error:", error);
    return NextResponse.json({ error: "下载失败" }, { status: 500 });
  }
}
