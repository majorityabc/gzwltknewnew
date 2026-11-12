import { NextRequest, NextResponse } from "next/server";
import { buildQuestionsDocx } from "@/lib/export-question";

// 问题篮批量导出：POST { ids: [3, 1, 4] } → 一个 Word

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids: number[] = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];
    if (ids.length === 0) return NextResponse.json({ error: "篮子是空的" }, { status: 400 });
    if (ids.length > 100) return NextResponse.json({ error: "一次最多导出 100 个" }, { status: 400 });

    const buf = await buildQuestionsDocx(ids);
    const d = new Date();
    const fname = `问题篮_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.docx`,
      },
    });
  } catch (error) {
    console.error("POST export-basket error:", error);
    return NextResponse.json({ error: "导出失败，请重试" }, { status: 500 });
  }
}
