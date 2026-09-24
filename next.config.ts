import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/tiku",
  // 这些包必须保持 Node 原生 require：mathjax 动态加载会被打包破坏；
  // docx 和转换器必须同一个模块实例（否则 Packer instanceof 检查失败，公式被静默丢弃）
  serverExternalPackages: ["mathjax", "docx", "@hungknguyen/docx-math-converter"],
};

export default nextConfig;
