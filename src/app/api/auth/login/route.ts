import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, setTokenCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    const trimmed = String(username || "").trim();
    if (!trimmed || !password) {
      return NextResponse.json(
        { error: "请输入用户名和密码" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { username: trimmed },
    });
    if (!user) {
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 },
      );
    }

    const valid = await comparePassword(String(password), user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 },
      );
    }

    await setTokenCookie(user.id, user.username);

    return NextResponse.json({
      data: { id: user.id, username: user.username },
    });
  } catch {
    return NextResponse.json(
      { error: "登录失败，请重试" },
      { status: 500 },
    );
  }
}
