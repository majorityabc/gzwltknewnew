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

export async function POST(request: NextRequest) {
  try {
    const { amount, currency = "USD", description } = await request.json();
    const token = await getAccessToken();

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `order-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: Number(amount).toFixed(2),
            },
            description,
          },
        ],
      }),
    });

    const order: any = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(order));
    return NextResponse.json({ id: order.id });
  } catch (error: any) {
    console.error("PayPal create order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create order" },
      { status: 500 },
    );
  }
}
