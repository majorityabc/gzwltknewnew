import { Router, Request, Response } from 'express';

const router = Router();

const isSandbox = process.env.PAYPAL_SANDBOX === 'true';

const PAYPAL_API = isSandbox
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

const CLIENT_ID = isSandbox
  ? process.env.PAYPAL_SANDBOX_CLIENT_ID!
  : process.env.PAYPAL_LIVE_CLIENT_ID!;

const CLIENT_SECRET = isSandbox
  ? process.env.PAYPAL_SANDBOX_CLIENT_SECRET!
  : process.env.PAYPAL_LIVE_CLIENT_SECRET!;

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Create a one-time order (for single payments)
router.post('/create-order', async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'USD', description } = req.body;
    const token = await getAccessToken();

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `order-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: Number(amount).toFixed(2),
          },
          description,
        }],
      }),
    });

    const order: any = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(order));
    res.json({ id: order.id });
  } catch (error: any) {
    console.error('PayPal create order error:', error);
    res.status(500).json({ error: error.message || 'Failed to create order' });
  }
});

// Capture a one-time order
router.post('/capture-order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const token = await getAccessToken();

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData: any = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(captureData));

    if (captureData.status === 'COMPLETED') {
      res.json({ success: true, capture: captureData });
    } else {
      res.status(400).json({ error: `Payment status: ${captureData.status}` });
    }
  } catch (error: any) {
    console.error('PayPal capture error:', error);
    res.status(500).json({ error: error.message || 'Failed to capture order' });
  }
});

// Create subscription plan (call once or manage via PayPal dashboard)
router.post('/create-plan', async (req: Request, res: Response) => {
  try {
    const { name, description, price, currency = 'USD', interval = 'MONTH' } = req.body;
    const token = await getAccessToken();

    // Create product
    const productRes = await fetch(`${PAYPAL_API}/v1/catalogs/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `product-${Date.now()}`,
      },
      body: JSON.stringify({
        name,
        description,
        type: 'SERVICE',
        category: 'SOFTWARE',
      }),
    });

    const product: any = await productRes.json();
    if (!productRes.ok) throw new Error(JSON.stringify(product));

    // Create plan
    const planRes = await fetch(`${PAYPAL_API}/v1/billing/plans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `plan-${Date.now()}`,
      },
      body: JSON.stringify({
        product_id: product.id,
        name: `${name} - ${interval === 'MONTH' ? '月度' : '年度'}`,
        description,
        status: 'ACTIVE',
        billing_cycles: [{
          frequency: {
            interval_unit: interval,
            interval_count: 1,
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: Number(price).toFixed(2),
              currency_code: currency,
            },
          },
        }],
        payment_preferences: {
          auto_bill_outstanding: true,
          payment_failure_threshold: 3,
        },
      }),
    });

    const plan: any = await planRes.json();
    if (!planRes.ok) throw new Error(JSON.stringify(plan));
    res.json(plan);
  } catch (error: any) {
    console.error('PayPal create plan error:', error);
    res.status(500).json({ error: error.message || 'Failed to create plan' });
  }
});

// Create a subscription for a user
router.post('/create-subscription', async (req: Request, res: Response) => {
  try {
    const { planId } = req.body;
    const token = await getAccessToken();

    const response = await fetch(`${PAYPAL_API}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: planId,
        application_context: {
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/pricing?subscription=success`,
          cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/pricing?subscription=cancel`,
        },
      }),
    });

    const subscription: any = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(subscription));
    res.json(subscription);
  } catch (error: any) {
    console.error('PayPal create subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to create subscription' });
  }
});

export default router;
