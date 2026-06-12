import React, { useState, useEffect } from 'react';
import { Button, Card, Tag, Layout, Space, Segmented, message } from 'antd';
import { CheckOutlined, CrownOutlined, ThunderboltOutlined, DollarOutlined } from '@ant-design/icons';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import './Pricing.css';

const { Header, Content } = Layout;

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_SANDBOX === 'true'
  ? import.meta.env.VITE_PAYPAL_SANDBOX_CLIENT_ID
  : import.meta.env.VITE_PAYPAL_LIVE_CLIENT_ID;

interface Plan {
  key: string;
  name: string;
  icon: React.ReactNode;
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
    key: 'free',
    name: 'Free',
    icon: <ThunderboltOutlined />,
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: '适合个人教师体验使用',
    features: [
      { text: '最多 50 道题目', included: true },
      { text: '基础富文本编辑器', included: true },
      { text: '章节 & 知识点标签', included: true },
      { text: '难度 & 题型分类', included: true },
      { text: 'Excel 批量导入', included: true },
      { text: 'Word 文档导出', included: false },
      { text: '自定义标签', included: false },
      { text: '图片上传 (最大 2MB)', included: false },
      { text: '优先技术支持', included: false },
    ],
    cta: '免费开始',
  },
  {
    key: 'pro',
    name: 'Pro',
    icon: <CrownOutlined />,
    monthlyPrice: 14,
    yearlyPrice: 120,
    description: '适合专业教师日常使用',
    highlighted: true,
    badge: '最受欢迎',
    features: [
      { text: '无限题目数量', included: true },
      { text: '完整富文本编辑器', included: true },
      { text: '章节 & 知识点标签', included: true },
      { text: '难度 & 题型分类', included: true },
      { text: 'Excel 批量导入', included: true },
      { text: 'Word 文档导出', included: true },
      { text: '自定义标签', included: true },
      { text: '图片上传 (最大 10MB)', included: true },
      { text: '优先技术支持', included: false },
    ],
    cta: '立即订阅',
  },
  {
    key: 'team',
    name: 'Team',
    icon: <span style={{ fontSize: 18 }}>🏫</span>,
    monthlyPrice: 29,
    yearlyPrice: 290,
    description: '适合教研组或学校团队',
    features: [
      { text: '无限题目数量', included: true },
      { text: '完整富文本编辑器', included: true },
      { text: '章节 & 知识点标签', included: true },
      { text: '难度 & 题型分类', included: true },
      { text: 'Excel 批量导入', included: true },
      { text: 'Word 文档导出', included: true },
      { text: '自定义标签', included: true },
      { text: '图片上传 (无限制)', included: true },
      { text: '优先技术支持', included: true },
    ],
    cta: '联系我们',
  },
];

const faqs = [
  {
    q: '如何注册账号？',
    a: '点击任意付费计划的 PayPal 按钮即可完成付款。付款成功后通过 Google 账号登录，系统会自动关联您的订阅权限。',
  },
  {
    q: '支持哪些支付方式？',
    a: '通过 PayPal 进行支付，支持信用卡、借记卡和 PayPal 余额。您无需拥有 PayPal 账号也能使用信用卡付款。',
  },
  {
    q: '可以随时取消订阅吗？',
    a: '可以。您可以在任何时间通过 PayPal 取消订阅，取消后当前计费周期结束前仍可继续使用 Pro 功能。',
  },
  {
    q: 'Free 计划有使用限制吗？',
    a: 'Free 计划最多可创建 50 道题目，不支持 Word 导出和自定义标签。升级到 Pro 即可解锁全部功能。',
  },
  {
    q: '题目数据安全吗？',
    a: '您的所有数据都经过加密存储，我们不会与任何第三方共享您的题目内容。',
  },
  {
    q: 'Team 计划有什么额外优势？',
    a: 'Team 计划支持多教师协作，可以共享题库、统一管理知识点体系，并提供优先技术支持。',
  },
];

const Pricing: React.FC = () => {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const status = searchParams.get('subscription');
    if (status === 'success') {
      message.success('订阅成功！请登录以开始使用。');
    } else if (status === 'cancel') {
      message.info('您取消了支付。');
    }
  }, [searchParams]);

  const handleFreeCTA = () => {
    if (isAuthenticated) {
      navigate('/');
    } else {
      navigate('/login');
    }
  };

  const startCheckout = (planKey: string) => {
    setCheckoutPlan(planKey);
  };

  const cancelCheckout = () => {
    setCheckoutPlan(null);
  };

  const getPrice = (plan: Plan) => {
    return billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
  };

  const getAmountForPayPal = (plan: Plan) => {
    return billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
  };

  const getPlanDescription = (plan: Plan) => {
    return `${plan.name} 计划 - ${billing === 'monthly' ? '月度' : '年度'}订阅`;
  };

  return (
    <Layout className="pricing-layout">
      <Header className="pricing-header">
        <div className="pricing-header-inner">
          <span className="pricing-logo" onClick={() => navigate('/')}>
            📐 物理题库
          </span>
          <Space>
            <Button type="text" onClick={() => navigate('/login')}>
              登录
            </Button>
            <Button type="primary" onClick={() => navigate('/login')}>
              免费开始
            </Button>
          </Space>
        </div>
      </Header>

      <Content className="pricing-content">
        {/* Hero */}
        <section className="pricing-hero">
          <h1>选择适合你的计划</h1>
          <p className="pricing-hero-sub">
            从个人教师到学校团队，灵活定价，随时升级
          </p>

          {/* Billing Toggle */}
          <div className="pricing-toggle-wrapper">
            <Segmented
              size="large"
              value={billing}
              onChange={(val) => setBilling(val as 'monthly' | 'yearly')}
              options={[
                { label: '按月付费', value: 'monthly' },
                {
                  label: (
                    <span>
                      按年付费 <Tag color="green" style={{ marginLeft: 4, fontSize: 10 }}>省 2 个月</Tag>
                    </span>
                  ),
                  value: 'yearly',
                },
              ]}
            />
          </div>
        </section>

        {/* Cards */}
        <section className="pricing-cards">
          {plans.map((plan) => {
            const price = getPrice(plan);
            const isCheckingOut = checkoutPlan === plan.key;

            return (
              <Card
                key={plan.key}
                className={`pricing-card ${plan.highlighted ? 'highlighted' : ''} ${isCheckingOut ? 'checking-out' : ''}`}
                title={
                  <div className="pricing-card-title">
                    <span className="pricing-card-icon">{plan.icon}</span>
                    <span>{plan.name}</span>
                    {plan.badge && <Tag color="gold" className="pricing-badge">{plan.badge}</Tag>}
                  </div>
                }
              >
                {/* Price */}
                <div className="pricing-card-price">
                  <span className="price-symbol">$</span>
                  <span className="price-amount">{price}</span>
                  <span className="price-period">/{billing === 'monthly' ? '月' : '年'}</span>
                </div>

                {billing === 'yearly' && price > 0 && (
                  <div className="pricing-savings">
                    每月仅 ${(plan.yearlyPrice / 12).toFixed(2)}
                  </div>
                )}

                <p className="pricing-card-desc">{plan.description}</p>

                {/* CTA / PayPal */}
                {plan.key === 'free' ? (
                  <Button
                    type={plan.highlighted ? 'primary' : 'default'}
                    size="large"
                    block
                    className="pricing-cta"
                    onClick={handleFreeCTA}
                  >
                    {plan.cta}
                  </Button>
                ) : isCheckingOut ? (
                  <div className="pricing-paypal-wrapper">
                    <div className="pricing-paypal-header">
                      <span>{plan.name} {billing === 'monthly' ? '月度' : '年度'}</span>
                      <span className="pricing-paypal-amount">${price}</span>
                    </div>
                    <PayPalScriptProvider options={{
                      clientId: PAYPAL_CLIENT_ID,
                      currency: 'USD',
                      intent: 'capture',
                      components: 'buttons',
                    }}>
                      <PayPalButtons
                        style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' }}
                        createOrder={async () => {
                          const res = await fetch('/api/paypal/create-order', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              amount: getAmountForPayPal(plan),
                              currency: 'USD',
                              description: getPlanDescription(plan),
                            }),
                          });
                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.error || 'Create order failed');
                          }
                          const { id } = await res.json();
                          return id;
                        }}
                        onApprove={async (data) => {
                          const res = await fetch(`/api/paypal/capture-order/${data.orderID}`, {
                            method: 'POST',
                          });
                          const result = await res.json();
                          if (result.success) {
                            message.success('支付成功！请登录以开始使用。');
                            cancelCheckout();
                            navigate('/login');
                          } else {
                            message.error('支付验证失败，请联系客服。');
                          }
                        }}
                        onCancel={() => {
                          cancelCheckout();
                          message.info('您取消了支付。');
                        }}
                        onError={(err) => {
                          console.error('PayPal error:', err);
                          cancelCheckout();
                          message.error('支付过程中出现错误，请稍后重试。');
                        }}
                      />
                    </PayPalScriptProvider>
                    <Button
                      type="link"
                      block
                      onClick={cancelCheckout}
                      style={{ marginTop: 8 }}
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="primary"
                    size="large"
                    block
                    className="pricing-cta pricing-cta-paypal"
                    onClick={() => startCheckout(plan.key)}
                    icon={<DollarOutlined />}
                  >
                    使用 PayPal 订阅
                  </Button>
                )}

                <p className="pricing-cta-sub">
                  {plan.key === 'free' ? '无需信用卡' : '随时可以取消'}
                </p>

                {/* Features */}
                <ul className="pricing-features">
                  {plan.features.map((f, i) => (
                    <li key={i} className={f.included ? '' : 'excluded'}>
                      <CheckOutlined
                        style={{
                          color: f.included ? '#52c41a' : '#d9d9d9',
                          marginRight: 8,
                          fontSize: 14,
                        }}
                      />
                      {f.text}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </section>

        {/* FAQ */}
        <section className="pricing-faq">
          <h2>常见问题</h2>
          <div className="pricing-faq-grid">
            {faqs.map((faq, i) => (
              <div key={i} className="pricing-faq-item">
                <h4>{faq.q}</h4>
                <p>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <section className="pricing-footer-cta">
          <h2>准备好开始了吗？</h2>
          <p>免费注册，立即体验物理题库管理系统的强大功能</p>
          <Button
            type="primary"
            size="large"
            onClick={() => navigate('/login')}
          >
            免费开始使用
          </Button>
        </section>
      </Content>
    </Layout>
  );
};

export default Pricing;
