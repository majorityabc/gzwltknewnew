import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const image = await prisma.problemImage.findUnique({ where: { id } });

    if (!image) {
      return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    }

    const buffer = Buffer.from(image.data, "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("GET /api/images/[id] error:", error);
    return NextResponse.json({ error: "获取图片失败" }, { status: 500 });
  }
}
