"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";

interface Plan {
  key: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: { text: string; included: boolean }[];
  highlighted?: boolean;
  badge?: string;
  cta: string;
}

const plans: Plan[] = [
  {
    key: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "适合个人教师体验使用",
    features: [
      { text: "最多 50 道题目", included: true },
      { text: "基础富文本编辑器", included: true },
      { text: "章节 & 知识点标签", included: true },
      { text: "难度 & 题型分类", included: true },
      { text: "Excel 批量导入", included: true },
      { text: "Word 文档导出", included: false },
      { text: "自定义标签", included: false },
      { text: "图片上传 (最大 2MB)", included: false },
      { text: "优先技术支持", included: false },
    ],
    cta: "免费开始",
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPrice: 14,
    yearlyPrice: 120,
    description: "适合专业教师日常使用",
    highlighted: true,
    badge: "最受欢迎",
    features: [
      { text: "无限题目数量", included: true },
      { text: "完整富文本编辑器", included: true },
      { text: "章节 & 知识点标签", included: true },
      { text: "难度 & 题型分类", included: true },
      { text: "Excel 批量导入", included: true },
      { text: "Word 文档导出", included: true },
      { text: "自定义标签", included: true },
      { text: "图片上传 (最大 10MB)", included: true },
      { text: "优先技术支持", included: false },
    ],
    cta: "立即订阅",
  },
  {
    key: "team",
    name: "Team",
    monthlyPrice: 29,
    yearlyPrice: 290,
    description: "适合教研组或学校团队",
    features: [
      { text: "无限题目数量", included: true },
      { text: "完整富文本编辑器", included: true },
      { text: "章节 & 知识点标签", included: true },
      { text: "难度 & 题型分类", included: true },
      { text: "Excel 批量导入", included: true },
      { text: "Word 文档导出", included: true },
      { text: "自定义标签", included: true },
      { text: "图片上传 (无限制)", included: true },
      { text: "优先技术支持", included: true },
    ],
    cta: "联系我们",
  },
];

const faqs = [
  {
    q: "如何注册账号？",
    a: "点击任意付费计划的 PayPal 按钮即可完成付款。付款成功后通过 Google 账号登录，系统会自动关联您的订阅权限。",
  },
  {
    q: "支持哪些支付方式？",
    a: "通过 PayPal 进行支付，支持信用卡、借记卡和 PayPal 余额。您无需拥有 PayPal 账号也能使用信用卡付款。",
  },
  {
    q: "可以随时取消订阅吗？",
    a: "可以。您可以在任何时间通过 PayPal 取消订阅，取消后当前计费周期结束前仍可继续使用 Pro 功能。",
  },
  {
    q: "Free 计划有使用限制吗？",
    a: "Free 计划最多可创建 50 道题目，不支持 Word 导出和自定义标签。升级到 Pro 即可解锁全部功能。",
  },
  {
    q: "题目数据安全吗？",
    a: "您的所有数据都经过加密存储，我们不会与任何第三方共享您的题目内容。",
  },
  {
    q: "Team 计划有什么额外优势？",
    a: "Team 计划支持多教师协作，可以共享题库、统一管理知识点体系，并提供优先技术支持。",
  },
];

function PricingContent() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [checkingOut, setCheckingOut] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const paypalResult = searchParams.get("paypal");
    const token = searchParams.get("token");
    if (paypalResult === "success" && token) {
      fetch(`/api/paypal/capture-order/${token}`, { method: "POST" })
        .then((r) => r.json())
        .then((result) => {
          if (result.success) {
            setMessage({ type: "success", text: "支付成功！请登录以开始使用。" });
          } else {
            setMessage({ type: "error", text: "支付验证失败，请联系客服。" });
          }
          window.history.replaceState({}, "", "/pricing");
        })
        .catch(() => {
          setMessage({ type: "error", text: "支付验证失败，请联系客服。" });
        });
    } else if (paypalResult === "cancel") {
      setMessage({ type: "info", text: "您取消了支付。" });
      window.history.replaceState({}, "", "/pricing");
    }
  }, []);

  const handlePayPalCheckout = useCallback(async (plan: Plan) => {
    setCheckingOut(true);
    try {
      const res = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice,
          currency: "USD",
          description: `${plan.name} 计划 - ${billing === "monthly" ? "月度" : "年度"}订阅`,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage({ type: "error", text: "创建订单失败：" + data.error });
        setCheckingOut(false);
        return;
      }
      window.location.href = data.approvalUrl;
    } catch {
      setMessage({ type: "error", text: "网络错误，请稍后重试。" });
      setCheckingOut(false);
    }
  }, [billing]);

  const getPrice = (plan: Plan) =>
    billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;

  const handleFreeCTA = () => {
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f6f8fb] to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-[#1a1a2e]">
            物理题库
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/"
                className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                进入题库
              </Link>
            ) : (
              <Link
                href="/"
                className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                免费开始
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="text-center pt-20 pb-12 px-6">
        <h1 className="text-[44px] font-extrabold text-[#1a1a2e] tracking-tight leading-tight mb-3">
          选择适合你的计划
        </h1>
        <p className="text-lg text-gray-500 mb-10">
          从个人教师到学校团队，灵活定价，随时升级
        </p>

        {/* Billing Toggle */}
        <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              billing === "monthly"
                ? "bg-white shadow-sm text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            按月付费
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              billing === "yearly"
                ? "bg-white shadow-sm text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            按年付费
            <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              省 2 个月
            </span>
          </button>
        </div>
      </section>

      {/* Cards */}
      <section className="max-w-6xl mx-auto px-6 pb-16 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {plans.map((plan) => {
          const price = getPrice(plan);

          return (
            <div
              key={plan.key}
              className={`rounded-2xl border bg-white transition-all duration-300 ${
                plan.highlighted
                  ? "border-blue-500 shadow-[0_8px_32px_rgba(22,119,255,0.14)] scale-[1.03] z-10 hover:scale-[1.03] hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(22,119,255,0.2)]"
                  : "border-gray-200 shadow-sm hover:-translate-y-1.5 hover:shadow-lg"
              }`}
            >
              <div className="p-7 pb-0">
                {/* Title */}
                <div className="flex items-center gap-2.5 mb-4">
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      plan.highlighted
                        ? "bg-gradient-to-br from-blue-500 to-blue-400 text-white"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {plan.key === "free" ? "⚡" : plan.key === "pro" ? "👑" : "🏫"}
                  </span>
                  <span className="text-xl font-bold text-[#1a1a2e]">{plan.name}</span>
                  {plan.badge && (
                    <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2.5 py-0.5 rounded-full">
                      {plan.badge}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-baseline mb-1">
                  <span className="text-2xl font-bold text-[#1a1a2e]">$</span>
                  <span className="text-[52px] font-extrabold text-[#1a1a2e] leading-none tracking-tighter mx-0.5">
                    {price}
                  </span>
                  <span className="text-base text-gray-400 font-medium">
                    /{billing === "monthly" ? "月" : "年"}
                  </span>
                </div>

                {billing === "yearly" && price > 0 && (
                  <div className="text-sm text-blue-500 font-medium mb-1">
                    每月仅 ${(plan.yearlyPrice / 12).toFixed(2)}
                  </div>
                )}

                <p className="text-sm text-gray-400 mb-5">{plan.description}</p>

                {/* CTA / PayPal */}
                {plan.key === "free" ? (
                  <button
                    onClick={handleFreeCTA}
                    className="w-full h-12 text-base font-semibold rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {plan.cta}
                  </button>
                ) : (
                  <button
                    onClick={() => handlePayPalCheckout(plan)}
                    disabled={checkingOut}
                    className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-blue-500 to-blue-400 text-white hover:from-blue-600 hover:to-blue-500 hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {checkingOut ? "正在跳转到 PayPal..." : "使用 PayPal 订阅"}
                  </button>
                )}

                <p className="text-center text-xs text-gray-300 mt-2 mb-0">
                  {plan.key === "free" ? "无需信用卡" : "随时可以取消"}
                </p>

                {/* Features */}
                <ul className="list-none p-0 m-0 border-t border-gray-100 pt-5 space-y-2.5">
                  {plan.features.map((f, i) => (
                    <li
                      key={i}
                      className={`flex items-center text-sm leading-relaxed ${
                        f.included ? "text-gray-700" : "text-gray-300 line-through"
                      }`}
                    >
                      <svg
                        className={`w-3.5 h-3.5 mr-2 flex-shrink-0 ${
                          f.included ? "text-green-500" : "text-gray-200"
                        }`}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </section>

      {/* Message Toast */}
      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`px-5 py-3 rounded-xl text-sm font-medium shadow-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : message.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}
            onClick={() => setMessage(null)}
          >
            {message.text}
          </div>
        </div>
      )}

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-center text-[34px] font-extrabold text-[#1a1a2e] mb-12 tracking-tight">
          常见问题
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="bg-gray-50 rounded-2xl p-6 border border-gray-100 hover:shadow-md transition-shadow"
            >
              <h4 className="text-base font-semibold text-[#1a1a2e] mb-2.5">
                {faq.q}
              </h4>
              <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="text-center pb-20 px-6">
        <h2 className="text-[34px] font-extrabold text-[#1a1a2e] mb-3 tracking-tight">
          准备好开始了吗？
        </h2>
        <p className="text-base text-gray-500 mb-7">
          免费注册，立即体验物理题库管理系统的强大功能
        </p>
        <Link
          href="/"
          className="inline-block px-10 py-3.5 text-base font-semibold bg-blue-500 text-white rounded-2xl hover:bg-blue-600 transition-colors"
        >
          免费开始使用
        </Link>
      </section>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <PricingContent />
    </Suspense>
  );
}
