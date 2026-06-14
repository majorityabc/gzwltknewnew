import { NextRequest, NextResponse } from "next/server";

const isSandbox = process.env.PAYPAL_SANDBOX === "true";

const SDK_BASE = isSandbox
  ? "https://www.sandbox.paypal.com/sdk/js"
  : "https://www.paypal.com/sdk/js";

export async function GET(request: NextRequest) {
  const qs = request.nextUrl.search;
  const upstream = `${SDK_BASE}${qs}`;

  const res = await fetch(upstream);
  const body = await res.text();

  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type":
        res.headers.get("Content-Type") || "application/javascript",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
