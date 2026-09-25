#!/usr/bin/env node
// latex2png.mjs <latex> → stdout 输出 base64 PNG（公式渲染为图片，供 PDF 导出用）
const latex = process.argv[2];
if (!latex) process.exit(1);
const mathjax = await import("mathjax");
const MathJax = await mathjax.init({ loader: { load: ["input/tex", "output/svg"] } });
const node = MathJax.tex2svg(latex, { display: false });
const svgText = MathJax.startup.adaptor.outerHTML(node);
const m = svgText.match(/<svg[\s\S]*<\/svg>/);
if (!m) process.exit(1);
const sharp = (await import("sharp")).default;
// 3x 分辨率渲染，白底压平（SVG 是透明底黑字，直接嵌 PDF 会看不清）
const png = await sharp(Buffer.from(m[0]), { density: 300 })
  .flatten({ background: "#ffffff" })
  .png()
  .toBuffer();
process.stdout.write(png.toString("base64"));
