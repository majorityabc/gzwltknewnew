import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// GET /tiku/api/latex2png?latex=... → { dataUrl }
// 把 LaTeX 渲染成 PNG（供 iPad 手写板把讲义公式铺成底图修改）
export async function GET(req: NextRequest) {
  const latex = req.nextUrl.searchParams.get("latex");
  if (!latex || latex.length > 500) {
    return NextResponse.json({ error: "latex 缺失或过长" }, { status: 400 });
  }
  try {
    const { stdout } = await execFileP("node", ["scripts/latex2png.mjs", latex], {
      cwd: process.cwd(),
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const b64 = stdout.trim();
    if (!b64) return NextResponse.json({ error: "渲染失败" }, { status: 500 });
    return NextResponse.json({ data: { dataUrl: `data:image/png;base64,${b64}` } });
  } catch (e) {
    console.warn("[latex2png]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "渲染失败" }, { status: 500 });
  }
}
