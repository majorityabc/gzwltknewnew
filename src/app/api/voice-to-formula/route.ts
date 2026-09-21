import { NextRequest, NextResponse } from "next/server";

/**
 * 语音答案后处理：把口语化的物理答案文本转成规范格式（公式用 $LaTeX$ 包裹）。
 * 用 DeepSeek 文本模型（deepseek-flash），便宜快速。
 * 失败时原样返回原文，绝不丢用户的话。
 */

const SYSTEM_PROMPT = `你是物理答案口语转写器：把语音识别出的口语文本转成规范书面答案，只输出结果本身，不要解释、不要引号、不要"答案是"前缀。

要求：
- 公式用 $...$ LaTeX 包裹（文字描述如"方向水平向左"保持中文原样不包公式）
- 根号→\\sqrt{}，"X的平方"→$X^2$，"A比B"或"B分之A"→$\\frac{A}{B}$，上下标用 ^ 和 _
- 希腊字母：阿尔法/AR/R法/a法→\\alpha，贝塔→\\beta，西塔/seat→\\theta，欧米伽→\\omega，派→\\pi，德尔塔→\\Delta，拉姆达→\\lambda，缪→\\mu
- sin/cos/tan 保持英文放公式内；"sina"→\\sin\\alpha，"cosa"→\\cos\\alpha
- 单位：米每秒→m/s，米每二次方秒→m/s²，牛→N，焦→J（放公式内）
- 数字字母连读按物理量："二gh"→2gh
- 拿不准就保持原文，不要编造`;

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "缺少文本" }, { status: 400 });
    }
    const raw = text.trim().slice(0, 2000);

    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) {
      return NextResponse.json({ text: raw, fallback: true });
    }

    try {
      const base = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
      const model = process.env.DEEPSEEK_TEXT_MODEL || "deepseek-flash";
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: raw },
          ],
          max_tokens: 6000,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        console.warn("[voice-formula] deepseek error:", res.status);
        return NextResponse.json({ text: raw, fallback: true });
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const converted = data.choices?.[0]?.message?.content?.trim();
      if (!converted) {
        console.warn("[voice-formula] empty content（推理烧完 token）");
        return NextResponse.json({ text: raw, fallback: true });
      }
      return NextResponse.json({ text: converted });
    } catch (e) {
      console.warn("[voice-formula] failed:", e instanceof Error ? e.message : e);
      return NextResponse.json({ text: raw, fallback: true });
    }
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}
