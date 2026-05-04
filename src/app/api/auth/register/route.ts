import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setTokenCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    const trimmed = String(username || "").trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
      return NextResponse.json(
        { error: "用户名需为 3-30 个字符" },
        { status: 400 },
      );
    }
    if (String(password || "").length < 6) {
      return NextResponse.json(
        { error: "密码长度至少 6 位" },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username: trimmed },
    });
    if (existing) {
      return NextResponse.json(
        { error: "用户名已存在" },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(String(password));
    const user = await prisma.user.create({
      data: { username: trimmed, passwordHash },
    });

    await setTokenCookie(user.id, user.username);

    return NextResponse.json(
      { data: { id: user.id, username: user.username } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "注册失败，请重试" },
      { status: 500 },
    );
  }
}
