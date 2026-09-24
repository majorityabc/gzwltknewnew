import { NextResponse } from "next/server";

// POST /api/sketch-to-svg { image: dataURL } → { svg }
// 手绘物理示意图 → 规范电子矢量图（glm-4.6v 主力，deepseek-flash 兜底）

const PROMPT = `这是一张手绘的物理示意图（可能是电路图、受力分析图、光路图、运动示意图等）。
请理解图中的物理内容，生成一张规范的 SVG 矢量图。

要求：
1. 白色背景，黑色线条（stroke="#111111"，stroke-width=2）
2. 电路图用中国国标符号：电阻用矩形（不是锯齿），电源用长短线对，开关、灯泡（圆圈内×）、电流表（圆圈内A）、电压表（圆圈内V）、滑动变阻器等；导线横平竖直
3. 受力图：物体用方块或圆，力用带箭头线段，标注力符号（如 F、G、N、f）
4. 图中的文字标注保留（中文、字母、数字、上下标），用 font-family="sans-serif" font-size="18"
5. 必须带 width 和 height 属性（建议 600~900 宽，按内容比例），viewBox 与之一致
6. 线条对齐网格，元件均匀分布，整体比手绘稿规整
7. 只输出 SVG 代码本身：不要 markdown 代码块、不要任何解释文字
8. 不要使用 <script>、<foreignObject>、外部引用
9. 关键：图中所有元件一个都不能丢。特别注意——回路中若出现一长一短两条平行线（无论横竖），那是电池/电源，必须画成标准电池符号（长细线+短粗线对）；手绘再潦草也要按「这是一个完整电路」去理解`;

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

async function genWith(base: string, key: string, model: string, image: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: image } }] },
        ],
        max_tokens: 8000,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[sketch-svg] ${model} HTTP ${res.status}: ${body.slice(0, 160)}`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const svg = extractSvg(data.choices?.[0]?.message?.content || "");
    if (!svg) console.warn(`[sketch-svg] ${model} 输出不含合法 SVG`);
    return svg;
  } catch (e) {
    console.warn(`[sketch-svg] ${model} 异常:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function POST(req: Request) {
  const { image } = await req.json();
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "缺 image（dataURL）" }, { status: 400 });
  }
  // deepseek-flash 先试（SVG 生成更稳），glm-4.6v 兜底
  const dsKey = process.env.DEEPSEEK_API_KEY;
  const dsBase = process.env.DEEPSEEK_OCR_BASE || "https://api.deepseek.com";
  const dsModel = process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash";
  if (dsKey) {
    const svg = await genWith(dsBase, dsKey, dsModel, image);
    if (svg) return NextResponse.json({ data: { svg, via: dsModel } });
  }
  // glm-4.6v 图形理解更准，优先
  const zaiKey = process.env.ZAI_API_KEY;
  const zaiBase = process.env.ZAI_OCR_BASE || "https://api.z.ai/api/coding/paas/v4";
  const zaiModel = process.env.ZAI_OCR_MODEL || "glm-4.6v";
  if (zaiKey) {
    const svg = await genWith(zaiBase, zaiKey, zaiModel, image);
    if (svg) return NextResponse.json({ data: { svg, via: zaiModel } });
  }
  return NextResponse.json({ error: "转换失败，请重试或用原图" }, { status: 502 });
}
