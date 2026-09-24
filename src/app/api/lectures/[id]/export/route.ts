import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lectureToDocxBuffer } from "@/lib/export-lecture";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function safeName(s: string) {
  return (s || "讲义").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
}

// GET /api/lectures/[id]/export?format=docx|pdf
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lecId = parseInt(id, 10);
  if (!lecId) return NextResponse.json({ error: "id 非法" }, { status: 400 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "docx";

  const lec = await prisma.lecture.findUnique({ where: { id: lecId } });
  if (!lec) return NextResponse.json({ error: "讲义不存在" }, { status: 404 });

  let docxBuf: Buffer;
  try {
    docxBuf = await lectureToDocxBuffer(lec.title, lec.content || "{}");
  } catch (e) {
    console.error("[lecture-export] docx 生成失败:", e);
    return NextResponse.json({ error: "导出失败，请重试" }, { status: 500 });
  }

  const fname = `${safeName(lec.title)}_${new Date().toISOString().slice(0, 10)}`;

  if (format === "docx") {
    return new NextResponse(new Uint8Array(docxBuf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.docx`,
      },
    });
  }

  // PDF：docx → libreoffice 转换
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lecexp-"));
  const docxPath = path.join(tmpDir, `${fname}.docx`);
  try {
    await fs.writeFile(docxPath, docxBuf);
    await execFileAsync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, docxPath], { timeout: 90000 });
    const pdfPath = docxPath.replace(/\.docx$/, ".pdf");
    const pdfBuf = await fs.readFile(pdfPath);
    return new NextResponse(new Uint8Array(pdfBuf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.pdf`,
      },
    });
  } catch (e) {
    console.error("[lecture-export] pdf 转换失败:", e);
    return NextResponse.json({ error: "PDF 转换失败，可先导出 Word" }, { status: 500 });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
