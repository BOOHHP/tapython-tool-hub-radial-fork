import { MessageOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, Input, Modal, Radio, Space, Switch, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  feedbackKindLabels,
  feedbackStatusColors,
  feedbackStatusLabels,
  getNotificationPrefs,
  listMyFeedback,
  setNotificationPrefs,
  submitFeedback,
  type FeedbackKind,
  type FeedbackRecord
} from '../../services/feedback';
import { FeedbackDrawer } from './FeedbackDrawer';

const { Text, Title } = Typography;

export function FeedbackPageHeader({ onBack }: { onBack: () => void }) {
  return (
    <section className="view-return-panel" aria-label="Feedback navigation">
      <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回工具库</Button>
      <div className="view-return-copy">
        <Text className="eyebrow">Feedback</Text>
        <Title level={4}>反馈与建议</Title>
        <Text type="secondary">提交问题或建议，处理进度会通过飞书通知你。</Text>
      </div>
    </section>
  );
}

interface FeedbackFormValues {
  kind: FeedbackKind;
  title: string;
  body: string;
}

// Personal center section: submit feedback, follow its progress and manage notification preferences.
export function FeedbackPanel() {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FeedbackFormValues>();
  const [items, setItems] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openId, setOpenId] = useState<string>();
  const [listed, setListed] = useState<boolean>();
  const [needLogin, setNeedLogin] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listMyFeedback());
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text === '请先登录') setNeedLogin(true);
      else messageApi.error(text);
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    void reload();
    void getNotificationPrefs().then((prefs) => setListed(prefs.listed)).catch(() => undefined);
  }, [reload]);

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await submitFeedback(values);
      messageApi.success('已提交，处理进度会通过飞书通知你');
      setComposing(false);
      form.resetFields();
      await reload();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (needLogin) {
    return <Alert type="info" showIcon message="请先登录" description="提交和查看反馈需要登录，请点击页面右上角的圆形按钮，使用飞书登录。" />;
  }

  const columns: ColumnsType<FeedbackRecord> = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '类型', dataIndex: 'kind', width: 110, render: (kind: FeedbackKind) => feedbackKindLabels[kind] },
    { title: '状态', dataIndex: 'status', width: 100, render: (status: FeedbackRecord['status']) => <Tag color={feedbackStatusColors[status]}>{feedbackStatusLabels[status]}</Tag> },
    { title: '回复', dataIndex: 'replyCount', width: 70 },
    { title: '提交时间', dataIndex: 'createdAt', width: 170, render: (value: string) => new Date(value).toLocaleString() }
  ];

  return (
    <Space direction="vertical" size={18} className="full-width">
      {contextHolder}
      <Card title="反馈与建议" extra={<Button type="primary" icon={<MessageOutlined />} onClick={() => setComposing(true)}>提交反馈</Button>}>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          onRow={(row) => ({ onClick: () => setOpenId(row.id), className: 'feedback-row' })}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有提交过反馈" /> }}
        />
      </Card>

      <Card title="通知设置">
        <Space direction="vertical" size={8}>
          <Space>
            <Switch
              checked={listed ?? true}
              loading={listed === undefined}
              onChange={(next) => void setNotificationPrefs(next).then((prefs) => setListed(prefs.listed)).catch((error: unknown) => messageApi.error(error instanceof Error ? error.message : String(error)))}
            />
            <Text>有新工具上架时通过飞书提醒我</Text>
          </Space>
          <Text type="secondary">投稿审核结果、反馈回复等与你直接相关的通知始终会发送。</Text>
        </Space>
      </Card>

      <Modal open={composing} title="提交反馈" okText="提交" cancelText="取消" confirmLoading={submitting} onOk={() => void submit()} onCancel={() => setComposing(false)} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ kind: 'bug' }} preserve={false}>
          <Form.Item name="kind" label="类型">
            <Radio.Group options={[{ value: 'bug', label: feedbackKindLabels.bug }, { value: 'suggestion', label: feedbackKindLabels.suggestion }]} optionType="button" />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true, message: '请填写标题' }]}>
            <Input maxLength={100} showCount />
          </Form.Item>
          <Form.Item name="body" label="详细描述" rules={[{ required: true, whitespace: true, message: '请填写详细描述' }]}>
            <Input.TextArea rows={6} maxLength={4000} showCount placeholder="问题请写清复现步骤、期望结果和实际结果" />
          </Form.Item>
        </Form>
      </Modal>

      <FeedbackDrawer id={openId} mode="member" myOpenId={undefined} onClose={() => setOpenId(undefined)} onChanged={() => void reload()} />
    </Space>
  );
}
