import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromCookies } from "@/lib/auth";

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

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const body = await request.json();
    const tb = await prisma.textbook.create({
      data: {
        name: body.name,
        grade: body.grade || null,
        sortOrder: body.sortOrder || 0,
      },
    });
    return NextResponse.json({ data: tb }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "创建课本失败" }, { status: 500 });
  }
}
