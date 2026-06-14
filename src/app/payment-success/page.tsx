"use client";

import Link from "next/link";

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f6f8fb] to-white flex items-center justify-center">
      <div className="text-center px-6 max-w-lg">
        {/* Crown icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-3xl shadow-lg">
          👑
        </div>

        <h1 className="text-3xl font-extrabold text-[#1a1a2e] mb-3 tracking-tight">
          尊敬的 VIP 客户
        </h1>
        <p className="text-lg text-gray-600 mb-2">
          欢迎你使用高中物理题库
        </p>
        <p className="text-sm text-gray-400 mb-10">
          你的订阅已生效，所有 Pro 功能已解锁
        </p>

        <Link
          href="/"
          className="inline-block px-10 py-3.5 text-base font-semibold bg-gradient-to-r from-blue-500 to-blue-400 text-white rounded-2xl hover:from-blue-600 hover:to-blue-500 transition-all shadow-md hover:shadow-lg"
        >
          开始使用
        </Link>
      </div>
    </div>
  );
}
