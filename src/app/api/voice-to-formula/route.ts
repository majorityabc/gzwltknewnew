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

const LECTURE_PROMPT = `你是物理讲义听写整理器：把老师口述的语音转写文本整理成规范的讲义正文，只输出整理后的正文本身，不要解释、不要引号。

要求：
- 结合【讲义上下文】统一术语和符号：讲义里已有的变量写法（如用 v 不用 u）、章节主题，都作为判断依据
- 同音字按上下文物理术语纠正：如"电视差"→电势差、"电视"→电势、"工"→功/功率（视语境）、"f"→$F$（力）等
- 物理公式用 $...$ LaTeX 包裹：根号→\\sqrt{}，"X的平方"→$X^2$，"B分之A"→$\\frac{A}{B}$，上下标用 ^ 和 _
- 希腊字母：阿尔法→\\alpha，西塔→\\theta，欧米伽→\\omega，派→\\pi，德尔塔→\\Delta，拉姆达→\\lambda，缪→\\mu，伊普西龙→\\varepsilon
- 单位：米每秒→m/s，米每二次方秒→m/s²，牛→N，焦→J，库仑→C，伏→V（放公式内）
- 口语连接词（"然后呢""就是说""啊""嗯"）删掉；明显的口误自我纠正（"不对不对，是…"）以纠正后的为准
- 老师用"换行/下一行/另起一段"明确表示分段时才分段，其余保持连续段落
- 拿不准就保持原文，不要编造没有的内容`;

export async function POST(request: NextRequest) {
  try {
    const { text, mode, context } = await request.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "缺少文本" }, { status: 400 });
    }
    const raw = text.trim().slice(0, 2000);
    const ctx = typeof context === "string" ? context.trim().slice(0, 1200) : "";
    const isLecture = mode === "lecture";

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
            { role: "system", content: isLecture ? LECTURE_PROMPT : SYSTEM_PROMPT },
            {
              role: "user",
              content: isLecture && ctx
                ? `【讲义上下文】\n${ctx}\n\n【老师口述】\n${raw}`
                : raw,
            },
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
