"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AuthErrorInner() {
  const params = useSearchParams();
  const msg = params.get("msg");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-2xl font-bold text-gray-800">登录失败</h1>
      <p className="text-gray-600">认证过程中出现了问题，请重试。</p>
      {msg && (
        <pre className="text-xs text-red-600 bg-red-50 p-3 rounded max-w-lg overflow-auto">
          {msg}
        </pre>
      )}
      <Link href="/" className="text-blue-600 hover:underline">
        返回首页
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AuthErrorInner />
    </Suspense>
  );
}
