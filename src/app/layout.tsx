import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/auth-context";
import { NavUser } from "@/components/nav-user";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "高中物理题目收集分类系统",
  description: "收集、分类和管理高中物理题目，支持公式渲染和Word导出",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <nav className="bg-white border-b shadow-sm flex-shrink-0">
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
              <Link href="/" className="text-lg font-bold text-gray-800 hover:text-blue-600 transition-colors">
                高中物理题库
              </Link>
              <div className="flex items-center gap-6 text-sm">
                <NavUser />
              </div>
            </div>
          </nav>
          <div className="flex-1">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
