import { Card, Space, Switch, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { getNotificationPrefs, setNotificationPrefs } from '../../services/feedback';

const { Text } = Typography;

export function NotificationSettings() {
  const [messageApi, contextHolder] = message.useMessage();
  const [listed, setListed] = useState<boolean>();

  useEffect(() => {
    void getNotificationPrefs().then((prefs) => setListed(prefs.listed)).catch(() => undefined);
  }, []);

  const change = (next: boolean) => {
    setListed(undefined);
    setNotificationPrefs(next)
      .then((prefs) => setListed(prefs.listed))
      .catch((error: unknown) => {
        setListed(!next);
        messageApi.error(error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <Card title="通知设置">
      {contextHolder}
      <Space direction="vertical" size={8}>
        <Space>
          <Switch checked={listed ?? true} loading={listed === undefined} onChange={change} />
          <Text>有新工具上架时通过飞书提醒我</Text>
        </Space>
        <Text type="secondary">投稿审核结果、反馈回复等与你直接相关的通知始终会发送。</Text>
      </Space>
    </Card>
  );
}
