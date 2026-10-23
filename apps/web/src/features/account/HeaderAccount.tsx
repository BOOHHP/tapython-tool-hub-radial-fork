import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Dropdown, Space, Tag, Tooltip, Typography } from 'antd';
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
      <Tooltip title="飞书登录" placement="bottom">
        <Button
          shape="circle"
          size="large"
          icon={<UserOutlined />}
          aria-label="飞书登录"
          className="header-account-button"
          href={feishuLoginUrl(`${window.location.pathname}${window.location.hash}`)}
        />
      </Tooltip>
    );
  }

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items: [
          {
            key: 'profile',
            disabled: true,
            label: (
              <Space direction="vertical" size={2}>
                <Text strong>{user.name}</Text>
                {user.email ? <Text type="secondary">{user.email}</Text> : null}
                {user.roles.length > 0 ? (
                  <Space size={4}>{user.roles.map((role) => <Tag key={role} color={role === 'admin' ? 'gold' : 'blue'}>{roleLabels[role]}</Tag>)}</Space>
                ) : null}
              </Space>
            )
          },
          { type: 'divider' },
          {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: '退出登录',
            onClick: () => void logoutHub().then(() => setUser(undefined))
          }
        ]
      }}
    >
      <button type="button" className="header-account-avatar" aria-label={`账号 ${user.name}，点击展开菜单`}>
        <Avatar size={40}>{user.name.slice(0, 1)}</Avatar>
      </button>
    </Dropdown>
  );
}
