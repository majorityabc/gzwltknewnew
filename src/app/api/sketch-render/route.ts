import { NextResponse } from "next/server";

// POST /api/sketch-render
// 模板识别管线（AI理解→JSON→模板渲染）已于 2026-09-26 按用户要求下线：
// 误判率高，画图经常被错误套进模板。保留此路由仅返回 fallback，
// 前端统一走 /api/sketch-to-svg（AI 直绘）。原实现见 git 历史。
export async function POST() {
  return NextResponse.json({ data: { fallback: true, retired: true } });
}
