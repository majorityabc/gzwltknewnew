import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Popconfirm, message } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { questionsApi } from '../services/api';
import { useQuestionStore } from '../stores/questionStore';

interface QuestionListProps {
  onEdit: (id: number) => void;
  refresh: number;
}

const QuestionList: React.FC<QuestionListProps> = ({ onEdit, refresh }) => {
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const { questions, setQuestions, selectedQuestionIds, setSelectedQuestionIds, filters } = useQuestionStore();

  useEffect(() => {
    loadQuestions();
  }, [filters, pagination.current, refresh]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.current,
        limit: pagination.pageSize,
        ...filters
      };

      if (filters.knowledgePointIds && filters.knowledgePointIds.length > 0) {
        params.knowledgePointIds = filters.knowledgePointIds.join(',');
      }

      const response = await questionsApi.getAll(params);
      setQuestions(response.data.data);
      setPagination(prev => ({ ...prev, total: response.data.total }));
    } catch (error) {
      message.error('加载题目失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await questionsApi.delete(id);
      message.success('删除成功');
      loadQuestions();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80
    },
    {
      title: '题目内容',
      dataIndex: 'plainText',
      ellipsis: true,
      render: (text: string) => {
        const preview = text?.substring(0, 100) || '';
        return <div dangerouslySetInnerHTML={{ __html: preview + (text?.length > 100 ? '...' : '') }} />;
      }
    },
    {
      title: '章节',
      dataIndex: ['chapter', 'name'],
      width: 120
    },
    {
      title: '知识点',
      dataIndex: 'questionKnowledgePoints',
      width: 200,
      render: (kps: any[]) => (
        <>
          {kps?.map(qkp => (
            <Tag key={qkp.knowledgePointId} color="blue">
              {qkp.knowledgePoint.name}
            </Tag>
          ))}
        </>
      )
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      width: 100,
      render: (difficulty: string) => {
        const colorMap: any = { '基础': 'green', '中等': 'orange', '困难': 'red' };
        return difficulty ? <Tag color={colorMap[difficulty]}>{difficulty}</Tag> : null;
      }
    },
    {
      title: '题型',
      dataIndex: 'questionType',
      width: 100
    },
    {
      title: '操作',
      width: 150,
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => onEdit(record.id)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除这道题目吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={questions}
      loading={loading}
      pagination={{
        ...pagination,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 道题目`
      }}
      onChange={(newPagination) => {
        setPagination(prev => ({
          ...prev,
          current: newPagination.current || 1,
          pageSize: newPagination.pageSize || 20
        }));
      }}
      rowSelection={{
        selectedRowKeys: selectedQuestionIds,
        onChange: (selectedRowKeys) => {
          setSelectedQuestionIds(selectedRowKeys as number[]);
        }
      }}
    />
  );
};

export default QuestionList;
