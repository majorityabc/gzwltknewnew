import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import QuestionEditor from './QuestionEditor';
import { questionsApi, chaptersApi, knowledgePointsApi } from '../services/api';

interface QuestionFormProps {
  visible: boolean;
  questionId?: number;
  onClose: () => void;
  onSuccess: () => void;
}

const QuestionForm: React.FC<QuestionFormProps> = ({ visible, questionId, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [chapters, setChapters] = useState<any[]>([]);
  const [knowledgePoints, setKnowledgePoints] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      loadData();
      if (questionId) {
        loadQuestion(questionId);
      } else {
        form.resetFields();
        setContent('');
      }
    }
  }, [visible, questionId]);

  const loadData = async () => {
    try {
      const [chaptersRes, kpsRes] = await Promise.all([
        chaptersApi.getAll(),
        knowledgePointsApi.getAll()
      ]);
      setChapters(chaptersRes.data);
      setKnowledgePoints(kpsRes.data);
    } catch (error) {
      message.error('加载数据失败');
    }
  };

  const loadQuestion = async (id: number) => {
    try {
      const response = await questionsApi.getById(id);
      const question = response.data;
      setContent(question.content);
      form.setFieldsValue({
        chapterId: question.chapterId,
        knowledgePointIds: question.questionKnowledgePoints?.map((qkp: any) => qkp.knowledgePointId),
        difficulty: question.difficulty,
        questionType: question.questionType
      });
    } catch (error) {
      message.error('加载题目失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const data = {
        content,
        plainText: content.replace(/<[^>]*>/g, ''),
        ...values
      };

      if (questionId) {
        await questionsApi.update(questionId, data);
        message.success('更新成功');
      } else {
        await questionsApi.create(data);
        message.success('创建成功');
      }

      onSuccess();
      onClose();
    } catch (error) {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={questionId ? '编辑题目' : '新建题目'}
      open={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={900}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item label="题目内容" required>
          <QuestionEditor value={content} onChange={setContent} />
        </Form.Item>

        <Form.Item name="chapterId" label="所属章节">
          <Select placeholder="请选择章节" allowClear>
            {chapters.map(ch => (
              <Select.Option key={ch.id} value={ch.id}>
                {ch.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="knowledgePointIds" label="知识点">
          <Select mode="multiple" placeholder="请选择知识点" allowClear>
            {knowledgePoints.map(kp => (
              <Select.Option key={kp.id} value={kp.id}>
                {kp.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="difficulty" label="难度">
          <Select placeholder="请选择难度" allowClear>
            <Select.Option value="基础">基础</Select.Option>
            <Select.Option value="中等">中等</Select.Option>
            <Select.Option value="困难">困难</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item name="questionType" label="题型">
          <Select placeholder="请选择题型" allowClear>
            <Select.Option value="选择题">选择题</Select.Option>
            <Select.Option value="填空题">填空题</Select.Option>
            <Select.Option value="计算题">计算题</Select.Option>
            <Select.Option value="实验题">实验题</Select.Option>
            <Select.Option value="简答题">简答题</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default QuestionForm;
