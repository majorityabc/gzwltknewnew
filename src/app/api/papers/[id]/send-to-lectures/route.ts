import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { SignJWT } from "jose";
import fs from "node:fs";

/** 把试卷原文件推给讲义站（gzwljy）的试卷上传接口，涂画试卷页即可打开讲解 */

const LECTURES_UPLOAD_URL = "http://127.0.0.1:3000/lectures/api/papers";
const LECTURES_ENV = "/root/gzwljy/.env.local";

function readLecturesJwtSecret(): string {
  const content = fs.readFileSync(LECTURES_ENV, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*JWT_SECRET\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  throw new Error("讲义站 JWT_SECRET 未找到");
}

async function signAdminToken(secret: string): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const force = new URL(request.url).searchParams.get("force") === "1";

    const paper = await db.paper.findUnique({ where: { id: Number(id) } });
    if (!paper) return NextResponse.json({ error: "试卷不存在" }, { status: 404 });
    if (!paper.fileData) {
      return NextResponse.json({ error: "试卷没有文件内容，无法发送" }, { status: 400 });
    }

    // 幂等：已发送过直接返回，除非 force=1
    if (paper.lecturesPaperId && !force) {
      return NextResponse.json({
        data: { lecturesPaperId: paper.lecturesPaperId, already: true },
      });
    }

    const buffer = Buffer.from(paper.fileData, "base64");
    const fileName = `${paper.title}.${paper.fileType}`;
    const jwt = await signAdminToken(readLecturesJwtSecret());

    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(buffer)]), fileName);
    fd.append("title", paper.title);

    const res = await fetch(LECTURES_UPLOAD_URL, {
      method: "POST",
      headers: { Cookie: `admin_token=${jwt}` },
      body: fd,
      signal: AbortSignal.timeout(120_000),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.data?.id) {
      const msg = body?.error || `讲义站接口异常（HTTP ${res.status}）`;
      return NextResponse.json({ error: msg }, { status: res.status >= 500 ? 502 : 500 });
    }

    const lecturesPaperId = Number(body.data.id);
    await db.paper.update({
      where: { id: paper.id },
      data: { lecturesPaperId, lecturesSentAt: new Date() },
    });

    return NextResponse.json({ data: { lecturesPaperId, already: false } });
  } catch (error) {
    console.error("POST /api/papers/[id]/send-to-lectures error:", error);
    const msg = error instanceof Error ? error.message : "发送到讲题页失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
