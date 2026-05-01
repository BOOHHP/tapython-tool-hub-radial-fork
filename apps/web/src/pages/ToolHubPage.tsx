import {
  ApiOutlined,
  AppstoreOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CodeOutlined,
  CopyOutlined,
  DiffOutlined,
  FileProtectOutlined,
  FileSearchOutlined,
  RobotOutlined,
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
import { useEffect, useMemo, useState } from 'react';
import type { FileDiffRow, ManifestDiffRow, ToolFileManifest, ToolManifest, ToolRecord, ToolVersion } from '@tapython-tool-hub/shared';
import { SubmissionWorkbench } from '../features/submissions/SubmissionWorkbench';
import { buildFileDiff, buildManifestDiff } from '../features/tools/diff';
import { riskColor, statusColor } from '../features/tools/display';
import { useToolFilters } from '../hooks/useToolFilters';
import { getApiUrl, getCategories, getRiskLevels, getStatuses, getTools } from '../services/toolRegistry';

const { Header, Content } = Layout;
const { Paragraph, Text, Title } = Typography;

type ViewMode = 'tools' | 'tool' | 'submit';
type ToolViewMode = 'detail' | 'compare';

export function ToolHubPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('tools');
  const [toolViewMode, setToolViewMode] = useState<ToolViewMode>('detail');
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);
  const [toolError, setToolError] = useState<string>();
  const { filteredTools, query, category, riskLevel, status, setQuery, setCategory, setRiskLevel, setStatus } = useToolFilters(tools);
  const categories = useMemo(() => getCategories(tools), [tools]);
  const riskLevels = useMemo(() => getRiskLevels(tools), [tools]);
  const statuses = useMemo(() => getStatuses(tools), [tools]);

  const selectedTool = selectedSlug ? tools.find((tool) => tool.slug === selectedSlug) : undefined;

  useEffect(() => {
    let active = true;
    setLoadingTools(true);
    getTools()
      .then((loadedTools) => {
        if (active) {
          setTools(loadedTools);
          setToolError(undefined);
        }
      })
      .catch((error) => {
        if (active) {
          setToolError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingTools(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

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
        <OverviewStats tools={tools} loading={loadingTools} />
        {toolError ? <Alert className="tool-load-alert" type="error" showIcon message="工具数据加载失败" description={toolError} /> : null}
        {viewMode === 'tools' && (
          <ToolCatalog
            filteredTools={filteredTools}
            loading={loadingTools}
            query={query}
            category={category}
            riskLevel={riskLevel}
            status={status}
            categories={categories}
            riskLevels={riskLevels}
            statuses={statuses}
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
        {viewMode === 'submit' && <SubmissionWorkbench />}
      </Content>
    </Layout>
  );
}

function OverviewStats({ tools, loading }: { tools: ToolRecord[]; loading: boolean }) {
  const latestUpdates = tools.filter((tool) => tool.status === 'approved').length;
  const versionCount = tools.reduce((total, tool) => total + tool.versions.length, 0);

  return (
    <section className="stats-grid" aria-label="Tool Hub summary">
      <Card>
        <Statistic title="工具数量" value={loading ? '-' : tools.length} prefix={<AppstoreOutlined />} />
      </Card>
      <Card>
        <Statistic title="已审核工具" value={loading ? '-' : latestUpdates} prefix={<CheckCircleOutlined />} />
      </Card>
      <Card>
        <Statistic title="版本快照" value={loading ? '-' : versionCount} prefix={<DiffOutlined />} />
      </Card>
      <Card>
        <Statistic title="部署模式" value="LAN MVP" prefix={<SafetyCertificateOutlined />} />
      </Card>
    </section>
  );
}

interface ToolCatalogProps {
  filteredTools: ToolRecord[];
  loading: boolean;
  query: string;
  category?: string;
  riskLevel?: string;
  status?: string;
  categories: string[];
  riskLevels: string[];
  statuses: string[];
  setQuery: (value: string) => void;
  setCategory: (value?: string) => void;
  setRiskLevel: (value?: string) => void;
  setStatus: (value?: string) => void;
  onOpenTool: (tool: ToolRecord) => void;
}

function ToolCatalog({
  filteredTools,
  loading,
  query,
  category,
  riskLevel,
  status,
  categories,
  riskLevels,
  statuses,
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

      {loading ? (
        <Card loading />
      ) : filteredTools.length === 0 ? (
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
                <Button type="link" href={getApiUrl(tool.downloads.latestManifest)} target="_blank" key="manifest">
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
              <Button icon={<FileSearchOutlined />} href={getApiUrl(latestVersion.downloads.markdown)} target="_blank">
                Markdown
              </Button>
            ) : null}
            {latestVersion.downloads.package ? (
              <Button type="primary" icon={<CloudDownloadOutlined />} href={getApiUrl(latestVersion.downloads.package)} target="_blank" download>
                下载 ZIP
              </Button>
            ) : (
              <Button type="primary" icon={<FileSearchOutlined />} href={getApiUrl(latestVersion.downloads.readme)} target="_blank">
                打开 README
              </Button>
            )}
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
  const latestVersion = tool.versions[0];
  const latestManifest = latestVersion.manifest;
  const packageUrl = latestVersion.downloads.package ? getApiUrl(latestVersion.downloads.package) : '';
  const packageSha256 = latestVersion.downloads.packageSha256 || '';
  const packageSize = latestVersion.downloads.packageSize || 0;

  const platform = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'windows';
    if (ua.includes('mac')) return 'macos';
    return 'linux';
  }, []);

  const hubBaseUrl = window.location.origin;
  const aiPrompt = `请帮我从 TAPython Tool Hub 安装工具：${tool.slug}。

1. 先检查本机是否可用 tapython-tool-hub CLI：执行 tapython-tool-hub --version。
2. 如果未安装 CLI，请根据当前操作系统安装 Tool Hub CLI；只安装 CLI，不修改 UE 项目。
3. 安装或确认 CLI 后，读取工具 API：${hubBaseUrl}/api/tools/${tool.slug}.json。
4. 下载 manifest 和 ZIP 包，校验 hash。
5. 先执行 dry-run，展示目标项目路径、将写入的文件、已有文件冲突、MenuConfig.json 合并 diff 和回滚方案。
6. 等我确认后再执行实际安装。

推荐命令：
tapython-tool-hub install ${tool.slug} --hub ${hubBaseUrl} --project "<Project>" --dry-run`;

  const cliInstallCmd = `tapython-tool-hub install ${tool.slug} --hub ${hubBaseUrl} --project "<Project>"`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(aiPrompt);
  };

  return (
    <Card>
      <Alert
        type="warning"
        showIcon
        message="安装前需要预览写入文件和 MenuConfig 合并项"
        description="站点不直接写用户项目目录。手动安装或 Agent 安装都应先确认目标路径、同名工具和 MenuConfig diff。"
      />
      <Divider />
      <div className="install-option-grid">
        <div className="install-option">
          <Space align="start" size={12}>
            <span className="install-option-icon"><RobotOutlined /></span>
            <Space direction="vertical" size={8} className="full-width">
              <Title level={5}>方式一：复制提示词给 AI 助手</Title>
              <Paragraph type="secondary">
                将以下提示词粘贴给任意 AI 助手（Copilot、Claude、Kimi、OpenClaw 等），
                助手会自动检查 CLI、读取 API、校验文件并展示安装计划，待你确认后执行。
              </Paragraph>
              <pre className="code-block ai-prompt-block">{aiPrompt}</pre>
              <Button type="primary" icon={<CopyOutlined />} onClick={handleCopyPrompt}>
                复制 AI 安装提示词
              </Button>
            </Space>
          </Space>
        </div>
        <div className="install-option">
          <Space align="start" size={12}>
            <span className="install-option-icon"><CodeOutlined /></span>
            <Space direction="vertical" size={8} className="full-width">
              <Title level={5}>方式二：终端 CLI 安装</Title>
              <Paragraph type="secondary">
                CLI 默认先展示安装计划并要求确认；AI 助手或 CI 场景可使用 --dry-run 获取预览。
              </Paragraph>
              <pre className="inline-code-block">{cliInstallCmd}</pre>
              <Paragraph type="secondary">
                如果尚未安装 CLI，请先执行：
              </Paragraph>
              {platform === 'windows' ? (
                <pre className="inline-code-block">{`irm ${hubBaseUrl}/install/cli.ps1 | iex`}</pre>
              ) : (
                <pre className="inline-code-block">{`curl -fsSL ${hubBaseUrl}/install/cli.sh | bash -s -- --cli-only`}</pre>
              )}
            </Space>
          </Space>
        </div>
        <div className="install-option">
          <Space align="start" size={12}>
            <span className="install-option-icon"><CloudDownloadOutlined /></span>
            <Space direction="vertical" size={8} className="full-width">
              <Title level={5}>方式三：ZIP 包安装</Title>
              <Paragraph type="secondary">
                完整包包含 manifest、README、tool.md 和工具核心资源，适合手动解压、离线分发或内网镜像。
              </Paragraph>
              {packageUrl ? (
                <Space direction="vertical" size={4}>
                  <Button type="primary" size="small" href={packageUrl} target="_blank" download>
                    下载完整包
                  </Button>
                  {packageSha256 ? (
                    <Space direction="vertical" size={2}>
                      <Text type="secondary" copyable={{ text: packageSha256 }}>
                        sha256: {packageSha256.slice(0, 16)}…
                      </Text>
                      {packageSize > 0 && (
                        <Text type="secondary">大小: {formatBytes(packageSize)}</Text>
                      )}
                    </Space>
                  ) : null}
                </Space>
              ) : <Text type="secondary">当前版本暂无完整包。</Text>}
            </Space>
          </Space>
        </div>
      </div>
      <Divider />
      <Title level={4}>手动安装步骤</Title>
      <Timeline items={tool.summary.installSteps.map((step) => ({ children: step }))} />
      <Title level={4}>MenuConfig 合并项</Title>
      <pre className="code-block">{JSON.stringify(latestManifest.menuConfigMerge.itemsToAdd, null, 2)}</pre>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
                <Button size="small" href={getApiUrl(version.downloads.manifest)} target="_blank">
                  manifest
                </Button>
                <Button size="small" href={getApiUrl(version.downloads.readme)} target="_blank">
                  README
                </Button>
                {version.downloads.package ? (
                  <Button size="small" href={getApiUrl(version.downloads.package)} target="_blank" download>
                    ZIP
                  </Button>
                ) : null}
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

