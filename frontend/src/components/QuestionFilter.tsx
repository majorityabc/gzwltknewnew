import React, { useState, useEffect } from 'react';
import { Card, Select, Space, Button } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import { chaptersApi, knowledgePointsApi } from '../services/api';
import { useQuestionStore } from '../stores/questionStore';

const QuestionFilter: React.FC = () => {
  const [chapters, setChapters] = useState<any[]>([]);
  const [knowledgePoints, setKnowledgePoints] = useState<any[]>([]);
  const { filters, setFilters, clearFilters } = useQuestionStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [chaptersRes, kpsRes] = await Promise.all([
        chaptersApi.getAll(),
        knowledgePointsApi.getAll()
      ]);
      setChapters(chaptersRes.data);
      setKnowledgePoints(kpsRes.data);
    } catch (error) {
      console.error('Failed to load filter data:', error);
    }
  };

  return (
    <Card title="筛选条件" size="small">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <div style={{ marginBottom: 8 }}>章节：</div>
          <Select
            placeholder="选择章节"
            style={{ width: '100%' }}
            value={filters.chapterId}
            onChange={(value) => setFilters({ chapterId: value })}
            allowClear
          >
            {chapters.map(ch => (
              <Select.Option key={ch.id} value={ch.id}>
                {ch.name}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>知识点：</div>
          <Select
            mode="multiple"
            placeholder="选择知识点（可多选）"
            style={{ width: '100%' }}
            value={filters.knowledgePointIds}
            onChange={(values) => setFilters({ knowledgePointIds: values })}
            allowClear
          >
            {knowledgePoints.map(kp => (
              <Select.Option key={kp.id} value={kp.id}>
                {kp.name}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>难度：</div>
          <Select
            placeholder="选择难度"
            style={{ width: '100%' }}
            value={filters.difficulty}
            onChange={(value) => setFilters({ difficulty: value })}
            allowClear
          >
            <Select.Option value="基础">基础</Select.Option>
            <Select.Option value="中等">中等</Select.Option>
            <Select.Option value="困难">困难</Select.Option>
          </Select>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>题型：</div>
          <Select
            placeholder="选择题型"
            style={{ width: '100%' }}
            value={filters.questionType}
            onChange={(value) => setFilters({ questionType: value })}
            allowClear
          >
            <Select.Option value="选择题">选择题</Select.Option>
            <Select.Option value="填空题">填空题</Select.Option>
            <Select.Option value="计算题">计算题</Select.Option>
            <Select.Option value="实验题">实验题</Select.Option>
            <Select.Option value="简答题">简答题</Select.Option>
          </Select>
        </div>

        <Button
          icon={<ClearOutlined />}
          onClick={clearFilters}
          block
        >
          清空筛选
        </Button>
      </Space>
    </Card>
  );
};

export default QuestionFilter;
