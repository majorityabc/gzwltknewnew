import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lectureToDocxBuffer } from "@/lib/export-lecture";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

// 学生端站点（gzwljy）的 sqlite 库和上传目录（同服务器本地路径）
const PORTAL_DB = "/root/gzwljy/local.db";
const PORTAL_UPLOADS = "/root/gzwljy/public/uploads";
const CATEGORY_NAME = "必修三";
const CATEGORY_SLUG = "bixiusan";

function openPortalDb() {
  // node:sqlite 内置模块；process.getBuiltinModule 绕过 Next 打包器直接拿原生模块
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(PORTAL_DB);
  // 幂等：分类表/扩展列不存在就建
  db.exec(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("ALTER TABLE lectures ADD COLUMN source_id INTEGER"); } catch { /* 已存在 */ }
  try { db.exec("ALTER TABLE lectures ADD COLUMN pushed_at DATETIME"); } catch { /* 已存在 */ }
  return db;
}

// POST /api/lectures/[id]/push → 生成 PDF 推送到学生端「必修三」
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lecId = parseInt(id, 10);
  if (!lecId) return NextResponse.json({ error: "id 非法" }, { status: 400 });

  const lec = await prisma.lecture.findUnique({ where: { id: lecId } });
  if (!lec) return NextResponse.json({ error: "讲义不存在" }, { status: 404 });

  // 1) 生成 PDF（复用导出管线：docx → soffice）
  let pdfBuf: Buffer;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lecpush-"));
  try {
    const docxBuf = await lectureToDocxBuffer(lec.title, lec.content || "{}", { formulaAsImage: true });
    const docxPath = path.join(tmpDir, "lec.docx");
    await fs.writeFile(docxPath, docxBuf);
    await execFileAsync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, docxPath], { timeout: 90000 });
    pdfBuf = await fs.readFile(docxPath.replace(/\.docx$/, ".pdf"));
  } catch (e) {
    console.error("[lecture-push] PDF 生成失败:", e);
    return NextResponse.json({ error: "PDF 生成失败，请重试" }, { status: 500 });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  // 2) 存到学生端上传目录（文件名固定 = 覆盖式更新，不产生孤儿文件）
  const dir = path.join(PORTAL_UPLOADS, CATEGORY_SLUG);
  await fs.mkdir(dir, { recursive: true });
  const filename = `edit-${lecId}.pdf`;
  await fs.writeFile(path.join(dir, filename), pdfBuf);
  const pdfUrl = `/uploads/${CATEGORY_SLUG}/${filename}`;

  // 3) 学生端 sqlite：分类不存在则建，讲义按 source_id 覆盖更新
  try {
    const db = openPortalDb();
    let cat = db.prepare("SELECT id FROM categories WHERE slug = ?").get(CATEGORY_SLUG) as { id: number } | undefined;
    if (!cat) {
      db.prepare("INSERT INTO categories (name, slug) VALUES (?, ?)").run(CATEGORY_NAME, CATEGORY_SLUG);
      cat = db.prepare("SELECT id FROM categories WHERE slug = ?").get(CATEGORY_SLUG) as { id: number };
    }
    const existing = db.prepare("SELECT id FROM lectures WHERE source_id = ?").get(lecId) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE lectures SET title = ?, pdf_url = ?, category_id = ?, pushed_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(lec.title, pdfUrl, cat.id, existing.id);
    } else {
      db.prepare("INSERT INTO lectures (title, category_id, pdf_url, source_id, pushed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)")
        .run(lec.title, cat.id, pdfUrl, lecId);
    }
    db.close();
  } catch (e) {
    console.error("[lecture-push] 学生端入库失败:", e);
    return NextResponse.json({ error: "推送入库失败，请重试" }, { status: 500 });
  }

  return NextResponse.json({ data: { pdfUrl, category: CATEGORY_NAME, pushedAt: new Date().toISOString() } });
}
