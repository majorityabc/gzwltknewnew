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

// POST /api/handwriting-to-formula { image: dataURL } → { latex }
// DeepSeek 视觉识别手写公式，glm-4.6v 兜底
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
              {
                type: "text",
                text: `这是一张手写的物理公式图片。请精确转成 LaTeX。
规则：只输出 LaTeX 代码本身，不要用 $ 包裹，不要任何解释；
上下标用 ^ 和 _（如 F_1、v^2），分数 \\frac{a}{b}，根号 \\sqrt{x}，希腊字母 \\alpha \\theta \\omega \\pi \\Delta 等；
向量写法 \\overrightarrow{AB}；手写连笔要按最合理的物理公式理解；看不清的字符给最合理猜测。`,
              },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        max_tokens: 2500,
        temperature: 0,
        // 关闭思考链：OCR 是直出任务，思考反而经常烧光 token 导致正文为空
        thinking: { type: "disabled" },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      ocrLog(`${model} HTTP ${res.status}: ${body.slice(0, 160)}`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let latex = (data.choices?.[0]?.message?.content || "").trim();
    latex = latex.replace(/^```(?:latex)?\s*/i, "").replace(/```\s*$/, "").trim();
    latex = latex.replace(/^\$+|\$+$/g, "").trim();
    // AI 把它当成"图"而不是公式时会输出 tikz 绘图代码——提示用户换工具
    if (/tikzpicture|documentclass|\\begin\{tikz/.test(latex)) {
      ocrLog(`${model} 输出是绘图代码而非公式（用户可能把图放进了公式识别）`);
      return "@@IS_DRAWING@@";
    }
    if (!latex || latex.length > 600 || /无法|看不清|抱歉/.test(latex)) {
      const reason = (data.choices?.[0]?.message as { reasoning_content?: string } | undefined)?.reasoning_content;
      ocrLog(`${model} 输出无效: ${latex.slice(0, 80) || "(空)"} | finish=${data.choices?.[0] && (data.choices[0] as { finish_reason?: string }).finish_reason} | reasoning长度=${reason?.length ?? 0}`);
      return null;
    }
    return latex;
  } catch (e) {
    ocrLog(`${model} 异常: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function POST(req: Request) {
  const { image } = await req.json();
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "缺 image（dataURL）" }, { status: 400 });
  }
  let sawDrawing = false;
  // 思考型模型偶发"思考完正文空"，每个供应商最多试 2 次
  const tryProvider = async (base: string, key: string, model: string) => {
    for (let i = 0; i < 2; i++) {
      const latex = await ocrWith(base, key, model, image);
      if (latex) return latex;
    }
    return null;
  };
  const dsKey = process.env.DEEPSEEK_API_KEY;
  const dsBase = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
  const dsModel = process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash";
  if (dsKey) {
    const latex = await tryProvider(dsBase, dsKey, dsModel);
    if (latex === "@@IS_DRAWING@@") sawDrawing = true;
    else if (latex) return NextResponse.json({ data: { latex, via: dsModel } });
  }
  const zaiKey = process.env.ZAI_API_KEY;
  const zaiBase = process.env.ZAI_OCR_BASE || "https://api.z.ai/api/coding/paas/v4";
  const zaiModel = process.env.ZAI_OCR_MODEL || "glm-4.6v";
  if (zaiKey) {
    const latex = await tryProvider(zaiBase, zaiKey, zaiModel);
    if (latex === "@@IS_DRAWING@@") sawDrawing = true;
    else if (latex) return NextResponse.json({ data: { latex, via: zaiModel } });
  }
  if (sawDrawing) {
    return NextResponse.json({ error: "这看着像图形不是公式——请用「✨ 转电子图」" }, { status: 422 });
  }
  return NextResponse.json({ error: "识别失败，请重写或重试" }, { status: 502 });
}
