import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-2xl font-bold text-gray-800">登录失败</h1>
      <p className="text-gray-600">认证过程中出现了问题，请重试。</p>
      <Link href="/" className="text-blue-600 hover:underline">
        返回首页
      </Link>
    </div>
  );
}
