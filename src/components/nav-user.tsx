"use client";

import Link from "next/link";
import { useAuth } from "./auth/auth-context";

export function NavUser() {
  const { user, logout } = useAuth();

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/" className="text-gray-600 hover:text-blue-600 transition-colors">
        题库管理
      </Link>
      <Link
        href="/upload"
        className="text-gray-600 hover:text-blue-600 transition-colors"
      >
        上传试卷
      </Link>
      {user && (
        <>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">{user.username}</span>
          <button
            onClick={() => logout()}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            退出
          </button>
        </>
      )}
    </div>
  );
}
