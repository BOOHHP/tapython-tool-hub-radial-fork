import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Row, Select, Skeleton, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ToolRecord } from '@tapython-tool-hub/shared';
import { claimAlias, getProfile, NotSignedInError, releaseAlias, type MyProfile } from '../../services/me';
import { roleLabels } from '../account/HeaderAccount';
import { NotificationSettings } from './NotificationSettings';
import { FeedbackPanel } from '../feedback/FeedbackPanel';

const { Paragraph, Text, Title } = Typography;

export function PersonalPageHeader({ onBack }: { onBack: () => void }) {
  return (
    <section className="view-return-panel" aria-label="Personal center navigation">
      <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回工具库</Button>
      <div className="view-return-copy">
        <Text className="eyebrow">My Space</Text>
        <Title level={4}>个人中心</Title>
        <Text type="secondary">我的署名、工具、投稿、审核和收藏。</Text>
      </div>
    </section>
  );
}

const statusColors: Record<string, string> = { approved: 'green', pending: 'gold', rejected: 'red', draft: 'default' };
const statusLabels: Record<string, string> = { approved: '已通过', pending: '待审核', rejected: '已拒绝', draft: '草稿' };
const decisionLabels: Record<string, string> = { approved: '通过', rejected: '拒绝', changes_requested: '要求修改' };

interface PersonalCenterProps {
  tools: ToolRecord[];
  favoriteSlugs: Set<string>;
  onOpenTool: (slug: string) => void;
}

export function PersonalCenter({ tools, favoriteSlugs, onOpenTool }: PersonalCenterProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [profile, setProfile] = useState<MyProfile>();
  const [needLogin, setNeedLogin] = useState(false);
  const [claiming, setClaiming] = useState<string>();

  const reload = useCallback(async () => {
    try {
      setProfile(await getProfile());
    } catch (error) {
      if (error instanceof NotSignedInError) setNeedLogin(true);
      else messageApi.error(error instanceof Error ? error.message : String(error));
    }
  }, [messageApi]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (action: () => Promise<void>, success: string) => {
    try {
      await action();
      messageApi.success(success);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    }
    await reload();
  };

  const favorites = useMemo(() => tools.filter((tool) => favoriteSlugs.has(tool.slug)), [tools, favoriteSlugs]);

  if (needLogin) {
    return <Alert type="info" showIcon message="请先登录" description="个人中心需要登录后查看，请点击页面右上角的圆形按钮，使用飞书登录。" />;
  }
  if (!profile) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  const toolColumns: ColumnsType<MyProfile['tools'][number]> = [
    { title: '工具', dataIndex: 'name', render: (name: string, row) => <Button type="link" onClick={() => onOpenTool(row.slug)}>{name}</Button> },
    { title: '最新版本', dataIndex: 'latestVersion', render: (value: string | null) => value ?? '-' },
    { title: '版本数', dataIndex: 'versions' },
    { title: '下载次数', dataIndex: 'downloads' }
  ];
  const submissionColumns: ColumnsType<MyProfile['submissions'][number]> = [
    { title: '工具', dataIndex: 'slug' },
    { title: '状态', dataIndex: 'status', render: (status: string) => <Tag color={statusColors[status]}>{statusLabels[status] ?? status}</Tag> },
    { title: '更新时间', dataIndex: 'updatedAt', render: (value: string) => new Date(value).toLocaleString() }
  ];
  const { user } = profile;

  return (
    <Space direction="vertical" size={18} className="full-width">
      {contextHolder}
      <Card title="账号">
        <Space size={24} wrap>
          <Space direction="vertical" size={0}>
            <Text strong>{user.name}</Text>
            {user.email ? <Text type="secondary">{user.email}</Text> : null}
          </Space>
          <Text type="secondary">部门：{user.department ?? '未获取'}</Text>
          <Text type="secondary">团队：{user.team ?? user.department ?? '未设置'}</Text>
          {user.roles.length > 0 ? <Space size={4}>{user.roles.map((role) => <Tag key={role} color={role === 'admin' ? 'gold' : 'blue'}>{roleLabels[role]}</Tag>)}</Space> : null}
        </Space>
      </Card>

      <Card title="我的署名">
        <Paragraph type="secondary">历史投稿和工具里的作者名是自由文本。认领属于你的名字后，这些工具、投稿和下载才会算到你名下。已被别人认领的名字不能再认领，如有误请联系管理员。</Paragraph>
        <Space direction="vertical" size={12} className="full-width">
          <Space wrap>
            {profile.aliases.length === 0 ? <Text type="secondary">还没有认领署名</Text> : null}
            {profile.aliases.map((alias) => (
              <Tag key={alias} closable onClose={(event) => { event.preventDefault(); void run(() => releaseAlias(alias), '已取消认领'); }}>{alias}</Tag>
            ))}
          </Space>
          <Select
            showSearch
            allowClear
            className="personal-claim-select"
            placeholder="选择要认领的署名"
            optionFilterProp="label"
            loading={Boolean(claiming)}
            value={claiming}
            options={profile.claimable.map((item) => ({ value: item.name, label: `${item.name}（${item.tools} 个工具 / ${item.submissions} 次投稿）` }))}
            onChange={(name?: string) => {
              if (!name) return;
              setClaiming(name);
              void run(() => claimAlias(name), '已认领').finally(() => setClaiming(undefined));
            }}
          />
        </Space>
      </Card>

      <NotificationSettings />

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={14}>
          <Card title="我的工具">
            <Table rowKey="slug" size="middle" columns={toolColumns} dataSource={profile.tools} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="认领署名后，你的工具会显示在这里" /> }} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="我的收藏" extra={<Text type="secondary">登录后自动同步到所有设备</Text>}>
            {favorites.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有收藏工具" /> : (
              <Space direction="vertical" size={4} className="full-width">
                {favorites.map((tool) => <Button key={tool.slug} type="link" className="personal-favorite" onClick={() => onOpenTool(tool.slug)}>{tool.displayName}</Button>)}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="我的投稿">
        <Table rowKey="id" size="middle" columns={submissionColumns} dataSource={profile.submissions} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无投稿" /> }} />
      </Card>

      {profile.reviews.total > 0 ? (
        <Card title="我的审核">
          <Statistic title="累计审核次数" value={profile.reviews.total} />
          <Space direction="vertical" size={2} className="personal-review-list">
            {profile.reviews.recent.map((item, index) => (
              <Text key={`${item.slug}-${index}`} type="secondary">{new Date(item.createdAt).toLocaleString()}　{item.slug}　{decisionLabels[item.decision] ?? item.decision}</Text>
            ))}
          </Space>
        </Card>
      ) : null}

      <FeedbackPanel />
    </Space>
  );
}
