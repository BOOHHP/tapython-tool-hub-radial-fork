import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Row, Skeleton, Space, Statistic, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import {
  getContributionStats,
  getPlatformStats,
  getProcessStats,
  StatsAccessError,
  type ContributionStats,
  type NameCount,
  type PlatformStats,
  type ProcessStats
} from '../../services/stats';

const { Paragraph, Text, Title } = Typography;

export function StatsPageHeader({ onBack }: { onBack: () => void }) {
  return (
    <section className="view-return-panel" aria-label="Stats page navigation">
      <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回工具库</Button>
      <div className="view-return-copy">
        <Text className="eyebrow">Dashboard</Text>
        <Title level={4}>数据看板</Title>
        <Text type="secondary">平台使用情况与团队、个人的贡献。仅分项展示，不做综合评分。</Text>
      </div>
    </section>
  );
}

type Loaded<T> = { state: 'loading' } | { state: 'login' } | { state: 'denied' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

function useStats<T>(load: () => Promise<T>): Loaded<T> {
  const [result, setResult] = useState<Loaded<T>>({ state: 'loading' });
  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setResult({ state: 'ready', data }))
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof StatsAccessError) setResult({ state: error.status === 401 ? 'login' : 'denied' });
        else setResult({ state: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return result;
}

export function StatsDashboard() {
  const platform = useStats(getPlatformStats);
  const contribution = useStats(getContributionStats);
  const process = useStats(getProcessStats);

  if (platform.state === 'login') {
    return <Alert type="info" showIcon message="请先登录" description="数据看板仅对已登录成员开放，请点击页面右上角的圆形按钮，使用飞书登录。" />;
  }

  return (
    <Tabs
      items={[
        { key: 'platform', label: '平台概览', children: <Panel result={platform} render={(data) => <PlatformView stats={data} />} /> },
        { key: 'contribution', label: '贡献', children: <Panel result={contribution} render={(data) => <ContributionView stats={data} />} /> },
        ...(process.state === 'denied' || process.state === 'login'
          ? []
          : [{ key: 'process', label: '审核流程', children: <Panel result={process} render={(data) => <ProcessView stats={data} />} /> }])
      ]}
    />
  );
}

function Panel<T>({ result, render }: { result: Loaded<T>; render: (data: T) => JSX.Element }) {
  if (result.state === 'loading') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (result.state === 'error') return <Alert type="error" showIcon message={result.message} />;
  if (result.state !== 'ready') return <Empty description="暂无权限" />;
  return render(result.data);
}

function BarList({ rows, unit = '' }: { rows: Array<{ label: string; value: number; hint?: string }>; unit?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />;
  return (
    <div className="stat-bars">
      {rows.map((row) => (
        <div key={row.label} className="stat-bar-row">
          <Tooltip title={row.hint ?? row.label}><Text ellipsis className="stat-bar-label">{row.label}</Text></Tooltip>
          <div className="stat-bar-track"><div className="stat-bar-fill" style={{ width: `${(row.value / max) * 100}%` }} /></div>
          <Text className="stat-bar-value">{row.value}{unit}</Text>
        </div>
      ))}
    </div>
  );
}

function Columns({ points, label }: { points: Array<{ key: string; value: number }>; label: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <div className="stat-columns" role="img" aria-label={label}>
      {points.map((point) => (
        <Tooltip key={point.key} title={`${point.key}：${point.value}`}>
          <div className="stat-column-slot"><div className="stat-column" style={{ height: `${Math.max(point.value > 0 ? 6 : 0, (point.value / max) * 100)}%` }} /></div>
        </Tooltip>
      ))}
    </div>
  );
}

const nameCounts = (rows: NameCount[]) => rows.map((row) => ({ label: row.name, value: row.count }));

function PlatformView({ stats }: { stats: PlatformStats }) {
  return (
    <Space direction="vertical" size={18} className="full-width">
      <Row gutter={[18, 18]}>
        <Col xs={12} md={8} xl={4}><Card><Statistic title="工具" value={stats.tools.total} /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card><Statistic title="已发布版本" value={stats.tools.versions} /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card><Statistic title="累计下载次数" value={stats.downloads.total} /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card><Statistic title="近 30 天下载" value={stats.downloads.last30Days} /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card><Statistic title="近 30 天活跃设备" value={stats.reach.devices30d} /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card><Statistic title="近 30 天安装" value={stats.reach.installs30d} /></Card></Col>
      </Row>
      {stats.reach.devices30d === 0 && stats.reach.installs30d === 0 ? (
        <Alert type="info" showIcon message="安装与活跃设备数据尚未开始" description="这两项来自 Installer / CLI 上报的事件，新版本发布后会自动出现；下载次数由服务器直接统计，每次下载都计一次。" />
      ) : null}
      <Card title="近 30 天下载次数">
        <Columns label="近 30 天每日下载" points={stats.downloads.daily.map((point) => ({ key: point.day, value: point.downloads }))} />
        <Text type="secondary">每次下载都计一次，日期按东八区计算。</Text>
      </Card>
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={12}><Card title="热门工具（近 30 天）"><BarList unit=" 次" rows={stats.downloads.topLast30Days.map((tool) => ({ label: tool.name, hint: tool.slug, value: tool.downloads }))} /></Card></Col>
        <Col xs={24} xl={12}><Card title="热门工具（累计）"><BarList unit=" 次" rows={stats.downloads.topAllTime.map((tool) => ({ label: tool.name, hint: tool.slug, value: tool.downloads }))} /></Card></Col>
        <Col xs={24} xl={8}><Card title="按分类"><BarList rows={nameCounts(stats.tools.byCategory)} /></Card></Col>
        <Col xs={24} xl={8}><Card title="按团队（工具归属团队）"><BarList rows={nameCounts(stats.tools.byTeam)} /></Card></Col>
        <Col xs={24} xl={8}>
          <Card title="每月发布版本数">
            <BarList rows={stats.releasesByMonth.map((row) => ({ label: row.month, value: row.versions }))} />
          </Card>
        </Col>
      </Row>
      <Text type="secondary">数据生成时间：{new Date(stats.generatedAt).toLocaleString()}</Text>
    </Space>
  );
}

const numeric = <K extends string>(key: K) => <T extends Record<K, number>>(a: T, b: T) => a[key] - b[key];

function ContributionView({ stats }: { stats: ContributionStats }) {
  const teamColumns: ColumnsType<ContributionStats['teams'][number]> = [
    { title: '团队', dataIndex: 'team' },
    { title: '工具', dataIndex: 'tools', sorter: numeric('tools'), defaultSortOrder: 'descend' },
    { title: '版本', dataIndex: 'versions', sorter: numeric('versions') },
    { title: '下载次数', dataIndex: 'downloads', sorter: numeric('downloads') },
    { title: '最近更新', dataIndex: 'lastUpdated', render: (value: string | null) => value ?? '-' }
  ];
  const personColumns: ColumnsType<ContributionStats['people'][number]> = [
    { title: '姓名', dataIndex: 'name' },
    { title: '团队', dataIndex: 'team', render: (value: string | null) => value ?? '-' },
    { title: '工具', dataIndex: 'tools', sorter: numeric('tools'), defaultSortOrder: 'descend' },
    { title: '版本', dataIndex: 'versions', sorter: numeric('versions') },
    { title: '下载次数', dataIndex: 'downloads', sorter: numeric('downloads') },
    { title: '审核次数', dataIndex: 'reviews', sorter: numeric('reviews') },
    { title: '署名', dataIndex: 'aliases', render: (aliases: string[]) => aliases.length ? <Space wrap>{aliases.map((alias) => <Tag key={alias}>{alias}</Tag>)}</Space> : '-' }
  ];
  const nameColumns: ColumnsType<ContributionStats['unbound'][number]> = [
    { title: '名称', dataIndex: 'name' },
    { title: '工具', dataIndex: 'tools', sorter: numeric('tools'), defaultSortOrder: 'descend' },
    { title: '版本', dataIndex: 'versions', sorter: numeric('versions') },
    { title: '下载次数', dataIndex: 'downloads', sorter: numeric('downloads') }
  ];

  return (
    <Space direction="vertical" size={18} className="full-width">
      <Card title="团队">
        <Paragraph type="secondary">按工具声明的归属团队汇总；下载次数是这些工具所有版本被下载的总次数。</Paragraph>
        <Table rowKey="team" size="middle" columns={teamColumns} dataSource={stats.teams} pagination={false} scroll={{ x: 600 }} />
      </Card>
      <Card title="个人">
        <Paragraph type="secondary">按版本作者统计，作者署名需由管理员绑定到具体人员；审核次数从启用飞书登录后开始累计（此前共 {stats.legacyReviews} 次审核无具体评审人）。</Paragraph>
        <Table rowKey="openId" size="middle" columns={personColumns} dataSource={stats.people} pagination={{ pageSize: 15, hideOnSinglePage: true }} scroll={{ x: 800 }} locale={{ emptyText: <Empty description="还没有绑定到个人的署名" /> }} />
      </Card>
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={12}>
          <Card title="以团队名义署名">
            <Table rowKey="name" size="small" columns={nameColumns} dataSource={stats.teamAuthors} pagination={false} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无" /> }} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="尚未绑定的署名">
            <Paragraph type="secondary">管理员可在“后台管理 - 人员管理”里把这些名称绑定到人员或团队。</Paragraph>
            <Table rowKey="name" size="small" columns={nameColumns} dataSource={stats.unbound} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="全部已绑定" /> }} />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

const statusLabels: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝', draft: '草稿' };
const hours = (value: number | null) => (value === null ? '-' : value >= 48 ? `${(value / 24).toFixed(1)} 天` : `${value.toFixed(1)} 小时`);

function ProcessView({ stats }: { stats: ProcessStats }) {
  return (
    <Space direction="vertical" size={18} className="full-width">
      <Row gutter={[18, 18]}>
        <Col xs={12} xl={6}><Card><Statistic title="待审核" value={stats.pending.count} /></Card></Col>
        <Col xs={12} xl={6}><Card><Statistic title="最早待审已等待" value={hours(stats.pending.oldestAgeHours)} /></Card></Col>
        <Col xs={12} xl={6}><Card><Statistic title="通过率" value={stats.review.approvalRate === null ? '-' : `${Math.round(stats.review.approvalRate * 100)}%`} /></Card></Col>
        <Col xs={12} xl={6}><Card><Statistic title="首次审核用时（中位）" value={hours(stats.review.firstReviewHours.median)} /></Card></Col>
      </Row>
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={10}><Card title="投稿状态"><BarList rows={stats.submissions.byStatus.map((row) => ({ label: statusLabels[row.status] ?? row.status, value: row.count }))} /></Card></Col>
        <Col xs={24} xl={14}>
          <Card title="近 12 周投稿数">
            <Columns label="近 12 周每周投稿" points={stats.submissions.weekly.map((row) => ({ key: row.week, value: row.submissions }))} />
          </Card>
        </Col>
      </Row>
      <Text type="secondary">首次审核用时基于 {stats.review.firstReviewHours.samples} 条有审核记录的投稿；通过率 = 通过 / （通过 + 拒绝）。</Text>
    </Space>
  );
}
