import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  feedbackKindLabels,
  feedbackStatusColors,
  feedbackStatusLabels,
  listAdminFeedback,
  type FeedbackKind,
  type FeedbackRecord,
  type FeedbackStatus
} from '../../services/feedback';
import { FeedbackDrawer } from '../feedback/FeedbackDrawer';

const { Text } = Typography;

export function FeedbackManagement({ myOpenId }: { myOpenId?: string }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus>();
  const [kind, setKind] = useState<FeedbackKind>();
  const [openId, setOpenId] = useState<string>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listAdminFeedback({ status, kind }));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [status, kind, messageApi]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const columns: ColumnsType<FeedbackRecord> = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '类型', dataIndex: 'kind', width: 110, render: (value: FeedbackKind) => feedbackKindLabels[value] },
    { title: '提交人', width: 130, render: (_, row) => row.author.name },
    { title: '状态', dataIndex: 'status', width: 100, render: (value: FeedbackStatus) => <Tag color={feedbackStatusColors[value]}>{feedbackStatusLabels[value]}</Tag> },
    { title: '处理人', width: 110, render: (_, row) => row.assignee?.name ?? <Text type="secondary">未分派</Text> },
    { title: '回复', dataIndex: 'replyCount', width: 70 },
    { title: '更新时间', dataIndex: 'updatedAt', width: 170, render: (value: string) => new Date(value).toLocaleString() }
  ];

  return (
    <Card
      title="反馈处理"
      extra={
        <Space wrap>
          <Select<FeedbackStatus> allowClear placeholder="全部状态" style={{ width: 120 }} value={status} onChange={setStatus} options={(Object.keys(feedbackStatusLabels) as FeedbackStatus[]).map((value) => ({ value, label: feedbackStatusLabels[value] }))} />
          <Select<FeedbackKind> allowClear placeholder="全部类型" style={{ width: 120 }} value={kind} onChange={setKind} options={(Object.keys(feedbackKindLabels) as FeedbackKind[]).map((value) => ({ value, label: feedbackKindLabels[value] }))} />
          <Button icon={<ReloadOutlined />} onClick={() => void reload()} loading={loading}>刷新</Button>
        </Space>
      }
    >
      {contextHolder}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={{ pageSize: 12, hideOnSinglePage: true }}
        onRow={(row) => ({ onClick: () => setOpenId(row.id), className: 'feedback-row' })}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无反馈" /> }}
      />
      <FeedbackDrawer id={openId} mode="admin" myOpenId={myOpenId} onClose={() => setOpenId(undefined)} onChanged={() => void reload()} />
    </Card>
  );
}
