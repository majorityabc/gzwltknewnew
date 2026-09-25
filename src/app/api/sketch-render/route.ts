import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// POST /api/sketch-render
// { image: dataURL, prevJson?: object }
//   无 prevJson：草图 → AI 完整理解(JSON) → 模板渲染 → { image: dataURL, json }
//   有 prevJson：改过的图 + 旧 JSON → AI 只输出差异补丁 → 合并 → 渲染 → { image, json }
// 模型未知/渲染失败时返回 { fallback: true }，前端退回旧直绘方案

const UNDERSTAND_PROMPT = `这是一张中学物理老师手绘的示意图。请理解图中的物理内容，输出结构化 JSON（只输出 JSON，不要任何其他文字）。

{
  "model": "模型类型（目前支持：pendulum_force_decomposition=单摆受力分解；若不属于已知模型，填 unknown）",
  "confidence": 0.0到1.0（你对模型判断的把握），
  "params": {
    "theta_deg": 摆角角度数字（估计值，如 30）,
    "angle_label": "角度标注（默认 θ，照原图）",
    "show_mg": true/false（是否有竖直向下的重力箭头。注意：竖直向下的重力最容易被漏看，请仔细检查）,
    "show_mgcos": true/false（是否有沿绳方向的分力）,
    "show_mgsin": true/false（是否有垂直绳方向的分力）,
    "label_mg": "重力标注（默认 mg，照原图）",
    "label_cos": "沿绳分力标注（默认 mgcosθ，照原图）",
    "label_sin": "垂直绳分力标注（默认 mgsinθ，照原图）",
    "ball_label": "小球标注（没有则省略此字段）"
  }
}

要求：忠实原图，不脑补；params 里只填该模型需要的字段。`;

const PATCH_PROMPT = `这是一张物理示意图的修改稿（底图是程序渲染的规范图，上面有老师用红/黑色笔手补的修改）。
【上一版的理解 JSON】：
__PREV_JSON__

请对比修改稿和上一版 JSON，找出老师改了什么，**只输出需要变更的字段**（JSON patch，保持原有结构，只含变化的字段；没变化的不要输出）。
例如老师加了一个力箭头，就输出 {"params":{"show_xxx":true,"label_xxx":"..."}}；老师改了个标注，就只输出那个 label 字段。
只输出 JSON patch，不要任何其他文字。如果没看出任何修改，输出 {}。`;

async function callGLM(prompt: string, image: string): Promise<string | null> {
  const key = process.env.ZAI_API_KEY;
  const base = process.env.ZAI_OCR_BASE || "https://api.z.ai/api/coding/paas/v4";
  const model = process.env.ZAI_OCR_MODEL || "glm-4.6v";
  if (!key) return null;
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] }],
        max_tokens: 2500,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      console.warn(`[sketch-render] glm HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.warn("[sketch-render] glm 异常:", e instanceof Error ? e.message : e);
    return null;
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" && out[k] !== null) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function render(spec: Record<string, unknown>): Promise<string | null> {
  try {
    const b64 = await new Promise<string>((resolve, reject) => {
      const { spawn } = require("node:child_process") as typeof import("node:child_process");
      const child = spawn("python3", ["scripts/physics_render.py"], { cwd: "/root/gzwltknewnew" });
      let out = "";
      let err = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("render timeout")); }, 60000);
      child.stdout.on("data", (d) => { out += d; });
      child.stderr.on("data", (d) => { err += d; });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(err.slice(0, 300) || `exit ${code}`));
      });
      child.stdin.write(JSON.stringify(spec));
      child.stdin.end();
    });
    const trimmed = b64.trim();
    if (!trimmed || trimmed.startsWith("{")) return null; // 渲染器返回了错误 JSON
    return `data:image/png;base64,${trimmed}`;
  } catch (e) {
    console.warn("[sketch-render] render 异常:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function POST(req: Request) {
  const { image, prevJson } = await req.json();
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "缺 image（dataURL）" }, { status: 400 });
  }

  let spec: Record<string, unknown> | null = null;

  if (prevJson && typeof prevJson === "object") {
    // 补丁模式：AI 只输出差异
    const prompt = PATCH_PROMPT.replace("__PREV_JSON__", JSON.stringify(prevJson));
    const raw = await callGLM(prompt, image);
    const patch = raw ? extractJson(raw) : null;
    if (patch) {
      spec = deepMerge(prevJson as Record<string, unknown>, patch);
      console.warn("[sketch-render] patch:", JSON.stringify(patch).slice(0, 300));
    }
    if (!spec) spec = prevJson as Record<string, unknown>; // 补丁失败则沿用旧 JSON 重渲
  } else {
    const raw = await callGLM(UNDERSTAND_PROMPT, image);
    spec = raw ? extractJson(raw) : null;
  }

  if (!spec || spec.model === "unknown" || !spec.model) {
    return NextResponse.json({ data: { fallback: true } });
  }

  const png = await render(spec);
  if (!png) {
    return NextResponse.json({ data: { fallback: true } });
  }
  return NextResponse.json({ data: { image: png, json: spec } });
}
