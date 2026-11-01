import { NextResponse } from "next/server";
import crypto from "node:crypto";

// POST /api/sketch-to-svg { image: dataURL } → { jobId }；GET ?jobId= → { status, svg? }
// 手绘物理示意图 → 规范电子矢量图（只用 deepseek-flash，V4.1-Flash-1017）
// 2026-11-01 改版：两轮对话复刻 DeepSeek 桌面版工作流（先理解图像→再基于理解画图），
// 质量显著优于单轮直接逼模型出 SVG。两轮可能超过 Cloudflare 100s 代理超时 → 改 job 轮询。

const ANALYZE_PROMPT = `这是一张手绘的物理示意图（可能是电路图、受力分析图、光路图、运动示意图等）。
第一步：请仔细观察并详细描述这张图——
1. 图的类型（电路图/受力图/光路图/运动图……）
2. 每个元件/物体/符号是什么，分别在画面什么位置（上下左右、相对关系）
3. 所有文字标注（中文、字母、数字、上下标），分别对应哪个元件
4. 连线/箭头怎么走；如果是电路，闭合回路的绕行顺序
只输出描述，不要画 SVG。`;

const SVG_PROMPT = `第二步：根据你的描述，把这张手绘图重画成规范的 SVG 电子图。
要求：
1. 白色背景，黑色线条（stroke="#111111"，stroke-width=2）
2. 电路图用中国国标符号：电阻用矩形（不是锯齿），电源用长短线对，开关、灯泡（圆圈内×）、电流表（圆圈内A）、电压表（圆圈内V）、滑动变阻器等；导线横平竖直
3. 受力图：物体用方块或圆，力用带箭头线段，标注力符号（如 F、G、N、f）
4. 所有文字标注保留（中文、字母、数字、上下标），font-family="sans-serif" font-size="18"
5. 必须带 width 和 height 属性（建议 600~900 宽，按内容比例），viewBox 与之一致
6. 线条对齐网格，元件均匀分布，整体比手绘稿规整
7. 只输出 SVG 代码本身：不要 markdown 代码块、不要解释文字；不要使用 <script>、<foreignObject>、外部引用
8. 你第一步描述到的元件一个都不能丢；一长一短两条平行线（无论横竖）是电池/电源，画成标准电池符号（长细线+短粗线对）
9. 输出紧凑：不要空行、不要注释。`;

function extractSvg(text: string): string | null {
  const t = text.replace(/^```(?:svg|xml)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = t.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return null;
  let svg = m[0];
  // 基本消毒：去脚本/事件
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "").replace(/\son\w+='[^']*'/gi, "");
  if (!/<svg[^>]*(width|viewBox)/i.test(svg)) return null;
  if (svg.length > 60000) return null;
  return svg;
}

interface Msg { role: string; content: unknown }

async function chat(base: string, key: string, model: string, messages: Msg[], maxTokens: number): Promise<string | null> {
  // 思考型模型：max_tokens 要同时容纳思考+正文，给足
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),  // temperature 用模型默认（对齐桌面版表现）
    signal: AbortSignal.timeout(150000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[sketch-svg] ${model} HTTP ${res.status}: ${body.slice(0, 160)}`);
    return null;
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const ch = data.choices?.[0];
  if (ch?.finish_reason === "length") console.warn(`[sketch-svg] ${model} 输出被截断（finish=length）`);
  return ch?.message?.content || null;
}

/** 两轮对话：先理解后画图（复刻桌面版"识别很准→再生成"的链路）。返回 svg + 完整对话（微调轮要续上） */
async function genTwoTurn(base: string, key: string, model: string, image: string, context: string): Promise<{ svg: string; messages: Msg[] } | null> {
  // 轮1：理解图像
  const analysis = await chat(base, key, model, [
    { role: "user", content: [{ type: "text", text: ANALYZE_PROMPT }, { type: "image_url", image_url: { url: image } }] },
  ], 8192).catch((e) => { console.warn(`[sketch-svg] 轮1异常:`, e instanceof Error ? e.message : e); return null; });
  if (!analysis) { console.warn("[sketch-svg] 轮1（图像理解）失败"); return null; }
  console.log(`[sketch-svg] 轮1理解完成（${analysis.length}字符）`);

  // 轮2：基于理解画 SVG（讲义上下文在这轮给，帮助选材/聚焦）
  const svgPrompt = context
    ? `${SVG_PROMPT}\n\n【讲义上下文】用户正在编辑的讲义内容如下，画图主题很可能与之相关，请参考：\n${context}`
    : SVG_PROMPT;
  const msgs: Msg[] = [
    { role: "user", content: [{ type: "text", text: ANALYZE_PROMPT }, { type: "image_url", image_url: { url: image } }] },
    { role: "assistant", content: analysis },
    { role: "user", content: svgPrompt },
  ];
  const out = await chat(base, key, model, msgs, 16384).catch((e) => { console.warn(`[sketch-svg] 轮2异常:`, e instanceof Error ? e.message : e); return null; });
  if (!out) { console.warn("[sketch-svg] 轮2（生成SVG）失败"); return null; }
  const svg = extractSvg(out);
  if (!svg) { console.warn(`[sketch-svg] 轮2输出不含合法 SVG（${out.length}字符）`); return null; }
  msgs.push({ role: "assistant", content: out });
  return { svg, messages: msgs };
}

// ---- job 化（两轮可能 >100s，绕 Cloudflare 代理超时）----
type Job = { status: "processing" | "done" | "error"; svg?: string; error?: string; via?: string; createdAt: number; messages?: Msg[] };
const jobs = new Map<string, Job>();
setInterval(() => {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.createdAt > 30 * 60 * 1000) jobs.delete(id);
}, 5 * 60 * 1000).unref();

async function runJob(jobId: string, image: string, context: string) {
  const job = jobs.get(jobId)!;
  const dsKey = process.env.DEEPSEEK_API_KEY;
  const dsBase = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
  const dsModel = process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash";
  if (!dsKey) { job.status = "error"; job.error = "未配置 DEEPSEEK_API_KEY"; return; }
  const r = await genTwoTurn(dsBase, dsKey, dsModel, image, context).catch(() => null);
  if (r) { job.status = "done"; job.svg = r.svg; job.messages = r.messages; job.via = `${dsModel}-twoTurn`; }
  else { job.status = "error"; job.error = "转换失败，请重试或用原图"; }
}

/** 微调轮：在既有对话（原图+分析+SVG）上追加用户意见，重画 */
async function runRefineJob(jobId: string, baseMessages: Msg[], feedback: string) {
  const job = jobs.get(jobId)!;
  const dsKey = process.env.DEEPSEEK_API_KEY;
  const dsBase = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
  const dsModel = process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash";
  if (!dsKey) { job.status = "error"; job.error = "未配置 DEEPSEEK_API_KEY"; return; }
  const msgs: Msg[] = [
    ...baseMessages,
    { role: "user", content: `修改要求：${feedback}
请按此修改（其余保持不变），直接输出修改后的完整 SVG（格式要求同前）。` },
  ];
  const out = await chat(dsBase, dsKey, dsModel, msgs, 16384).catch((e) => { console.warn(`[sketch-svg] 微调异常:`, e instanceof Error ? e.message : e); return null; });
  const svg = out ? extractSvg(out) : null;
  if (svg) {
    msgs.push({ role: "assistant", content: out! });
    job.status = "done"; job.svg = svg; job.messages = msgs; job.via = `${dsModel}-refine`;
  } else {
    job.status = "error"; job.error = "修改失败，请重试";
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  // 微调模式：{ jobId: 上一次任务的 id, feedback: "修改意见" }
  if (body.feedback && body.jobId) {
    const base = jobs.get(String(body.jobId));
    if (!base || base.status !== "done" || !base.messages) {
      return NextResponse.json({ error: "原任务不存在或已过期，请重新「转电子图」" }, { status: 404 });
    }
    const jobId = crypto.randomUUID();
    jobs.set(jobId, { status: "processing", createdAt: Date.now() });
    void runRefineJob(jobId, base.messages, String(body.feedback).slice(0, 300));
    return NextResponse.json({ data: { jobId } });
  }
  const { image, docId } = body;
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "缺 image（dataURL）" }, { status: 400 });
  }
  // 拉讲义正文做上下文（去 HTML 标签截 600 字，帮模型猜主题）
  let context = "";
  if (docId) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const lec = await prisma.lecture.findUnique({ where: { id: Number(docId) }, select: { title: true, content: true } });
      if (lec) {
        const text = lec.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        context = `标题「${lec.title}」。正文摘录：${text.slice(0, 600)}`;
      }
    } catch { /* 拉不到不阻塞 */ }
  }
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: "processing", createdAt: Date.now() });
  void runJob(jobId, image, context);
  return NextResponse.json({ data: { jobId } });
}

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "缺少 jobId" }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "job 不存在或已过期" }, { status: 404 });
  if (job.status === "processing") return NextResponse.json({ data: { status: "processing" } });
  if (job.status === "error") return NextResponse.json({ error: job.error || "转换失败" }, { status: 502 });
  return NextResponse.json({ data: { status: "done", svg: job.svg, via: job.via } });
}
