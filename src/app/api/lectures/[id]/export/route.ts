import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lectureToDocxBuffer } from "@/lib/export-lecture";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

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

  // 导出缓存：内容没变直接返回上次生成的文件（公式渲染是耗时大头，64 个公式 ≈ 20s）
  const cacheKey = createHash("sha256")
    .update(`${lecId}|${lec.title}|${lec.content}|${format}|v1`)
    .digest("hex")
    .slice(0, 16);
  const cacheDir = path.join(process.cwd(), "cache", "export");
  const cacheFile = path.join(cacheDir, `${cacheKey}.${format}`);
  const fname = `${safeName(lec.title)}_${new Date().toISOString().slice(0, 10)}`;

  const cached = await fs.readFile(cacheFile).catch(() => null);
  if (cached) {
    const mime = format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return new NextResponse(new Uint8Array(cached), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.${format}`,
        "X-Export-Cache": "hit",
      },
    });
  }

  let docxBuf: Buffer;
  try {
    docxBuf = await lectureToDocxBuffer(lec.title, lec.content || "{}", { formulaAsImage: format === "pdf" });
  } catch (e) {
    console.error("[lecture-export] docx 生成失败:", e);
    return NextResponse.json({ error: "导出失败，请重试" }, { status: 500 });
  }

  if (format === "docx") {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, docxBuf).catch(() => {});
    return new NextResponse(new Uint8Array(docxBuf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.docx`,
        "X-Export-Cache": "miss",
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
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, pdfBuf).catch(() => {});
    return new NextResponse(new Uint8Array(pdfBuf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.pdf`,
        "X-Export-Cache": "miss",
      },
    });
  } catch (e) {
    console.error("[lecture-export] pdf 转换失败:", e);
    return NextResponse.json({ error: "PDF 转换失败，可先导出 Word" }, { status: 500 });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
