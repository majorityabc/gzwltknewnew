import { NextRequest, NextResponse } from "next/server";

const isSandbox = process.env.PAYPAL_SANDBOX === "true";

const PAYPAL_API = isSandbox
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

const CLIENT_ID = isSandbox
  ? process.env.NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID!
  : process.env.NEXT_PUBLIC_PAYPAL_LIVE_CLIENT_ID!;

const CLIENT_SECRET = isSandbox
  ? process.env.PAYPAL_SANDBOX_CLIENT_SECRET!
  : process.env.PAYPAL_LIVE_CLIENT_SECRET!;

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await params;
    const token = await getAccessToken();

    const response = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const captureData: any = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(captureData));

    if (captureData.status === "COMPLETED") {
      return NextResponse.json({ success: true, capture: captureData });
    }
    return NextResponse.json(
      { error: `Payment status: ${captureData.status}` },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("PayPal capture error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to capture order" },
      { status: 500 },
    );
  }
}
