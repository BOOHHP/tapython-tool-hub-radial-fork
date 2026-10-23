import { LoginOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Dropdown, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { feishuLoginUrl, getHubSession, isFeishuLoginEnabled, logoutHub, type HubUser } from '../../services/auth';

const { Text } = Typography;

export const roleLabels: Record<string, string> = { admin: '管理员', reviewer: '评审员' };

export function HeaderAccount() {
  const [enabled, setEnabled] = useState(false);
  const [user, setUser] = useState<HubUser>();

  useEffect(() => {
    let cancelled = false;
    void isFeishuLoginEnabled().then(async (on) => {
      if (cancelled || !on) return;
      const session = await getHubSession();
      if (cancelled) return;
      setEnabled(true);
      setUser(session.authenticated ? session.user : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  if (!user) {
    return (
      <Button icon={<LoginOutlined />} href={feishuLoginUrl(`${window.location.pathname}${window.location.hash}`)}>
        飞书登录
      </Button>
    );
  }

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: '退出登录',
            onClick: () => void logoutHub().then(() => setUser(undefined))
          }
        ]
      }}
    >
      <Button icon={<UserOutlined />} aria-label={`账号 ${user.name}`}>
        <Space size={6}>
          <Text>{user.name}</Text>
          {user.roles.map((role) => <Tag key={role} color={role === 'admin' ? 'gold' : 'blue'}>{roleLabels[role]}</Tag>)}
        </Space>
      </Button>
    </Dropdown>
  );
}
