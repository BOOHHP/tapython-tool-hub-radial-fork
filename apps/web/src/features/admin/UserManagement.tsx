import { Button, Card, Checkbox, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import type { HubRole } from '../../services/auth';
import {
  bindAlias,
  listAliasCandidates,
  listUsers,
  markUserLeft,
  setUserRoles,
  setUserTeam,
  unbindAlias,
  type AliasCandidate,
  type ManagedUser
} from '../../services/adminUsers';
import { roleLabels } from '../account/HeaderAccount';

const { Text, Paragraph } = Typography;

const teamValue = '__team__';
const roleOptions = (Object.keys(roleLabels) as HubRole[]).map((role) => ({ label: roleLabels[role], value: role }));

export function UserManagement() {
  const [messageApi, contextHolder] = message.useMessage();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [candidates, setCandidates] = useState<AliasCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextCandidates] = await Promise.all([listUsers(), listAliasCandidates()]);
      setUsers(nextUsers);
      setCandidates(nextCandidates);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      messageApi.success(success);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    }
    await reload();
  };

  const userColumns: ColumnsType<ManagedUser> = [
    {
      title: '姓名',
      width: 220,
      render: (_, user) => (
        <Space direction="vertical" size={0}>
          <Text strong>{user.name}</Text>
          {user.email ? <Text type="secondary">{user.email}</Text> : null}
        </Space>
      )
    },
    { title: '飞书部门', dataIndex: 'department', width: 140, render: (value?: string) => value ?? <Text type="secondary">未获取</Text> },
    {
      title: '团队',
      width: 190,
      render: (_, user) => (
        <Input
          key={`${user.openId}-${user.team ?? ''}`}
          defaultValue={user.team}
          placeholder={user.department ? `默认：${user.department}` : '未设置'}
          maxLength={100}
          onPressEnter={(event) => event.currentTarget.blur()}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next !== (user.team ?? '')) {
              void run(() => setUserTeam(user.openId, next || null), '团队已更新');
            }
          }}
        />
      )
    },
    {
      title: '角色',
      width: 200,
      render: (_, user) => (
        <Checkbox.Group
          options={roleOptions}
          value={user.roles}
          disabled={user.status === 'left'}
          onChange={(roles) => void run(() => setUserRoles(user.openId, roles as HubRole[]), '角色已更新')}
        />
      )
    },
    { title: '状态', width: 90, render: (_, user) => <Tag color={user.status === 'active' ? 'green' : 'default'}>{user.status === 'active' ? '在职' : '已离职'}</Tag> },
    { title: '最近登录', width: 170, render: (_, user) => (user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '-') },
    {
      title: '操作',
      width: 110,
      render: (_, user) => user.status === 'active' ? (
        <Popconfirm title="标记为离职" description="该用户将无法再登录，已有会话立即失效。" okText="确认" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void run(() => markUserLeft(user.openId), '已标记离职')}>
          <Button danger size="small">标记离职</Button>
        </Popconfirm>
      ) : null
    }
  ];

  const personOptions = [
    { label: '作为团队名称', value: teamValue },
    ...users.filter((user) => user.status === 'active').map((user) => ({ label: `${user.name}${user.email ? ` (${user.email})` : ''}`, value: user.openId }))
  ];

  const aliasColumns: ColumnsType<AliasCandidate> = [
    { title: '提交人 / 作者名称', dataIndex: 'name', width: 220 },
    { title: '投稿数', dataIndex: 'submissions', width: 90 },
    { title: '工具数', dataIndex: 'tools', width: 90 },
    {
      title: '归属',
      render: (_, candidate) => (
        <Select
          showSearch
          allowClear
          optionFilterProp="label"
          placeholder="未绑定，选择人员或团队"
          className="full-width"
          value={candidate.kind === 'team' ? teamValue : candidate.openId}
          options={personOptions}
          onChange={(value: string) => void run(() => bindAlias(candidate.name, value === teamValue ? 'team' : 'person', value === teamValue ? undefined : value), '归属已更新')}
          onClear={() => void run(() => unbindAlias(candidate.name), '已解除绑定')}
        />
      )
    }
  ];

  return (
    <Space direction="vertical" size={18} className="full-width">
      {contextHolder}
      <Card title="人员与权限" extra={<Button icon={<ReloadOutlined />} onClick={() => void reload()} loading={loading}>刷新</Button>}>
        <Paragraph type="secondary">
          成员首次用飞书登录后出现在这里。团队默认取飞书部门，在“团队”一栏填写可覆盖；清空即恢复默认。
        </Paragraph>
        <Table rowKey="openId" size="middle" columns={userColumns} dataSource={users} loading={loading} pagination={false} scroll={{ x: 1000 }} />
      </Card>
      <Card title="提交人别名">
        <Paragraph type="secondary">
          历史投稿和工具里的提交人是自由文本。把它绑定到具体人员，贡献统计才会算到个人名下；团队名称（如“场景C组”）选“作为团队名称”。
        </Paragraph>
        <Table rowKey="name" size="middle" columns={aliasColumns} dataSource={candidates} loading={loading} pagination={{ pageSize: 15, hideOnSinglePage: true }} />
      </Card>
    </Space>
  );
}
