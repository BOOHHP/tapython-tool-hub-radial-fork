import { Button, Descriptions, Drawer, Empty, Input, List, Select, Skeleton, Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  feedbackKindLabels,
  feedbackStatusColors,
  feedbackStatusLabels,
  getAdminFeedback,
  getFeedback,
  replyFeedback,
  updateAdminFeedback,
  type FeedbackDetail,
  type FeedbackStatus
} from '../../services/feedback';

const { Paragraph, Text } = Typography;

interface FeedbackDrawerProps {
  id?: string;
  mode: 'member' | 'admin';
  // Feishu open id of the signed-in user; the emergency admin has none and can only triage, not reply or claim.
  myOpenId?: string;
  onClose: () => void;
  onChanged: () => void;
}

const statusOptions = (Object.keys(feedbackStatusLabels) as FeedbackStatus[]).map((status) => ({ value: status, label: feedbackStatusLabels[status] }));

export function FeedbackDrawer({ id, mode, myOpenId, onClose, onChanged }: FeedbackDrawerProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [detail, setDetail] = useState<FeedbackDetail>();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await (mode === 'admin' ? getAdminFeedback(id) : getFeedback(id)));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    }
  }, [id, mode, messageApi]);

  useEffect(() => {
    setDetail(undefined);
    setReply('');
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      messageApi.success(success);
      await load();
      onChanged();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const canReply = mode === 'member' || Boolean(myOpenId);
  const mine = detail?.assignee?.openId === myOpenId;

  return (
    <Drawer open={Boolean(id)} onClose={onClose} width={560} title={detail?.title ?? '反馈详情'} destroyOnClose>
      {contextHolder}
      {!detail ? <Skeleton active paragraph={{ rows: 6 }} /> : (
        <Space direction="vertical" size={16} className="full-width">
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="类型">{feedbackKindLabels[detail.kind]}</Descriptions.Item>
            <Descriptions.Item label="提交人">{detail.author.name}{detail.author.department ? `（${detail.author.department}）` : ''}</Descriptions.Item>
            <Descriptions.Item label="提交时间">{new Date(detail.createdAt).toLocaleString()}</Descriptions.Item>
            {detail.client ? <Descriptions.Item label="来源">{detail.client}{detail.clientVersion ? ` ${detail.clientVersion}` : ''}{detail.ueVersion ? ` / UE ${detail.ueVersion}` : ''}</Descriptions.Item> : null}
            <Descriptions.Item label="状态"><Tag color={feedbackStatusColors[detail.status]}>{feedbackStatusLabels[detail.status]}</Tag></Descriptions.Item>
            {detail.assignee ? <Descriptions.Item label="处理人">{detail.assignee.name}</Descriptions.Item> : null}
          </Descriptions>
          <Paragraph className="feedback-body">{detail.body}</Paragraph>

          {mode === 'admin' ? (
            <Space wrap>
              <Select<FeedbackStatus> value={detail.status} options={statusOptions} style={{ width: 130 }} disabled={busy} onChange={(status) => void run(() => updateAdminFeedback(detail.id, { status }), '状态已更新')} />
              {myOpenId ? (
                <Button disabled={busy} onClick={() => void run(() => updateAdminFeedback(detail.id, { assignee: mine ? null : myOpenId }), mine ? '已取消认领' : '已认领')}>{mine ? '取消认领' : '认领给我'}</Button>
              ) : null}
            </Space>
          ) : null}

          <List
            header={<Text strong>沟通记录</Text>}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无回复" /> }}
            dataSource={detail.replies}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical" size={2} className="full-width">
                  <Space size={6}>
                    <Text strong>{item.author.name}</Text>
                    {item.staff ? <Tag color="blue">处理人员</Tag> : null}
                    <Text type="secondary">{new Date(item.createdAt).toLocaleString()}</Text>
                  </Space>
                  <Paragraph className="feedback-body" style={{ marginBottom: 0 }}>{item.body}</Paragraph>
                </Space>
              </List.Item>
            )}
          />

          {canReply ? (
            <Space direction="vertical" className="full-width">
              <Input.TextArea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={2000} showCount placeholder={mode === 'admin' ? '回复提交人' : '补充说明或回复'} />
              <Button type="primary" disabled={!reply.trim()} loading={busy} onClick={() => void run(async () => { await replyFeedback(detail.id, reply.trim()); setReply(''); }, '已发送')}>发送回复</Button>
            </Space>
          ) : <Text type="secondary">应急管理员账号没有飞书身份，无法回复；请使用飞书登录。</Text>}
        </Space>
      )}
    </Drawer>
  );
}
