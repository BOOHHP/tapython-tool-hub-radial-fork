import {
  ApiOutlined,
  AppstoreOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CodeOutlined,
  DiffOutlined,
  FileProtectOutlined,
  FileSearchOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  UploadOutlined
} from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Flex,
  Input,
  Layout,
  List,
  Select,
  Segmented,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { FileDiffRow, ManifestDiffRow, ToolFileManifest, ToolManifest, ToolRecord, ToolVersion } from '@tapython-tool-hub/shared';
import { buildFileDiff, buildManifestDiff } from '../features/tools/diff';
import { riskColor, statusColor } from '../features/tools/display';
import { useToolFilters } from '../hooks/useToolFilters';
import { categories, riskLevels, statuses, tools } from '../services/toolRegistry';

const { Header, Content } = Layout;
const { Paragraph, Text, Title } = Typography;

type ViewMode = 'tools' | 'tool' | 'submit';
type ToolViewMode = 'detail' | 'compare';

export function ToolHubPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('tools');
  const [toolViewMode, setToolViewMode] = useState<ToolViewMode>('detail');
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const { filteredTools, query, category, riskLevel, status, setQuery, setCategory, setRiskLevel, setStatus } = useToolFilters(tools);

  const selectedTool = selectedSlug ? tools.find((tool) => tool.slug === selectedSlug) : undefined;

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Flex align="center" justify="space-between" gap={16} wrap="wrap">
          <Space direction="vertical" size={0}>
            <Text className="eyebrow">TAPython Tool Hub</Text>
            <Title level={3}>编辑器工具分享站</Title>
          </Space>
          <Segmented
            value={viewMode === 'submit' ? 'submit' : 'tools'}
            onChange={(value) => setViewMode(value as 'tools' | 'submit')}
            options={[
              { label: '工具库', value: 'tools', icon: <AppstoreOutlined /> },
              { label: '投稿', value: 'submit', icon: <UploadOutlined /> }
            ]}
          />
        </Flex>
      </Header>
      <Content className="app-content">
        <OverviewStats />
        {viewMode === 'tools' && (
          <ToolCatalog
            filteredTools={filteredTools}
            query={query}
            category={category}
            riskLevel={riskLevel}
            status={status}
            setQuery={setQuery}
            setCategory={setCategory}
            setRiskLevel={setRiskLevel}
            setStatus={setStatus}
            onOpenTool={(tool) => {
              setSelectedSlug(tool.slug);
              setToolViewMode('detail');
              setViewMode('tool');
            }}
          />
        )}
        {viewMode === 'tool' && selectedTool && toolViewMode === 'detail' && (
          <ToolDetail
            tool={selectedTool}
            onBack={() => setViewMode('tools')}
            onCompare={() => setToolViewMode('compare')}
          />
        )}
        {viewMode === 'tool' && selectedTool && toolViewMode === 'compare' && (
          <CompareView tool={selectedTool} onBack={() => setToolViewMode('detail')} />
        )}
        {viewMode === 'submit' && <SubmitGuide />}
      </Content>
    </Layout>
  );
}

function OverviewStats() {
  const latestUpdates = tools.filter((tool) => tool.status === 'approved').length;
  const versionCount = tools.reduce((total, tool) => total + tool.versions.length, 0);

  return (
    <section className="stats-grid" aria-label="Tool Hub summary">
      <Card>
        <Statistic title="工具数量" value={tools.length} prefix={<AppstoreOutlined />} />
      </Card>
      <Card>
        <Statistic title="已审核工具" value={latestUpdates} prefix={<CheckCircleOutlined />} />
      </Card>
      <Card>
        <Statistic title="版本快照" value={versionCount} prefix={<DiffOutlined />} />
      </Card>
      <Card>
        <Statistic title="部署模式" value="LAN MVP" prefix={<SafetyCertificateOutlined />} />
      </Card>
    </section>
  );
}

interface ToolCatalogProps {
  filteredTools: ToolRecord[];
  query: string;
  category?: string;
  riskLevel?: string;
  status?: string;
  setQuery: (value: string) => void;
  setCategory: (value?: string) => void;
  setRiskLevel: (value?: string) => void;
  setStatus: (value?: string) => void;
  onOpenTool: (tool: ToolRecord) => void;
}

function ToolCatalog({
  filteredTools,
  query,
  category,
  riskLevel,
  status,
  setQuery,
  setCategory,
  setRiskLevel,
  setStatus,
  onOpenTool
}: ToolCatalogProps) {
  return (
    <Space direction="vertical" size={16} className="full-width">
      <Card>
        <Flex gap={12} wrap="wrap" align="center">
          <Input.Search
            className="search-input"
            placeholder="搜索工具名、标签、作者、Unreal API 或控件 Aka"
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            className="filter-select"
            allowClear
            placeholder="分类"
            value={category}
            onChange={setCategory}
            options={categories.map((value) => ({ value, label: value }))}
          />
          <Select
            className="filter-select"
            allowClear
            placeholder="风险等级"
            value={riskLevel}
            onChange={setRiskLevel}
            options={riskLevels.map((value) => ({ value, label: value }))}
          />
          <Select
            className="filter-select"
            allowClear
            placeholder="审核状态"
            value={status}
            onChange={setStatus}
            options={statuses.map((value) => ({ value, label: value }))}
          />
        </Flex>
      </Card>

      {filteredTools.length === 0 ? (
        <Card>
          <Empty description="没有找到匹配工具" />
        </Card>
      ) : (
        <section className="tool-grid">
          {filteredTools.map((tool) => (
            <Card
              key={tool.slug}
              className="tool-card"
              title={tool.displayName}
              extra={<Tag color={statusColor[tool.status]}>{tool.status}</Tag>}
              actions={[
                <Button type="link" onClick={() => onOpenTool(tool)} key="detail">
                  查看详情
                </Button>,
                <Button type="link" href={tool.downloads.latestManifest} target="_blank" key="manifest">
                  manifest
                </Button>
              ]}
            >
              <Paragraph className="tool-description">{tool.description}</Paragraph>
              <Space wrap size={[4, 8]}>
                <Tag color="blue">{tool.category}</Tag>
                <Tag color={riskColor[tool.riskLevel]}>风险 {tool.riskLevel}</Tag>
                <Tag>{tool.versions[0]?.version}</Tag>
              </Space>
              <Divider />
              <Space direction="vertical" size={8} className="full-width">
                <Text type="secondary">作者：{tool.author}</Text>
                <Text type="secondary">挂载点：{tool.mountPoint}</Text>
                <Text type="secondary">UE：{tool.compatibility.unrealEngine.join(', ')}</Text>
                <Flex gap={4} wrap="wrap">
                  {tool.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Flex>
              </Space>
            </Card>
          ))}
        </section>
      )}
    </Space>
  );
}

function ToolDetail({ tool, onBack, onCompare }: { tool: ToolRecord; onBack: () => void; onCompare: () => void }) {
  const latestVersion = tool.versions[0];
  const latestManifest = latestVersion.manifest;
  const fileCount = latestManifest.files.length;

  return (
    <Space direction="vertical" size={18} className="full-width detail-page">
      <Flex className="detail-breadcrumb" align="center" gap={8} wrap="wrap">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回
        </Button>
        <Text type="secondary">工具 /</Text>
        <Text>{tool.slug}</Text>
      </Flex>

      <section className="tool-hero">
        <Flex justify="space-between" align="flex-start" gap={20} wrap="wrap">
          <Flex gap={16} align="flex-start" className="tool-hero-main">
            <Avatar className="tool-avatar" shape="square" size={72}>
              {tool.displayName.slice(0, 1).toUpperCase()}
            </Avatar>
            <Space direction="vertical" size={10} className="tool-hero-copy">
              <Space wrap align="center">
                <Title level={1}>{tool.displayName}</Title>
                <Tag icon={<CodeOutlined />} color="blue">
                  TAPython
                </Tag>
                <Tag color={statusColor[tool.status]}>{tool.status}</Tag>
              </Space>
              <Paragraph className="detail-summary">{tool.description}</Paragraph>
              <Paragraph type="secondary" className="source-line">
                数据来源于 <Text strong>{tool.sourceDocument}</Text>，维护团队是 <Text strong>{tool.ownerTeam}</Text>
              </Paragraph>
            </Space>
          </Flex>
          <Space wrap className="hero-actions">
            <Button icon={<StarOutlined />}>收藏</Button>
            <Button icon={<DiffOutlined />} onClick={onCompare}>
              版本对比
            </Button>
            {latestVersion.downloads.markdown ? (
              <Button icon={<FileSearchOutlined />} href={latestVersion.downloads.markdown} target="_blank">
                Markdown
              </Button>
            ) : null}
            <Button type="primary" icon={<CloudDownloadOutlined />} href={latestVersion.downloads.readme} target="_blank">
              获取工具
            </Button>
          </Space>
        </Flex>
      </section>

      <section className="metric-strip" aria-label="Tool release summary">
        <MetricItem label="来源" value={tool.sourceMode ?? 'json'} icon={<FileSearchOutlined />} />
        <MetricItem label="版本" value={`V ${latestVersion.version}`} icon={<Badge status="processing" />} />
        <MetricItem label="安全检测" value={tool.status === 'approved' ? '通过检测' : '待审核'} icon={<SafetyCertificateOutlined />} />
        <MetricItem label="文件数" value={fileCount} icon={<FileProtectOutlined />} />
        <MetricItem label="版本历史" value={tool.versions.length} icon={<DiffOutlined />} />
      </section>

      <ToolSafetyPanel tool={tool} />

      <Card className="detail-tabs-card">
        <Tabs
          size="large"
          items={[
            {
              key: 'overview',
              label: '概述',
              children: <ToolOverview tool={tool} />
            },
            {
              key: 'install',
              label: '安装方式',
              children: <InstallGuide tool={tool} />
            },
            {
              key: 'manifest',
              label: 'Manifest',
              children: <ManifestPanel manifest={latestManifest} />
            },
            {
              key: 'versions',
              label: '版本历史',
              children: <VersionTimeline versions={tool.versions} />
            }
          ]}
        />
      </Card>
    </Space>
  );
}

function MetricItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="metric-item">
      <span className="metric-icon">{icon}</span>
      <div>
        <Text strong>{value}</Text>
        <Text type="secondary">{label}</Text>
      </div>
    </div>
  );
}

function ToolSafetyPanel({ tool }: { tool: ToolRecord }) {
  return (
    <Card className="safety-panel">
      <Flex align="flex-start" gap={14} wrap="wrap">
        <div className="safety-icon"><SafetyCertificateOutlined /></div>
        <Space direction="vertical" size={10} className="safety-content">
          <Space wrap align="center">
            <Title level={4}>安全检测</Title>
            <Tag color={riskColor[tool.riskLevel]}>风险 {tool.riskLevel}</Tag>
          </Space>
          <div className="safety-results">
            <div>
              <Text strong>Manifest 校验</Text>
              <Text type="secondary">文件 hash、安装路径和 MenuConfig 合并项已生成。</Text>
            </div>
            <div>
              <Text strong>安装风险</Text>
              <Text type="secondary">{tool.summary.riskNotes[0] ?? '暂无额外风险说明。'}</Text>
            </div>
          </div>
          <Paragraph type="secondary" className="safety-note">
            检测结果来自当前工具文档与生成 manifest，仅作为安装前参考；写入项目目录前仍需确认目标路径、同名文件和 MenuConfig diff。
          </Paragraph>
        </Space>
      </Flex>
    </Card>
  );
}

function ToolOverview({ tool }: { tool: ToolRecord }) {
  return (
    <Card>
      <Descriptions bordered column={{ xs: 1, md: 2 }} size="small">
        <Descriptions.Item label="工具名">{tool.name}</Descriptions.Item>
        <Descriptions.Item label="分类">{tool.category}</Descriptions.Item>
        <Descriptions.Item label="作者">{tool.author}</Descriptions.Item>
        <Descriptions.Item label="团队">{tool.ownerTeam}</Descriptions.Item>
        <Descriptions.Item label="挂载点">{tool.mountPoint}</Descriptions.Item>
        <Descriptions.Item label="入口 JSON">{tool.entryJson}</Descriptions.Item>
        <Descriptions.Item label="源文档模式">{tool.sourceMode ?? 'json'}</Descriptions.Item>
        <Descriptions.Item label="源文档" span={2}>
          {tool.sourceDocument}
        </Descriptions.Item>
        <Descriptions.Item label="安装路径" span={2}>
          {tool.installPath}
        </Descriptions.Item>
        <Descriptions.Item label="Unreal Engine">{tool.compatibility.unrealEngine.join(', ')}</Descriptions.Item>
        <Descriptions.Item label="TAPython">{tool.compatibility.tapython.join(', ')}</Descriptions.Item>
      </Descriptions>
      <Divider />
      <Col className="two-column-list">
        <Card size="small" title="核心功能">
          <List dataSource={tool.summary.features} renderItem={(item) => <List.Item>{item}</List.Item>} />
        </Card>
        <Card size="small" title="Unreal API">
          <List dataSource={tool.summary.unrealApis} renderItem={(item) => <List.Item>{item}</List.Item>} />
        </Card>
      </Col>
    </Card>
  );
}

function InstallGuide({ tool }: { tool: ToolRecord }) {
  const latestManifest = tool.versions[0].manifest;
  return (
    <Card>
      <Alert
        type="warning"
        showIcon
        message="安装前需要预览写入文件和 MenuConfig 合并项"
        description="站点不直接写用户项目目录。手动安装或 Agent 安装都应先确认目标路径、同名工具和 MenuConfig diff。"
      />
      <Divider />
      <Title level={4}>手动安装</Title>
      <Timeline items={tool.summary.installSteps.map((step) => ({ children: step }))} />
      <Title level={4}>Agent 安装入口</Title>
      <Paragraph>
        Agent 应先读取 <Text code>/api/tools/{tool.slug}.json</Text>，再下载 manifest 和工具包，校验后展示安装预览。
      </Paragraph>
      {tool.versions[0].downloads.markdown ? (
        <Paragraph>
          Markdown-first 工具也可以让 Agent 直接读取 <Text code>{tool.versions[0].downloads.markdown}</Text>，从文档正文、外部文件引用和 manifest
          生成安装计划。
        </Paragraph>
      ) : null}
      <Title level={4}>MenuConfig 合并项</Title>
      <pre className="code-block">{JSON.stringify(latestManifest.menuConfigMerge.itemsToAdd, null, 2)}</pre>
    </Card>
  );
}

function ManifestPanel({ manifest }: { manifest: ToolManifest }) {
  const fileColumns: ColumnsType<ToolFileManifest> = [
    { title: '文件', dataIndex: 'path', key: 'path' },
    { title: 'SHA256', dataIndex: 'sha256', key: 'sha256' },
    { title: '大小', dataIndex: 'size', key: 'size', render: (value) => `${value} B` }
  ];

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Card>
        <Descriptions bordered column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="版本">{manifest.version}</Descriptions.Item>
          <Descriptions.Item label="风险">{manifest.riskLevel}</Descriptions.Item>
          <Descriptions.Item label="安装路径" span={2}>
            {manifest.installPath}
          </Descriptions.Item>
          <Descriptions.Item label="挂载点">{manifest.mountPoint}</Descriptions.Item>
          <Descriptions.Item label="入口 JSON">{manifest.entryJson}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="文件清单">
        <Table rowKey="path" columns={fileColumns} dataSource={manifest.files} pagination={false} size="small" />
      </Card>
      <Card title="完整 Manifest">
        <pre className="code-block">{JSON.stringify(manifest, null, 2)}</pre>
      </Card>
    </Space>
  );
}

function VersionTimeline({ versions }: { versions: ToolVersion[] }) {
  return (
    <Card>
      <Timeline
        items={versions.map((version) => ({
          color: version.breaking ? 'red' : 'blue',
          children: (
            <Space direction="vertical" size={4}>
              <Space wrap>
                <Text strong>{version.version}</Text>
                <Text type="secondary">{version.releasedAt}</Text>
                {version.breaking && <Tag color="red">breaking</Tag>}
              </Space>
              <Text>{version.changeSummary}</Text>
              <Space wrap>
                <Button size="small" href={version.downloads.manifest} target="_blank">
                  manifest
                </Button>
                <Button size="small" href={version.downloads.readme} target="_blank">
                  README
                </Button>
              </Space>
            </Space>
          )
        }))}
      />
    </Card>
  );
}

function CompareView({ tool, onBack }: { tool: ToolRecord; onBack: () => void }) {
  const [fromVersion, setFromVersion] = useState(tool.versions[1]?.version ?? tool.versions[0]?.version);
  const [toVersion, setToVersion] = useState(tool.versions[0]?.version);

  const from = tool.versions.find((version) => version.version === fromVersion) ?? tool.versions[0];
  const to = tool.versions.find((version) => version.version === toVersion) ?? tool.versions[0];
  const fieldRows = buildManifestDiff(from.manifest, to.manifest);
  const fileRows = buildFileDiff(from.manifest.files, to.manifest.files);

  const fieldColumns: ColumnsType<ManifestDiffRow> = [
    { title: '字段', dataIndex: 'label', key: 'label', width: 180 },
    { title: `From ${from.version}`, dataIndex: 'fromValue', key: 'fromValue' },
    { title: `To ${to.version}`, dataIndex: 'toValue', key: 'toValue' },
    {
      title: '状态',
      dataIndex: 'changed',
      key: 'changed',
      width: 100,
      render: (changed: boolean) => (changed ? <Tag color="orange">changed</Tag> : <Tag>same</Tag>)
    }
  ];

  const fileColumns: ColumnsType<FileDiffRow> = [
    { title: '文件', dataIndex: 'path', key: 'path' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value) => <Tag color={value === 'unchanged' ? 'default' : value === 'added' ? 'green' : value === 'removed' ? 'red' : 'orange'}>{value}</Tag>
    },
    { title: 'From Hash', dataIndex: 'fromHash', key: 'fromHash' },
    { title: 'To Hash', dataIndex: 'toHash', key: 'toHash' }
  ];

  return (
    <Space direction="vertical" size={16} className="full-width detail-page">
      <Flex className="detail-breadcrumb" align="center" gap={8} wrap="wrap">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回详情
        </Button>
        <Text type="secondary">工具 /</Text>
        <Text>{tool.slug}</Text>
        <Text type="secondary">/ 版本对比</Text>
      </Flex>
      <Card>
        <Flex gap={12} wrap="wrap" align="center">
          <Text strong>工具：</Text>
          <Tag color="blue">{tool.displayName}</Tag>
          <Select
            className="version-select"
            value={fromVersion}
            onChange={setFromVersion}
            options={tool.versions.map((version) => ({ value: version.version, label: version.version }))}
          />
          <Text>对比到</Text>
          <Select
            className="version-select"
            value={toVersion}
            onChange={setToVersion}
            options={tool.versions.map((version) => ({ value: version.version, label: version.version }))}
          />
        </Flex>
      </Card>
      <Card title="Manifest 字段差异">
        <Table rowKey="key" columns={fieldColumns} dataSource={fieldRows} pagination={false} size="small" />
      </Card>
      <Card title="ZIP 包级文件差异">
        <Table rowKey="path" columns={fileColumns} dataSource={fileRows} pagination={false} size="small" />
      </Card>
    </Space>
  );
}

function SubmitGuide() {
  return (
    <Space direction="vertical" size={16} className="full-width">
      <Card title="MVP 投稿流程">
        <Timeline
          items={[
            { children: '按工具文档规范准备 README、MenuConfig 片段、UI JSON、Python Controller 和 manifest。' },
            { children: '将工具包提交给维护者或放入内网共享目录。' },
            { children: '维护者校验结构、兼容性、风险说明和版本记录。' },
            { children: '构建脚本生成工具索引、静态 API、manifest 快照和下载入口。' }
          ]}
        />
      </Card>
      <Card title="必填检查项">
        <List
          dataSource={[
            '工具名、版本、作者、分类、标签和兼容版本完整。',
            'ZIP 内包含工具目录、README、manifest 和 MenuConfig.snippet.json。',
            '风险等级和不可撤销操作说明清楚。',
            'Agent 安装前必须展示文件写入和 MenuConfig diff。'
          ]}
          renderItem={(item) => <List.Item><InfoCircleOutlined /> {item}</List.Item>}
        />
      </Card>
    </Space>
  );
}

