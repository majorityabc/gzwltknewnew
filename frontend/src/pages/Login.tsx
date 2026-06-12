import React from 'react';
import { Button, Card, Space } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const Login: React.FC = () => {
  const { signInWithGoogle, loading } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5',
    }}>
      <Card style={{ width: 400, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>物理题库管理系统</h1>
        <p style={{ color: '#888', marginBottom: 32 }}>请登录以继续</p>
        <Button
          type="primary"
          size="large"
          icon={<GoogleOutlined />}
          onClick={signInWithGoogle}
          loading={loading}
          block
        >
          Google 账号登录
        </Button>
        <Space style={{ marginTop: 16 }}>
          <Button type="link" onClick={() => navigate('/pricing')}>
            查看定价
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Login;
