import React, { useState } from 'react';
import { Layout, Button, Space, message, Avatar, Dropdown } from 'antd';
import { PlusOutlined, DownloadOutlined, UserOutlined, LogoutOutlined, CrownOutlined } from '@ant-design/icons';
import QuestionList from '../components/QuestionList';
import QuestionFilter from '../components/QuestionFilter';
import QuestionForm from '../components/QuestionForm';
import { exportApi } from '../services/api';
import { useQuestionStore } from '../stores/questionStore';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const { Header, Content, Sider } = Layout;

const Dashboard: React.FC = () => {
  const [formVisible, setFormVisible] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | undefined>();
  const [refresh, setRefresh] = useState(0);
  const { selectedQuestionIds } = useQuestionStore();
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleCreate = () => {
    setEditingQuestionId(undefined);
    setFormVisible(true);
  };

  const handleEdit = (id: number) => {
    setEditingQuestionId(id);
    setFormVisible(true);
  };

  const handleFormClose = () => {
    setFormVisible(false);
    setEditingQuestionId(undefined);
  };

  const handleFormSuccess = () => {
    setRefresh(prev => prev + 1);
  };

  const handleExport = async () => {
    if (selectedQuestionIds.length === 0) {
      message.warning('请先选择要导出的题目');
      return;
    }

    try {
      const response = await exportApi.toWord(selectedQuestionIds);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `物理题库_${new Date().toISOString().slice(0, 10)}.docx`;
      link.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (error) {
      message.error('导出失败');
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%' }}>
          <h1 style={{ margin: 0, fontSize: '20px' }}>物理题库管理系统</h1>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              新建题目
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={selectedQuestionIds.length === 0}
            >
              导出 Word ({selectedQuestionIds.length})
            </Button>
            <Button
              icon={<CrownOutlined />}
              onClick={() => navigate('/pricing')}
            >
              升级
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: signOut },
                ],
              }}
              placement="bottomRight"
            >
              <Space style={{ cursor: 'pointer', marginLeft: 16 }}>
                <Avatar src={user?.user_metadata?.avatar_url} icon={<UserOutlined />} />
                <span>{user?.user_metadata?.full_name || user?.email}</span>
              </Space>
            </Dropdown>
          </Space>
        </div>
      </Header>

      <Layout>
        <Sider width={280} style={{ background: '#fff', padding: '16px' }}>
          <QuestionFilter />
        </Sider>

        <Content style={{ padding: '16px', background: '#f0f2f5' }}>
          <div style={{ background: '#fff', padding: '16px', borderRadius: '8px' }}>
            <QuestionList onEdit={handleEdit} refresh={refresh} />
          </div>
        </Content>
      </Layout>

      <QuestionForm
        visible={formVisible}
        questionId={editingQuestionId}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </Layout>
  );
};

export default Dashboard;
