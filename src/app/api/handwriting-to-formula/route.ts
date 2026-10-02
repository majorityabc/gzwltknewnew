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
向量写法 \\overrightarrow{AB}；手写连笔要按最合理的物理公式理解；看不清的字符给最合理猜测。
变量偏好：手写的单字母变量（尤其是 x/X）在物理公式里几乎都是小写斜体变量，除非你明确看出是大写字母（明显更大、带大写特征），否则 x 一律输出小写 x。
特别注意：手写的圆圈数字序号（圈1、圈2…，即 ①②③④⑤⑥⑦⑧⑨⑩）必须识别并输出为 \\text{①} 这种形式（\\text{} 里放对应 Unicode 圈号字符），不要忽略、不要写成普通数字。

【θ 与圈号的区分——极其重要，别再认错】
- θ（theta，希腊字母，物理里表示角度）：一个圆圈/椭圆，中间一根【横向】短线，或竖线上下穿出圆圈。输出 \\theta。
- ①（圈号序号）：一个规整的圆，里面是一个完整的数字 1（竖线+底座），且通常出现在公式末尾或独立作为编号。输出 \\text{①}。
- 判断依据优先级：中间笔画是横的 → \\theta；里面是完整数字且位置像编号 → \\text{①}；在公式中间当变量用 → 几乎一定是 \\theta。
- 物理公式里 θ 出现频率远高于圈号，不确定时优先猜 \\theta。

【q 与 θ 与圈号的区分——三者都是"圈加一笔"，极易混淆】
- q（字母，电荷量常用）：圆圈 + 一根从圆圈右下【向下穿出】的竖尾巴（尾巴在圈外）。
- θ：圆圈【内部】一根横线，竖线不穿出去或上下对称穿出。
- ①：规整圆 + 内部完整数字 1，通常独立出现在式子末尾做编号。
- 判断要点：竖笔向下拖出圆圈 → q；横线在圈内 → \\theta；内部是数字且做编号 → \\text{①}。
- 电荷量语境（与 Q、C、U、E 等电学符号一起出现）优先猜 q。

【撇号（prime，′）——极其容易丢，必须主动找】
- 物理手写里字母右上角的一小撇（像 v'、f'(x)、x'、t'）表示导数或"变换后的量"，非常高频。
- 它长得就像字母右上方的一个短斜线/小点，很容易被当成墨迹飞白忽略。
- 规则：只要字母右上区域有任何短斜笔/小点痕迹，且擦掉它公式在物理上不完整（比如运动学里 v 和 v' 成对出现、受力分析里 F 和 F' 成对出现），就必须输出撇号。
- 写法：直接写字母加单引号，如 v'、f'(x)、x'；双撇写 v''。
- 反向规则：如果两个相邻字母符号形状几乎一样、只是一个多了个小标记，那个标记几乎一定是撇号（成对出现的 v/v'、x/x' 是物理标配），不要识别成同一个字母写两遍。`,
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
