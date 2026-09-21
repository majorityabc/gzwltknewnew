import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

/**
 * 公开分享下载：凭分享暗号直接下载试卷原文件，无需登录。
 * 此路径在 nginx 中对 /tiku/api/share/ 段放行了鉴权。
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    // 暗号是 48 位十六进制随机串，格式不符直接 404，不做查询
    if (!/^[0-9a-f]{48}$/.test(token)) {
      return NextResponse.json({ error: "链接无效" }, { status: 404 });
    }
    const paper = await db.paper.findUnique({ where: { shareToken: token } });
    if (!paper) {
      return NextResponse.json({ error: "链接无效" }, { status: 404 });
    }
    const buffer = Buffer.from(paper.fileData, "base64");
    const mime = paper.fileType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    // RFC 5987：中文文件名用 filename* 编码，避免乱码
    const encodedName = encodeURIComponent(paper.fileName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        // 公开链接可被 CDN/浏览器缓存，但暗号本身即访问凭据
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("GET /api/share/[token]/download error:", error);
    return NextResponse.json({ error: "下载失败" }, { status: 500 });
  }
}
