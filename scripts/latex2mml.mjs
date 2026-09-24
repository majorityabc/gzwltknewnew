#!/usr/bin/env node
// latex2mml.mjs <latex> → stdout 输出 MathML（子进程运行，绕开 Next 打包对 mathjax 的破坏）
const latex = process.argv[2];
if (!latex) { process.exit(1); }
const mathjax = await import("mathjax");
const MathJax = await mathjax.init({ loader: { load: ["input/tex"] } });
process.stdout.write(MathJax.tex2mml(latex));
