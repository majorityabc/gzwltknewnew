import { NextRequest, NextResponse } from "next/server";
import { parseDocx } from "@/lib/docx-parser";
import { getUserFromCookies } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请上传一个 .docx 文件" }, { status: 400 });
    }

    if (!file.name.endsWith(".docx")) {
      return NextResponse.json({ error: "仅支持 .docx 格式" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const content = parseDocx(buffer);

    const imgCount = content.paragraphs.reduce(
      (n, p) => n + p.runs.filter((r) => r.type === "image").length, 0,
    );
    console.log(
      `Parsed .docx: ${content.paragraphs.length} paragraphs, ${imgCount} images, ` +
      `sample: ${JSON.stringify(content.paragraphs.slice(0, 3)).substring(0, 300)}`,
    );

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Error parsing .docx:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析失败" },
      { status: 500 },
    );
  }
}
