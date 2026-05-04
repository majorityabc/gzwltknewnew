import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const textbooks = await prisma.textbook.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ data: textbooks });
  } catch (error) {
    console.error("GET /api/textbooks error:", error);
    return NextResponse.json(
      { error: "获取课本列表失败" },
      { status: 500 },
    );
  }
}
