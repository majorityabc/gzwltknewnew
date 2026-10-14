import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import AdmZip from "adm-zip";

const execFileAsync = promisify(execFile);

/**
 * PPT 导入：每页 = 一道题
 * 1) soffice 把 pptx 转成 PDF
 * 2) pdftoppm 把每页导成 PNG（base64 返回）
 * 3) 同时解析 pptx XML 提取每页文字（可编辑、可搜索）
 */
export async function POST(request: NextRequest) {
  let tmpDir = "";
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请上传一个 .pptx 文件" }, { status: 400 });
    }
    if (!/\.pptx?$/i.test(file.name)) {
      return NextResponse.json({ error: "仅支持 .pptx / .ppt 格式" }, { status: 400 });
    }
    if (file.size > 80 * 1024 * 1024) {
      return NextResponse.json({ error: "文件超过 80MB，请拆分后再导入" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ---- 提取每页文字（pptx = zip，文本在 ppt/slides/slideN.xml 的 <a:t> 里） ----
    const slideTexts: string[] = [];
    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries()
        .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
        .sort((a, b) => {
          const na = parseInt(a.entryName.match(/slide(\d+)\.xml$/)![1], 10);
          const nb = parseInt(b.entryName.match(/slide(\d+)\.xml$/)![1], 10);
          return na - nb;
        });
      for (const entry of entries) {
        const xml = entry.getData().toString("utf8");
        // 每个 <a:p> 段落内的 <a:t> 文本连起来，段落之间换行
        const paras: string[] = [];
        const paraRe = /<a:p\b[\s\S]*?<\/a:p>/g;
        let m: RegExpExecArray | null;
        while ((m = paraRe.exec(xml)) !== null) {
          const texts: string[] = [];
          const tRe = /<a:t>([\s\S]*?)<\/a:t>/g;
          let tm: RegExpExecArray | null;
          while ((tm = tRe.exec(m[0])) !== null) {
            texts.push(tm[1]);
          }
          const line = texts.join("").trim();
          if (line) paras.push(line);
        }
        slideTexts.push(paras.join("\n"));
      }
    } catch (e) {
      console.warn("[parse-pptx] 文字提取失败（不影响图片导入）:", e);
    }

    // ---- 转 PDF → 每页 PNG ----
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pptx-"));
    const pptxPath = path.join(tmpDir, "input.pptx");
    await fs.writeFile(pptxPath, buffer);

    await execFileAsync(
      "soffice",
      ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, pptxPath],
      { timeout: 120000 },
    );
    const pdfPath = path.join(tmpDir, "input.pdf");
    // soffice 失败时退出码仍是 0，必须检查产物
    await fs.access(pdfPath);

    const outPrefix = path.join(tmpDir, "slide");
    await execFileAsync(
      "pdftoppm",
      ["-png", "-r", "110", pdfPath, outPrefix],
      { timeout: 120000 },
    );

    const pngFiles = (await fs.readdir(tmpDir))
      .filter((f) => /^slide-\d+\.png$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)![0], 10);
        const nb = parseInt(b.match(/\d+/)![0], 10);
        return na - nb;
      });
    if (!pngFiles.length) throw new Error("PDF 转换后没有生成任何页面");

    const slides = [];
    for (let i = 0; i < pngFiles.length; i++) {
      const png = await fs.readFile(path.join(tmpDir, pngFiles[i]));
      slides.push({
        page: i + 1,
        image: `data:image/png;base64,${png.toString("base64")}`,
        text: slideTexts[i] || "",
      });
    }

    console.log(`[parse-pptx] ${file.name}: ${slides.length} 页`);
    return NextResponse.json({ slides });
  } catch (error) {
    console.error("[parse-pptx] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PPT 解析失败" },
      { status: 500 },
    );
  } finally {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
