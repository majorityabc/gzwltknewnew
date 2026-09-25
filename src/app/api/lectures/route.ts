import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


// GET /api/lectures → 讲义列表（附学生端推送状态）
export async function GET() {
  const lectures = await prisma.lecture.findMany({
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  // 推送状态来自学生端 sqlite（source_id → pushed_at）
  let pushMap: Record<number, string> = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite");
    const db = new DatabaseSync("/root/gzwljy/local.db", { readonly: true });
    const cols = db.prepare("PRAGMA table_info(lectures)").all() as { name: string }[];
    if (cols.some((c) => c.name === "source_id")) {
      const rows = db.prepare("SELECT source_id, pushed_at FROM lectures WHERE source_id IS NOT NULL").all() as { source_id: number; pushed_at: string }[];
      for (const r of rows) pushMap[r.source_id] = r.pushed_at;
    }
    db.close();
  } catch { /* 学生端库不可读时静默降级 */ }
  return NextResponse.json({
    data: lectures.map((l) => ({ ...l, pushedAt: pushMap[l.id] || null })),
  });
}

// POST /api/lectures { title } → 新建
export async function POST(req: Request) {
  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  const lecture = await prisma.lecture.create({ data: { title: title.trim() } });
  return NextResponse.json({ data: { id: lecture.id, title: lecture.title } });
}
