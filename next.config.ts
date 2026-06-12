import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["docx", "@hungknguyen/docx-math-converter"],
};

export default nextConfig;
