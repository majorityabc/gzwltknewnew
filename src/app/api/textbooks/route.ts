import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  try {
    const { name, grade, sortOrder } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "请提供 name" },
        { status: 400 },
      );
    }

    let order = sortOrder;
    if (order === undefined || order === null) {
      const max = await prisma.textbook.findFirst({
        orderBy: { sortOrder: "desc" },
      });
      order = (max?.sortOrder ?? -1) + 1;
    }

    const textbook = await prisma.textbook.create({
      data: {
        name,
        grade: grade ?? null,
        sortOrder: order,
      },
    });

    return NextResponse.json({ data: textbook }, { status: 201 });
  } catch (error) {
    console.error("POST /api/textbooks error:", error);
    return NextResponse.json(
      { error: "创建课本失败" },
      { status: 500 },
    );
  }
}
