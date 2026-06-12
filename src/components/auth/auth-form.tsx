"use client";

import { useState } from "react";
import { useAuth } from "./auth-context";

export function AuthForm() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!username || !password) {
      setError("请填写用户名和密码");
      return;
    }
    setSubmitting(true);
    const result =
      mode === "login"
        ? await login(username, password)
        : await register(username, password);
    setSubmitting(false);
    if (result?.error) setError(result.error);
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm">
        <div className="bg-white border rounded-lg shadow-sm p-6">
          <h2 className="text-center text-lg font-semibold text-gray-800 mb-6">
            高中物理题库
          </h2>

          <div className="flex mb-6 border-b">
            <button
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                mode === "login"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              登录
            </button>
            <button
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                mode === "register"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              注册
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
            >
              {submitting
                ? "处理中..."
                : mode === "login"
                  ? "登录"
                  : "注册"}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            {mode === "login" ? "没有账号？" : "已有账号？"}
            <button
              onClick={toggleMode}
              className="text-blue-500 hover:underline ml-1"
            >
              {mode === "login" ? "去注册" : "去登录"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
