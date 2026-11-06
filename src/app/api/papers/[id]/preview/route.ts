import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileP = promisify(execFile);

/** 试卷在线预览（浏览器直接打开）：PDF 直接 inline 发；DOCX 服务器转 PDF 后 inline（磁盘缓存） */

const CACHE_DIR = "/root/gzwltknewnew/.cache/preview";

/**
 * .docx → PDF 走 pandoc + xelatex（soffice 会丢 OMML 公式里的字母数字）：
 * pandoc 产 tex → fix_math_symbols.py 折叠数学字母数字符号 → xelatex 编译。
 */
async function docxToPdfPandoc(tmpDir: string, src: string): Promise<string> {
  const texPath = path.join(tmpDir, "tmp.tex");
  await execFileP("pandoc", [
    src, "-s", "-o", texPath,
    `--extract-media=${tmpDir}`, // 抽出嵌入图片，tex 里相对路径 media/... 依赖 xelatex 的 cwd=tmpDir
    "-V", "CJKmainfont=Noto Serif CJK SC",
    "-V", "mainfont=Liberation Serif",
    "-V", "geometry:margin=2cm",
  ], { timeout: 120000 });
  await execFileP("python3", ["/root/scripts/fix_math_symbols.py", texPath], { timeout: 120000 });
  // nonstopmode 下有小错误也可能非零退出，以产物为准
  await execFileP("xelatex", ["-interaction=nonstopmode", texPath], { timeout: 120000, cwd: tmpDir }).catch(() => {});
  const pdfPath = path.join(tmpDir, "tmp.pdf");
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 500) throw new Error("xelatex 未产出 PDF");
  return pdfPath;
}

async function docxToPdf(id: number, docxBuf: Buffer): Promise<Buffer | null> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `${id}.pdf`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);  // 试卷文件本体上传后不变，按 id 缓存安全

  const tmpDir = fs.mkdtempSync(path.join("/tmp", `paper-${id}-`));
  try {
    const src = path.join(tmpDir, "src.docx");
    fs.writeFileSync(src, docxBuf);
    let out: string | null = null;
    try {
      out = await docxToPdfPandoc(tmpDir, src);
    } catch (e) {
      console.error(`[paper-preview] pandoc 转换失败 id=${id}，回退 soffice:`, e instanceof Error ? e.message : e);
    }
    if (!out) {
      // 独立 UserInstallation 避免并发 profile 锁；注意 soffice 失败时退出码也可能为 0 → 必须查产物
      await execFileP("soffice", [
        "--headless", "--norestore",
        `-env:UserInstallation=file://${tmpDir}/lo-profile`,
        "--convert-to", "pdf", "--outdir", tmpDir, src,
      ], { timeout: 120000 });
      out = path.join(tmpDir, "src.pdf");
    }
    if (!fs.existsSync(out) || fs.statSync(out).size < 500) return null;
    const pdf = fs.readFileSync(out);
    fs.writeFileSync(cached, pdf);
    return pdf;
  } catch (e) {
    console.error(`[paper-preview] soffice 转换失败 id=${id}:`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const paper = await db.paper.findUnique({ where: { id: Number(id) } });
    if (!paper) return NextResponse.json({ error: "试卷不存在" }, { status: 404 });

    const encodedName = encodeURIComponent(paper.fileName.replace(/\.docx$/i, ".pdf"));

    if (paper.fileType === "pdf") {
      const buffer = Buffer.from(paper.fileData, "base64");
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(buffer.length),
          "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        },
      });
    }

    // docx → 转 PDF（首次转换几秒，之后命中缓存）
    const pdf = await docxToPdf(paper.id, Buffer.from(paper.fileData, "base64"));
    if (!pdf) {
      return NextResponse.json({ error: "预览转换失败，请下载后用 Word/WPS 打开" }, { status: 500 });
    }
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("GET /api/papers/[id]/preview error:", error);
    return NextResponse.json({ error: "预览失败" }, { status: 500 });
  }
}
