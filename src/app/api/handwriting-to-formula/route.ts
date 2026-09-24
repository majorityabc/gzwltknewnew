import { NextResponse } from "next/server";

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
        max_tokens: 800,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[hw-formula] ${model} HTTP ${res.status}: ${body.slice(0, 160)}`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let latex = (data.choices?.[0]?.message?.content || "").trim();
    latex = latex.replace(/^```(?:latex)?\s*/i, "").replace(/```\s*$/, "").trim();
    latex = latex.replace(/^\$+|\$+$/g, "").trim();
    if (!latex || latex.length > 600 || /无法|看不清|抱歉/.test(latex)) return null;
    return latex;
  } catch (e) {
    console.warn(`[hw-formula] ${model} 异常:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function POST(req: Request) {
  const { image } = await req.json();
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "缺 image（dataURL）" }, { status: 400 });
  }
  const dsKey = process.env.DEEPSEEK_API_KEY;
  const dsBase = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
  const dsModel = process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash";
  if (dsKey) {
    const latex = await ocrWith(dsBase, dsKey, dsModel, image);
    if (latex) return NextResponse.json({ data: { latex, via: dsModel } });
  }
  const zaiKey = process.env.ZAI_API_KEY;
  const zaiBase = process.env.ZAI_OCR_BASE || "https://api.z.ai/api/coding/paas/v4";
  const zaiModel = process.env.ZAI_OCR_MODEL || "glm-4.6v";
  if (zaiKey) {
    const latex = await ocrWith(zaiBase, zaiKey, zaiModel, image);
    if (latex) return NextResponse.json({ data: { latex, via: zaiModel } });
  }
  return NextResponse.json({ error: "识别失败，请重写或重试" }, { status: 502 });
}
