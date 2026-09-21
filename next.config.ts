import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/tiku",
  transpilePackages: ["docx", "@hungknguyen/docx-math-converter"],
};

export default nextConfig;
