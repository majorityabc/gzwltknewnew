import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync } from "fs";

const execFileP = promisify(execFile);

/** Kimi Code OAuth token（15 分钟过期，过期时用 kimi CLI 代刷） */
function readKimiCreds(): { access_token: string; expires_at?: number } {
  const file = process.env.KIMI_CRED_FILE || "/root/.kimi-code/credentials/kimi-code.json";
  return JSON.parse(readFileSync(file, "utf8"));
}

async function getKimiToken(force = false): Promise<string> {
  const creds = readKimiCreds();
  const fresh = creds.expires_at && creds.expires_at - Date.now() / 1000 > 120;
  if (fresh && !force) return creds.access_token;
  try {
    await execFileP(process.env.KIMI_CLI || "/root/.kimi-code/bin/kimi", ["-p", "hi"], { timeout: 150000 });
  } catch (e) {
    console.warn("kimi CLI refresh failed:", e);
  }
  return readKimiCreds().access_token;
}

/** 调 Kimi k3（支持图片输入），401 时强制刷新 token 重试一次 */
async function callKimi(messages: unknown[], maxTokens: number): Promise<string> {
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
  if (res.status === 401) res = await doFetch(await getKimiToken(true));
  if (!res.ok) throw new Error(`Kimi ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || "";
  if (!content.trim()) throw new Error("Kimi 返回空内容");
  return content;
}

// 学生问题 · AI 回答：老师给思路提示，AI 按提示写答案
// 有截图 → glm-4.6v（能读图）；纯文字 → deepseek-chat（快）

const SYSTEM = `你是高中物理老师「动量」的助教。根据【学生的问题】和【老师的解题思路提示】，写一份给学生看的讲解答案。

要求：
1. 全程中文，口吻是老师在给学生讲题；
2. 所有数学/物理公式一律用 $...$ 包裹的 LaTeX（行内），例如 $F=\\mu N$；
3. 结构清晰：先点破关键误区，再按思路分步讲，最后一句总结；
4. 短句、分点，适合课堂投影讲解；
5. 不要客套话、不要"希望对你有帮助"之类的结尾。`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const qid = Number(id);
    if (!Number.isFinite(qid)) return NextResponse.json({ error: "参数错误" }, { status: 400 });

    const body = await request.json();
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) return NextResponse.json({ error: "请填写思路提示词" }, { status: 400 });

    const q = await prisma.studentQuestion.findUnique({
      where: { id: qid },
      include: {
        images: { include: { image: true }, orderBy: { sortOrder: "asc" } },
        chapter: { select: { title: true } },
        lesson: { select: { title: true } },
      },
    });
    if (!q) return NextResponse.json({ error: "问题不存在" }, { status: 404 });

    const ctx = [
      q.chapter ? `【章节】${q.chapter.title}${q.lesson ? " / " + q.lesson.title : ""}` : "",
      q.content ? `【学生的问题】\n${q.content}` : "【学生的问题】（见截图）",
      `【老师的思路提示】\n${prompt}`,
    ].filter(Boolean).join("\n\n");

    // Kimi k3 主力（支持读图）；失败自动降级 DeepSeek
    const userContent: unknown = q.images.length > 0
      ? [
          { type: "text", text: ctx },
          ...q.images.slice(0, 4).map((im) => ({
            type: "image_url",
            image_url: { url: `data:${im.image.mimeType};base64,${im.image.data}` },
          })),
        ]
      : ctx;
    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: userContent },
    ];

    let answer = "";
    let via = "";
    try {
      answer = await callKimi(messages, 4096);
      via = "kimi-k3";
    } catch (e) {
      console.warn("ai-answer Kimi 失败，降级 DeepSeek:", e instanceof Error ? e.message : e);
      const key = process.env.DEEPSEEK_API_KEY || "";
      if (!key) throw e;
      const base = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
      const model = process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash";
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: 0.4 }),
        signal: AbortSignal.timeout(90000),
      });
      if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      answer = j.choices?.[0]?.message?.content || "";
      via = model;
    }

    if (!answer) return NextResponse.json({ error: "AI 没有返回内容，请重试" }, { status: 502 });
    return NextResponse.json({ data: { answer, via } });
  } catch (error) {
    console.error("POST ai-answer error:", error);
    const msg = error instanceof Error ? error.message : "AI 调用失败";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
