"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const RichTextEditor = dynamic(
  () => import("@/components/tiptap/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="border rounded-lg bg-white p-4 min-h-[200px] flex items-center justify-center">
        <p className="text-gray-400">编辑器加载中...</p>
      </div>
    ),
  },
);

const sampleContent = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "测试题目：匀变速直线运动" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "一辆汽车以初速度 v" },
        { type: "text", text: "0", marks: [{ type: "subscript" }] },
        { type: "text", text: " = 10 m/s 做匀加速直线运动，加速度为 a = 2 m/s" },
        { type: "text", text: "2", marks: [{ type: "superscript" }] },
        { type: "text", text: "。求 5s 末的速度。" },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "参考公式：", marks: [{ type: "bold" }] },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "inlineMath", attrs: { text: "v = v_0 + at" } },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "inlineMath", attrs: { text: "x = v_0t + \\frac{1}{2}at^2" } },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "测试题目：牛顿第二定律" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "质量 m = 2 kg 的物体，在水平恒力 F = 10 N 作用下，从静止开始运动。求加速度。" },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "参考公式：", marks: [{ type: "bold" }] },
        { type: "inlineMath", attrs: { text: "F = ma" } },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "测试题目：含希腊字母" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "倾角为 θ = 30° 的斜面上，动摩擦因数 μ = 0.2，重力加速度 g = 10 m/s" },
        { type: "text", text: "2", marks: [{ type: "superscript" }] },
        { type: "text", text: "。" },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "italic" }],
          text: "下方空白区域可粘贴 Word 中的物理题目",
        },
      ],
    },
    {
      type: "paragraph",
      content: [],
    },
  ],
});

export function TestPage() {
  const [htmlOutput, setHtmlOutput] = useState("");

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800">
            高中物理题目收集分类系统
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            测试页 — 验证公式、上下标、希腊字母的显示
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-700">
            题目编辑器
          </h2>
          <RichTextEditor
            content={sampleContent}
            onChange={(html) => setHtmlOutput(html)}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-700">
            渲染预览
          </h2>
          <div
            className="border rounded-lg bg-white p-4 min-h-[100px] tiptap-editor"
            dangerouslySetInnerHTML={{ __html: htmlOutput }}
          />
        </section>

        <section className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-3 text-gray-700">
            使用说明
          </h2>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">
            <li>
              <strong>公式输入：</strong>点击工具栏 f 按钮，输入 LaTeX 公式
            </li>
            <li>
              <strong>上下标：</strong>工具栏有 x<sup>2</sup> 和 x<sub>0</sub> 按钮
            </li>
            <li>
              <strong>希腊字母：</strong>工具栏底部有常用希腊字母按钮
            </li>
            <li>
              <strong>编辑公式：</strong>双击公式可修改 LaTeX 源码
            </li>
            <li>
              <strong>粘贴 Word：</strong>直接 Ctrl+V 粘贴
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
