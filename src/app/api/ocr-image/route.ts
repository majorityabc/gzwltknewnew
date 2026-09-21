import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync } from "fs";
const execFileP = promisify(execFile);

/**
 * 图片 OCR（v2）：
 * 1. 视觉大模型识别题目 → 结构化段落（文字 / LaTeX 公式 / 表格行）
 * 2. 二次调用定位示意图边界框 → sharp 裁剪 → 以 dataURL 图片嵌入【图】占位处
 * 返回与 /api/parse-docx 同构的 DocContent，前端走同一条分割/编辑流程。
 */

const SYSTEM_PROMPT = `你是物理试卷 OCR 助手。把图片里的物理题目完整转成 JSON。
规则：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。
2. 结构：{"paragraphs":[...]}，按原文顺序排列。普通段落是 {"runs":[...]}。
3. run 有两种：
   - 普通文字：{"type":"text","text":"..."}
   - 公式/希腊字母/上下标/含符号的物理量：{"type":"formula","latex":"..."}（纯 LaTeX，不要 $ 包裹，不要 \\text 包整个普通词）
4. 例：ω 写成 {"type":"formula","latex":"\\omega"}；m/s² 写成 {"type":"formula","latex":"\\text{m/s}^{2}"}；v₀ 写成 {"type":"formula","latex":"v_{0}"}。
5. 题号、括号、标点符号与原文一致，数字和单位保留。
6. 表格必须保持行列结构：整表输出为若干个 {"type":"table_row","cells":["列1","列2",...]} 段落，第一行是表头。单元格里的公式用 $LaTeX$ 形式（如 $\\omega$、$340\\ \\text{m/s}$）。绝不要把表格拆成普通文字段落。
7. 题目中的示意图无法复现，在图所在位置输出 {"type":"text","text":"【图】"} 占位（系统会自动裁出原图里的插图）。
8. 选择题的每个选项（A. B. C. D.）单独一段。
9. 只输出图片中真实存在的内容，不要自己编造或补全。`;

interface OcrRun {
  type: "text" | "formula";
  text?: string;
  latex?: string;
}

interface OcrParagraph {
  runs?: OcrRun[];
  type?: string;
  cells?: string[];
  tableCells?: OcrRun[][];
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("模型未返回 JSON");
  const slice = raw.slice(start, end + 1);
  // 先按原样解析；失败则修复 LaTeX 单反斜杠（\omega → \\omega）再试
  try {
    return JSON.parse(slice);
  } catch {
    return JSON.parse(slice.replace(/\\(?!["\\\/bfnrtu])/g, "\\\\"));
  }
}

/** 单元格字符串 → runs：$LaTeX$ 拆成 formula，其余为 text */
function parseCellRuns(s: string): OcrRun[] {
  const runs: OcrRun[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) runs.push({ type: "text", text: s.slice(last, m.index) });
    runs.push({ type: "formula", latex: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ type: "text", text: s.slice(last) });
  return runs.filter((r) => (r.type === "text" ? r.text : r.latex));
}

function normalize(parsed: unknown): { paragraphs: OcrParagraph[] } {
  const paragraphs: OcrParagraph[] = [];
  const rawParas = (parsed as { paragraphs?: unknown[] })?.paragraphs;
  if (!Array.isArray(rawParas)) throw new Error("JSON 缺少 paragraphs 字段");
  for (const p of rawParas) {
    const entry = p as OcrParagraph;
    if (entry?.type === "table_row" && Array.isArray(entry.cells)) {
      const cells = entry.cells.map((c) => parseCellRuns(String(c ?? "")));
      if (cells.length > 0) paragraphs.push({ tableCells: cells });
      continue;
    }
    const runs: OcrRun[] = [];
    for (const r of entry?.runs ?? []) {
      const run = r as OcrRun;
      if (run?.type === "formula" && run.latex) runs.push({ type: "formula", latex: run.latex });
      else if (run?.type === "text" && run.text) runs.push({ type: "text", text: run.text });
    }
    if (runs.length > 0) paragraphs.push({ runs });
  }
  if (paragraphs.length === 0) throw new Error("未识别到有效内容");
  return { paragraphs };
}

/** Kimi Code（OAuth token 15 分钟过期，过期时用 kimi CLI 代刷） */
function readKimiCreds(): { access_token: string; expires_at?: number } {
  const file = process.env.KIMI_CRED_FILE || "/root/.kimi-code/credentials/kimi-code.json";
  return JSON.parse(readFileSync(file, "utf8"));
}

async function getKimiToken(force = false): Promise<string> {
  const creds = readKimiCreds();
  const fresh =
    creds.expires_at && creds.expires_at - Date.now() / 1000 > 120;
  if (fresh && !force) return creds.access_token;
  try {
    // 触发 CLI 内部的 refresh_token 流程
    await execFileP(
      process.env.KIMI_CLI || "/root/.kimi-code/bin/kimi",
      ["-p", "hi"],
      { timeout: 150000 },
    );
  } catch (e) {
    console.warn("kimi CLI refresh failed:", e);
  }
  return readKimiCreds().access_token;
}

/** 主识别：Kimi Code（api.kimi.com/coding/v1，模型 k3） */
async function callKimi(messages: unknown[], maxTokens: number): Promise<string> {
  // 1) DeepSeek 优先（用户指定；deepseek-flash 支持图片输入）
  const dsKey = process.env.DEEPSEEK_API_KEY;
  if (dsKey) {
    try {
      const dsBase = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
      const dsModel = process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash";
      const r = await fetch(`${dsBase}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${dsKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: dsModel, messages, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(120000),
      });
      if (r.ok) {
        const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        const c = d.choices?.[0]?.message?.content || "";
        if (c.trim()) {
          console.log(`[ocr] via deepseek (${dsModel})`);
          return c;
        }
        console.warn("[ocr] deepseek empty content");
      } else {
        const errText = await r.text().catch(() => "");
        console.warn("DeepSeek OCR error:", r.status, errText.slice(0, 200));
      }
    } catch (e) {
      console.warn("DeepSeek OCR failed:", e instanceof Error ? e.message : String(e));
    }
  }
  // 2) kimi（额度重置后自动可用）
  const base = process.env.KIMI_OCR_BASE || "https://api.kimi.com/coding/v1";
  const model = process.env.KIMI_OCR_MODEL || "k3";
  const doFetch = async (token: string) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(120000),
    });
  let res = await doFetch(await getKimiToken());
  if (res.status === 401) {
    // token 刚好过期：强制刷新后重试一次
    res = await doFetch(await getKimiToken(true));
  }
  if (res.ok) {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content || "";
    if (content.trim()) return content;
  } else {
    const errText = await res.text().catch(() => "");
    console.warn("Kimi OCR error:", res.status, errText.slice(0, 200));
  }
  // kimi 不可用（额度耗尽/网络）→ 自动切换 glm-4.6v
  const zaiKey = process.env.ZAI_API_KEY;
  if (!zaiKey) throw new Error("OCR_NO_PROVIDER");
  const zaiBase = process.env.ZAI_OCR_BASE || "https://api.z.ai/api/coding/paas/v4";
  const zaiModel = process.env.ZAI_OCR_MODEL || "glm-4.6v";
  console.warn("[ocr] falling back to", zaiModel);
  const res2 = await fetch(`${zaiBase}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${zaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: zaiModel, messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res2.ok) {
    const errText2 = await res2.text().catch(() => "");
    console.error("GLM OCR error:", res2.status, errText2.slice(0, 200));
    throw new Error(`OCR_API_${res2.status}`);
  }
  const data2 = (await res2.json()) as { choices?: { message?: { content?: string } }[] };
  return data2.choices?.[0]?.message?.content || "";
}

/** 插图处理：同样走 Kimi k3。每个示意图二选一：
 *  crop —— 给出边界框（归一化 0-1000），从原图裁剪（保真）
 *  svg  —— 示意图与文字交织无法裁剪时，模型直接用 SVG 重绘
 */
const FIGURE_PROMPT = `你负责处理试卷图片里的示意图。图片上叠加了红色网格与 0-1000 坐标刻度（列标签在顶部、行标签在左侧），请对照网格读出准确坐标。对图中的每个示意图（不含纯文字段落）输出一个处理方案，只输出一个 JSON 对象，格式：
{"figures":[{"mode":"crop","box":[x1,y1,x2,y2]},{"mode":"svg","svg":"<svg ...>...</svg>"}]}
规则：
1. 优先用 crop：示意图能被一个矩形框完整框住、且矩形内基本没有混入正文文字时，用 crop。box 坐标归一化到 0-1000，框要稍大于图形本身（留白 2%），确保完整。
2. 当示意图与文字紧密交织、任何矩形都会裁进大量文字时，用 svg 重绘：用简洁的白底黑线物理示意图风格（线宽 2-3，viewBox="0 0 800 400"，必要文字标注用 <text>），还原原图的物理要素（如测速仪、汽车、声波弧线、方向箭头等）。
3. 多个示意图按从上到下排列。只输出 JSON。`;

/** 在原图上叠加 0-1000 红色坐标网格，帮助模型读准坐标 */
async function withGrid(buffer: Buffer): Promise<string> {
  const meta = await sharp(buffer).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (!W || !H) return `data:image/png;base64,${buffer.toString("base64")}`;
  const lines: string[] = [];
  for (let i = 1; i < 10; i++) {
    const x = Math.round((W * i) / 10);
    const y = Math.round((H * i) / 10);
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(255,0,0,.4)" stroke-width="1"/>`);
    lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(255,0,0,.4)" stroke-width="1"/>`);
    lines.push(`<text x="${x + 3}" y="14" font-size="13" fill="red">${i * 100}</text>`);
    lines.push(`<text x="3" y="${y - 4}" font-size="13" fill="red">${i * 100}</text>`);
  }
  lines.push(`<text x="3" y="14" font-size="13" fill="red">0,0</text>`);
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${lines.join("")}</svg>`;
  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  const comp = await sharp(buffer).composite([{ input: overlay }]).png().toBuffer();
  return `data:image/png;base64,${comp.toString("base64")}`;
}

async function callKimiFigure(dataUrl: string): Promise<string> {
  const messages = [
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: FIGURE_PROMPT },
      ],
    },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await callKimi(messages, 8000);
      if (out.trim()) return out;
      console.warn(`figure call attempt ${attempt + 1}: empty output`);
    } catch (e) {
      console.warn(
        `figure call attempt ${attempt + 1} failed:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  return "";
}




/** 解析 kimi 返回的 figures JSON → 每个示意图的参考裁剪（排序+烂框拦截） */
async function collectFigureItems(
  buffer: Buffer,
  content: string,
): Promise<{ ref?: string; svg?: string; box?: number[] }[]> {
  let specs: { mode?: string; box?: number[]; svg?: string }[] = [];
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start > -1 && end > start) {
    const slice = content.slice(start, end + 1);
    let parsed: { figures?: { mode?: string; box?: number[]; svg?: string }[] } | null = null;
    for (const cand of [slice, slice + "]}", slice + "]}"]) {
      try {
        parsed = JSON.parse(cand) as { figures?: { mode?: string; box?: number[]; svg?: string }[] };
        break;
      } catch {
        /* 试下一个 */
      }
    }
    if (parsed && Array.isArray(parsed.figures)) {
      specs = parsed.figures;
      console.log(`[figure] parsed ${specs.length} specs`);
    } else {
      console.warn("[figure] JSON parse failed, len=", slice.length, "head=", slice.slice(0, 120));
    }
  }
  if (!specs.length) {
    const re = /\[(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s]+(\d+)\]/g;
    let m: RegExpExecArray | null = null;
    while ((m = re.exec(content)) !== null && specs.length < 12) {
      specs.push({ mode: "crop", box: [+m[1], +m[2], +m[3], +m[4]] });
    }
  }

  const meta = await sharp(buffer).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;

  const items: { ref?: string; svg?: string; box?: number[] }[] = [];

  const invalidN = specs.filter((sp) => !(Array.isArray(sp.box) && sp.box.length === 4 && sp.box.every((v) => Number.isFinite(v))) && sp.mode !== "svg").length;
  if (invalidN > 0) console.warn(`[figure] ${invalidN} 个 spec 缺少合法 box`);
  const boxed = specs
    .filter((sp) => Array.isArray(sp.box) && sp.box.length === 4 && sp.box.every((v) => Number.isFinite(v)))
    .map((sp) => ({ ...sp, box: sp.box!.map(Number) }))
    .filter((sp) => {
      const [x1, y1, x2, y2] = sp.box!;
      const w = ((x2 - x1) / 1000) * W;
      const h = ((y2 - y1) / 1000) * H;
      if (w < 20 || h < 20) { console.warn(`[figure] box too small rejected: ${sp.box}`); return false; }
      if ((x2 - x1) * (y2 - y1) > 700 * 700) { console.warn(`[figure] box too large rejected: ${sp.box}`); return false; }
      return true;
    })
    .sort((a, b) => (a.box![1] - b.box![1]) || (a.box![0] - b.box![0]))
    .slice(0, 12);

  for (const sp of boxed) {
    try {
      const [x1, y1, x2, y2] = sp.box!;
      const left = Math.max(0, Math.round((x1 / 1000) * W));
      const top = Math.max(0, Math.round((y1 / 1000) * H));
      const width = Math.min(W, Math.round((x2 / 1000) * W)) - left;
      const height = Math.min(H, Math.round((y2 / 1000) * H)) - top;
      if (width < 20 || height < 20) { console.warn(`[figure] 贴边裁剪过小被丢弃: box=${sp.box} → ${width}x${height}`); continue; }
      let pipe = sharp(buffer).extract({ left, top, width, height });
      try {
        pipe = pipe.trim();
      } catch {
        /* trim 失败就用原裁剪 */
      }
      const cropped = await pipe.png().toBuffer();
      items.push({ ref: `data:image/png;base64,${cropped.toString("base64")}`, box: sp.box });
    } catch (e) {
      console.warn("[figure] crop failed:", e);
    }
  }

  let svgBad = 0;
  for (const sp of specs) {
    if (sp.mode === "svg" && sp.svg && sp.svg.trim().startsWith("<svg") && sp.svg.trim().endsWith("</svg>")) {
      const svg = sp.svg.replace(/<script[\s\S]*?<\/script>/gi, "");
      items.push({ svg });
    } else if (sp.mode === "svg") {
      svgBad++;
    }
  }
  if (svgBad > 0) console.warn(`[figure] ${svgBad} 个 svg spec 不合格被跳过（截断或格式错）`);
  return items;
}

interface OcrJob {
  status: "processing" | "done" | "error";
  stage: string;
  content?: unknown;
  error?: string;
  warnings?: string[];
  progress?: number;
  createdAt: number;
}

const g = globalThis as unknown as { __ocrJobs?: Map<string, OcrJob> };
const jobs = g.__ocrJobs ?? new Map<string, OcrJob>();
g.__ocrJobs = jobs;

/** 异步识别：立即返回 jobId，客户端轮询（规避 Cloudflare 100s 超时） */
export async function POST(request: NextRequest) {
  try {
    const file = (await request.formData()).get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请上传一张图片" }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "图片不能超过 15MB" }, { status: 400 });
    }
    // 清理 30 分钟前的旧任务
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, j] of jobs) {
      if (j.createdAt < cutoff) jobs.delete(id);
    }
    const jobId = crypto.randomUUID();
    const job: OcrJob = { status: "processing", stage: "排队中", progress: 0, createdAt: Date.now() };
    jobs.set(jobId, job);
    runOcrJob(job, file).catch(() => {});
    return NextResponse.json({ data: { jobId } });
  } catch (e) {
    console.error("POST /api/ocr-image error:", e);
    return NextResponse.json({ error: "创建识别任务失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "缺少 jobId" }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "任务不存在或已过期（服务可能重启过），请重新上传" },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { status: job.status, stage: job.stage, progress: job.progress, error: job.error, warnings: job.warnings, content: job.content } });
}

async function runOcrJob(job: OcrJob, file: File) {
  try {
    job.stage = "准备图片";
    job.progress = 3;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = file.type || "image/png";
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

    // 1) 主识别（Kimi k3）+ 插图处理（同为 kimi）并行；识别失败自动重试一次
    job.stage = "识别文字与示意图（全程约 1~3 分钟）";
    job.progress = 8;
    const gridDataUrl = await withGrid(buffer);
    const figurePromise = callKimiFigure(gridDataUrl).catch(() => "");
    let normalized: ReturnType<typeof normalize> | null = null;
    for (let attempt = 0; attempt < 2 && !normalized; attempt++) {
      try {
        const ocrContent = await callKimi(
          [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: dataUrl } },
                { type: "text", text: "请识别这张图片中的全部题目内容，按规则输出 JSON。" },
              ],
            },
          ],
          8000,
        );
        if (!ocrContent.trim()) throw new Error("EMPTY");
        normalized = normalize(extractJson(ocrContent));
      } catch (e) {
        console.warn(
          `OCR attempt ${attempt + 1} failed:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }
    if (!normalized) {
      throw new Error("识别失败，模型输出异常，请稍后重试");
    }
    job.stage = "处理示意图";
    job.progress = 40;
    const groundContent = await figurePromise;

    // 2) 示意图定位 + 裁剪，嵌入【图】占位处
    //    兜底：模型没输出占位符、但题干提到"如图/图所示"时，同样尝试定位插图
    const hasFigurePlaceholder = normalized.paragraphs.some((p) =>
      p.runs?.some((r) => r.text?.includes("【图")),
    );
    const allText = normalized.paragraphs
      .map((p) => (p.runs || []).map((r) => r.text || "").join(""))
      .join("");
    const mentionsFigure =
      /如{1,2}图|见图|图\s*[\d\-—]*\s*所示|下图|上图/.test(allText);
    if ((hasFigurePlaceholder || mentionsFigure) && !groundContent && hasFigurePlaceholder) {
      const pc = normalized.paragraphs.reduce(
        (n, p) => n + (p.runs || []).filter((r) => (r.text || "").includes("【图")).length,
        0,
      );
      if (pc > 0) {
        job.warnings = job.warnings || [];
        job.warnings.push(`⚠️ ${pc} 张示意图定位失败（网络或模型波动），可重试一次。`);
      }
    }
    if ((hasFigurePlaceholder || mentionsFigure) && groundContent) {
      try {
        const items = await collectFigureItems(buffer, groundContent);
        const M = items.length;
        // 纯裁剪模式（2026-09-20 起移除 AI 重画：慢、效果一般、费 token）
        // 每张图直接取原图裁剪版；用户可在前端「✏️自己裁剪」微调或「📋粘贴替换」
        const finals: ({ src: string; meta?: { box?: number[]; cropSrc?: string } } | null)[] = items.map((it) =>
          it.ref
            ? { src: it.ref, meta: { ...(it.box ? { box: it.box } : {}), cropSrc: it.ref } }
            : null,
        );
        console.log(`[figure] 共 ${M} 张，裁剪成功 ${finals.filter(Boolean).length} 张`);
        job.stage = "裁剪示意图";
        job.progress = 90;
        const figures = finals.filter(Boolean) as { src: string; meta?: { box?: number[]; cropSrc?: string } }[];
        const droppedCount = M - figures.length;
        if (droppedCount > 0) {
          job.warnings = job.warnings || [];
          job.warnings.push(`⚠️ ${droppedCount} 张示意图无法自动框选，已在对应位置放入原图——点「✏️自己裁剪」补全。`);
        }
        let fi = 0;
        let placedViaPlaceholder = false;
        const placeholderCount = normalized.paragraphs.reduce(
          (n, p) =>
            n + (p.runs || []).filter((r) => (r.text || "").includes("【图")).length,
          0,
        );
        for (const p of normalized.paragraphs) {
          const idx = p.runs?.findIndex((r) => r.text?.includes("【图"));
          if (idx === undefined || idx < 0) continue;
          if (fi < figures.length) {
            // 用图片 run 替换【图N】占位符（导出的 Word 更干净）
            (p.runs as unknown as { type: string; src: string; fig?: object }[]).splice(idx, 1, {
              type: "image",
              src: figures[fi].src,
              ...(figures[fi].meta ? { fig: figures[fi].meta } : {}),
            } as unknown as { type: string; src: string; fig?: object });
            fi++;
            placedViaPlaceholder = true;
          } else {
            // 图不够用：塞入原图作为占位，前端「示意图确认」里可手动裁剪出正确的图
            (p.runs as unknown as { type: string; src: string; fig?: object }[]).splice(idx, 0, {
              type: "image",
              src: dataUrl,
              fig: { cropSrc: dataUrl },
            } as unknown as { type: string; src: string; fig?: object });
          }
        }
        const unplaced = placeholderCount - fi;
        if (unplaced > 0) {
          job.warnings = job.warnings || [];
          job.warnings.push(
            `⚠️ 有 ${unplaced} 张示意图未能自动提取，已在对应位置放入原图——在下方「示意图确认」里点 ✏️自己裁剪 即可补全`,
          );
        }
        // 兜底：占位符没放完的剩余图，按顺序插到最后一张已放图后面；
        // 一张都没放过则插到"如图"那段后面（找不到放第 1 段后）——绝不丢图
        if (figures.length > fi) {
          const rest = figures.slice(fi);
          let insertAt = -1;
          for (let i = normalized.paragraphs.length - 1; i >= 0; i--) {
            const hasImg = (normalized.paragraphs[i].runs || []).some(
              (r) => (r as unknown as { type?: string }).type === "image",
            );
            if (hasImg) { insertAt = i + 1; break; }
          }
          if (insertAt < 0) {
            insertAt = normalized.paragraphs.length > 1 ? 1 : 0;
            for (let i = 0; i < normalized.paragraphs.length; i++) {
              const txt = (normalized.paragraphs[i].runs || [])
                .map((r) => r.text || "")
                .join("");
              if (/如{1,2}图|见图|图\s*[\d\-—]*\s*所示|下图|上图/.test(txt)) {
                insertAt = i + 1;
                break;
              }
            }
          }
          for (const f of rest) {
            normalized.paragraphs.splice(insertAt, 0, {
              runs: [{ type: "image", src: f.src, ...(f.meta ? { fig: f.meta } : {}) } as unknown as OcrRun],
            });
            insertAt++;
          }
          if (!placedViaPlaceholder) {
            job.warnings = job.warnings || [];
            job.warnings.push(`ℹ️ ${rest.length} 张图未匹配到【图】占位符，已自动插入到推测位置，请在预览里确认`);
          }
        }
      } catch (e) {
        console.warn("figure grounding failed (non-fatal):", e);
      }
    }

    job.content = normalized;
    job.progress = 100;
    job.stage = "完成";
    job.status = "done";
  } catch (error) {
    console.error("OCR job error:", error);
    const msg = error instanceof Error ? error.message : "";
    let friendly: string;
    if (msg === "NO_API_KEY") friendly = "服务器未配置 OCR API Key，请联系管理员";
    else if (msg.startsWith("OCR_API_")) friendly = `识别服务返回错误（${msg}），请稍后重试`;
    else if (msg.includes("aborted") || msg.includes("timeout") || msg.includes("Timeout"))
      friendly = "识别服务响应超时，请稍后重试";
    else if (msg.includes("JSON") || msg.includes("paragraphs") || msg.includes("有效内容"))
      friendly = "识别结果解析失败（模型输出异常），请重试一次";
    else friendly = `图片识别失败：${msg || "未知错误"}`;
    job.error = friendly;
    job.status = "error";
  }
}
