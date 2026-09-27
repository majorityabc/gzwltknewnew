import { NextResponse } from "next/server";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

function ocrLog(msg: string) {
  try {
    const dir = join(process.cwd(), "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "ocr.log"), `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* 日志失败不影响主流程 */ }
}

const PROMPT = `这是一张物理题目的照片/截图。请把题目完整识别成文本，供老师复制到讲义编辑器。
输出规则（严格遵守）：
1. 纯文本输出，一行一个语义块（题干、每个选项各占一行）；
2. 所有公式用 $...$ 包裹的 LaTeX（如 $F=ma$、$v^2-v_0^2=2ax$），行内公式不要换行；
3. 选项格式严格为 "A. 内容"，每个选项单独一行；
4. 题目编号保留（如"12."）；
5. 题中引用的图（电路图/受力图等）无法转成文字，在对应位置输出一行 [图] 占位；
6. 不要输出任何解释、注释、翻译，只输出题目内容本身；
7. 看不清的字按物理语境给最合理猜测。`;

async function ocrWith(base: string, key: string, model: string, image: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0,
        thinking: { type: "disabled" },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      ocrLog(`problem-ocr ${model} HTTP ${res.status}: ${body.slice(0, 160)}`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text || text.length < 3) {
      ocrLog(`problem-ocr ${model} 输出为空`);
      return null;
    }
    return text;
  } catch (e) {
    ocrLog(`problem-ocr ${model} 异常: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** 把 AI 输出的文本（$..$ 行内公式）转成 TipTap 段落数组 */
function textToTiptap(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const blocks = [];
  for (const line of lines) {
    const content: Record<string, unknown>[] = [];
    // 按 $...$ 切分：奇数段是公式
    const parts = line.split(/\$([^$]+)\$/g);
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      if (!seg) continue;
      if (i % 2 === 1) {
        content.push({ type: "inlineMath", attrs: { text: seg.trim() } });
      } else {
        content.push({ type: "text", text: seg });
      }
    }
    if (content.length === 0) content.push({ type: "text", text: line });
    blocks.push({ type: "paragraph", content });
  }
  return blocks;
}

// POST /api/problem-ocr { image: dataURL } → { data: { text, blocks } }
export async function POST(req: Request) {
  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "缺少图片" }, { status: 400 });
    }
    if (image.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "图片太大，请压缩后再试" }, { status: 413 });
    }

    const providers = [
      {
        base: process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com",
        key: process.env.DEEPSEEK_API_KEY || "",
        model: process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash",
      },
      {
        base: process.env.ZAI_OCR_BASE || "https://api.z.ai/api/coding/paas/v4",
        key: process.env.ZAI_API_KEY || "",
        model: process.env.ZAI_OCR_MODEL || "glm-4.6v",
      },
    ].filter((p) => p.key);

    let text: string | null = null;
    let via = "";
    for (const p of providers) {
      text = await ocrWith(p.base, p.key, p.model, image);
      if (text) { via = p.model; break; }
    }
    if (!text) {
      return NextResponse.json({ error: "识别失败，请重试" }, { status: 502 });
    }

    ocrLog(`problem-ocr 成功 via=${via} 输出长度=${text.length}`);
    return NextResponse.json({ data: { text, blocks: textToTiptap(text), via } });
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}
