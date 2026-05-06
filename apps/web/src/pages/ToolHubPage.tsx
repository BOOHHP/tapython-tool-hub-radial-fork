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
  Checkbox,
  Col,
  Collapse,
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
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import type { FileDiffRow, ManifestDiffRow, ToolFileManifest, ToolManifest, ToolRecord, ToolVersion } from '@tapython-tool-hub/shared';
import { SubmissionWorkbench } from '../features/submissions/SubmissionWorkbench';
import { buildFileDiff, buildManifestDiff } from '../features/tools/diff';
import { riskColor, statusColor } from '../features/tools/display';
import { useToolFilters } from '../hooks/useToolFilters';
import { getApiBaseUrl, getApiUrl, getCategories, getRiskLevels, getStatuses, getTools } from '../services/toolRegistry';

const { Header, Content } = Layout;
const { Paragraph, Text, Title } = Typography;

type ViewMode = 'tools' | 'tool' | 'submit';
type ToolViewMode = 'detail' | 'compare';
type InstallMode = 'ai' | 'cli' | 'zip';
type CliPlatform = 'posix' | 'windows' | 'download';

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
  const goHome = () => {
    setSelectedSlug(undefined);
    setToolViewMode('detail');
    setViewMode('tools');
  };

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
        <Flex align="center" justify="space-between" gap={16} wrap="wrap" className="app-header-inner">
          <Flex
            align="center"
            gap={12}
            className="brand-lockup brand-lockup-interactive"
            role="button"
            tabIndex={0}
            aria-label="返回工具库主页"
            onClick={goHome}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                goHome();
              }
            }}
          >
            <span className="brand-mark"><ApiOutlined /></span>
            <Space direction="vertical" size={0}>
              <Text className="eyebrow">TAPython Tool Hub</Text>
              <Title level={3}>Unreal 编辑器工具库</Title>
              <Text type="secondary" className="header-subtitle">面向 TAPython / Unreal Editor 的工具发布与安装审计</Text>
            </Space>
          </Flex>
        </Flex>
      </Header>
      <Content className="app-content">
        {viewMode === 'tools' ? (
          <RegistryHero
            tools={tools}
            loading={loadingTools}
            onBrowse={() => scrollToElement('tool-catalog')}
            onSubmit={() => setViewMode('submit')}
          />
        ) : null}
        {viewMode === 'submit' ? <SubmitPageHeader onBack={goHome} /> : null}
        {viewMode === 'tools' ? <OverviewStats tools={tools} loading={loadingTools} /> : null}
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
            totalTools={tools}
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

function scrollToElement(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  const top = element.getBoundingClientRect().top + window.scrollY - 18;
  window.scrollTo({ top, behavior: 'smooth' });
}

function SubmitPageHeader({ onBack }: { onBack: () => void }) {
  return (
    <section className="view-return-panel" aria-label="Submission page navigation">
      <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回工具库</Button>
      <div className="view-return-copy">
        <Text className="eyebrow">Submission Console</Text>
        <Title level={4}>提交或发布工具</Title>
        <Text type="secondary">处理新工具入库、版本发布、资源校验和审核流转。</Text>
      </div>
    </section>
  );
}

function RegistryHero({ tools, loading, onBrowse, onSubmit }: { tools: ToolRecord[]; loading: boolean; onBrowse: () => void; onSubmit: () => void }) {
  const approvedTools = tools.filter((tool) => tool.status === 'approved').length;
  const pendingTools = tools.filter((tool) => tool.status === 'pending').length;

  return (
    <section className="registry-hero" aria-label="Tool registry overview">
      <div className="registry-hero-copy">
        <Text className="eyebrow">Unreal Engine Channel</Text>
        <Title level={2}>即插即用的编辑器工具内容库</Title>
        <Paragraph>
          为 Unreal Editor 工作流收集、审核和分发 TAPython 工具；可先预览 Manifest、风险和安装计划，再选择 AI、CLI 或 ZIP 获取。
        </Paragraph>
        <div className="channel-proof-list">
          <span><CheckCircleOutlined /> 审核通过后发布</span>
          <span><CheckCircleOutlined /> 版本与文件 hash 可追溯</span>
          <span><CheckCircleOutlined /> 可直接用于编辑器项目</span>
        </div>
        <div className="channel-tags" aria-label="Unreal tool tags">
          {['EditorUtilities', 'Plugin', 'Python', 'MenuConfig', 'UMG', 'Level', 'Pipeline'].map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </div>
        <Space wrap>
          <Button type="primary" icon={<AppstoreOutlined />} onClick={onBrowse}>浏览工具库</Button>
          <Button icon={<UploadOutlined />} onClick={onSubmit}>提交或发布工具</Button>
        </Space>
      </div>
      <div className="registry-hero-panel" aria-label="Registry health summary">
        <div>
          <Text type="secondary">已发布</Text>
          <Text strong>{loading ? '-' : approvedTools}</Text>
        </div>
        <div>
          <Text type="secondary">待审核</Text>
          <Text strong>{loading ? '-' : pendingTools}</Text>
        </div>
        <div>
          <Text type="secondary">安装通道</Text>
          <Text strong>AI / CLI / ZIP</Text>
        </div>
      </div>
    </section>
  );
}

function OverviewStats({ tools, loading }: { tools: ToolRecord[]; loading: boolean }) {
  const latestUpdates = tools.filter((tool) => tool.status === 'approved').length;
  const versionCount = tools.reduce((total, tool) => total + tool.versions.length, 0);

  return (
    <section className="stats-grid" aria-label="Tool Hub summary">
      <div className="stats-pill">
        <AppstoreOutlined />
        <Text type="secondary">工具</Text>
        <Text strong>{loading ? '-' : tools.length}</Text>
      </div>
      <div className="stats-pill">
        <CheckCircleOutlined />
        <Text type="secondary">已审核</Text>
        <Text strong>{loading ? '-' : latestUpdates}</Text>
      </div>
      <div className="stats-pill">
        <DiffOutlined />
        <Text type="secondary">版本</Text>
        <Text strong>{loading ? '-' : versionCount}</Text>
      </div>
      <div className="stats-pill">
        <SafetyCertificateOutlined />
        <Text type="secondary">部署</Text>
        <Text strong>LAN MVP</Text>
      </div>
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
  totalTools: ToolRecord[];
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
  totalTools,
  setQuery,
  setCategory,
  setRiskLevel,
  setStatus,
  onOpenTool
}: ToolCatalogProps) {
  const activeFilterCount = [query.trim(), category, riskLevel, status].filter(Boolean).length;
  const categoryCounts = categories.map((item) => ({
    category: item,
    count: totalTools.filter((tool) => tool.category === item).length
  }));
  const resetFilters = () => {
    setQuery('');
    setCategory(undefined);
    setRiskLevel(undefined);
    setStatus(undefined);
  };

  return (
    <section className="marketplace-layout" id="tool-catalog">
      <aside className="channel-sidebar" aria-label="Tool categories">
        <Title level={3}>Unreal Tools</Title>
        <Text className="sidebar-section-label">产品类型</Text>
        <button className={`sidebar-row${category ? '' : ' sidebar-row-active'}`} type="button" onClick={() => setCategory(undefined)}>
          <span>所有工具</span>
          <span>{totalTools.length}</span>
        </button>
        {categoryCounts.map((item) => (
          <button
            className={`sidebar-row${category === item.category ? ' sidebar-row-active' : ''}`}
            type="button"
            key={item.category}
            onClick={() => setCategory(item.category)}
          >
            <span>{item.category}</span>
            <span>{item.count}</span>
          </button>
        ))}
        <Divider />
        <Text className="sidebar-section-label">安装方式</Text>
        <div className="sidebar-chip-list">
          <Tag>AI</Tag>
          <Tag>CLI</Tag>
          <Tag>ZIP</Tag>
        </div>
      </aside>

      <Space direction="vertical" size={16} className="full-width shelf-content">
        <Card className="catalog-toolbar">
          <Flex justify="space-between" align="center" gap={12} wrap="wrap" className="catalog-toolbar-header">
            <Space direction="vertical" size={0}>
              <Title level={4}>精选 Unreal 编辑器工具</Title>
              <Text type="secondary">按名称、分类、风险和审核状态快速定位可安装工具。</Text>
            </Space>
            <Space wrap>
              {activeFilterCount > 0 ? <Button size="small" onClick={resetFilters}>清空筛选</Button> : null}
              <Tag>{filteredTools.length} 个结果</Tag>
            </Space>
          </Flex>
          <Flex gap={12} wrap="wrap" align="center">
            <Input.Search
              className="search-input"
              aria-label="搜索工具"
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
                title={(
                  <Flex align="center" gap={14} className="tool-card-title">
                    <span className="tool-card-mark">{tool.displayName.slice(0, 1).toUpperCase()}</span>
                    <div className="tool-card-title-copy">
                      <Text strong className="tool-card-name">{tool.displayName}</Text>
                      <Text type="secondary" className="tool-card-author">{tool.author}</Text>
                    </div>
                  </Flex>
                )}
                extra={<Tag className="tool-card-status" color={statusColor[tool.status]}>{tool.status}</Tag>}
              >
                <Paragraph className="tool-description">{tool.description}</Paragraph>
                <div className="tool-meta-grid">
                  <div>
                    <Text type="secondary">版本</Text>
                    <Text strong>{tool.versions[0]?.version ?? '-'}</Text>
                  </div>
                  <div>
                    <Text type="secondary">风险</Text>
                    <Tag color={riskColor[tool.riskLevel]}>风险 {tool.riskLevel}</Tag>
                  </div>
                  <div>
                    <Text type="secondary">挂载点</Text>
                    <Text>{tool.mountPoint}</Text>
                  </div>
                  <div>
                    <Text type="secondary">UE</Text>
                    <Text>{tool.compatibility.unrealEngine.join(', ')}</Text>
                  </div>
                </div>
                <Space wrap size={[4, 8]} className="tool-card-category-row">
                  <Tag>{tool.category}</Tag>
                  <Tag>{tool.ownerTeam}</Tag>
                </Space>
                <div className="tool-card-footer">
                  <Space direction="vertical" size={6} className="tool-card-footer-meta">
                    <Text type="secondary">{tool.slug}</Text>
                    <Flex gap={4} wrap="wrap">
                      {tool.tags.slice(0, 4).map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                      {tool.tags.length > 4 ? <Tag>+{tool.tags.length - 4}</Tag> : null}
                    </Flex>
                  </Space>
                  <Button type="primary" onClick={() => onOpenTool(tool)}>
                    查看详情
                  </Button>
                </div>
              </Card>
            ))}
          </section>
        )}
      </Space>
    </section>
  );
}

function ToolDetail({ tool, onBack, onCompare }: { tool: ToolRecord; onBack: () => void; onCompare: () => void }) {
  const latestVersion = tool.versions[0];
  const latestManifest = latestVersion.manifest;
  const fileCount = latestManifest.files.length;

  return (
    <Space direction="vertical" size={18} className="full-width detail-page">
      <Flex className="detail-breadcrumb" align="center" gap={8} wrap="wrap">
        <Button className="detail-back-button" icon={<ArrowLeftOutlined />} onClick={onBack}>
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
        <Descriptions.Item label="源文档" span={{ xs: 1, md: 2 }}>
          {tool.sourceDocument}
        </Descriptions.Item>
        <Descriptions.Item label="安装路径" span={{ xs: 1, md: 2 }}>
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
  const [messageApi, contextHolder] = message.useMessage();
  const [installMode, setInstallMode] = useState<InstallMode>('ai');
  const [cliPlatform, setCliPlatform] = useState<CliPlatform>('posix');
  const [checkedSteps, setCheckedSteps] = useState<string[]>([]);
  const [fallbackCopyText, setFallbackCopyText] = useState('');
  const latestVersion = tool.versions[0];
  const latestManifest = latestVersion.manifest;
  const packageUrl = latestVersion.downloads.package ? getApiUrl(latestVersion.downloads.package) : '';
  const packageSha256 = latestVersion.downloads.packageSha256 || '';
  const packageSize = latestVersion.downloads.packageSize || 0;
  const hubBaseUrl = getApiBaseUrl();
  const aiPrompt = `请帮我从 TAPython Tool Hub 安装工具：${tool.slug}。

1. 先检查本机是否可用 tapython-tool-hub CLI：执行 tapython-tool-hub --version。
2. 如果未安装 CLI，请根据当前操作系统安装 Tool Hub CLI；只安装 CLI，不修改 UE 项目。
3. 安装或确认 CLI 后，读取工具 API：${hubBaseUrl}/api/tools/${tool.slug}.json。
4. 下载 manifest 和 ZIP 包，校验 hash。
5. 先执行 dry-run，展示目标项目路径、将写入的文件、已有文件冲突、MenuConfig.json 合并 diff 和回滚方案。
6. 等我确认后再执行实际安装。

推荐命令：
tapython-tool-hub install ${tool.slug} --hub ${hubBaseUrl} --project "<Project>" --dry-run`;

  const cliDryRunCmd = `tapython-tool-hub install ${tool.slug} --hub ${hubBaseUrl} --project "<Project>" --dry-run`;
  const cliInstallCmd = `tapython-tool-hub install ${tool.slug} --hub ${hubBaseUrl} --project "<Project>"`;
  const cliBootstrapCommands: Record<CliPlatform, string> = {
    posix: `curl -fsSL ${hubBaseUrl}/install/cli.sh | bash -s -- --cli-only`,
    windows: `irm ${hubBaseUrl}/install/cli.ps1 | iex`,
    download: `${hubBaseUrl}/downloads/cli/latest`
  };
  const packageChecklist = [
    { label: 'manifest', ok: Boolean(latestVersion.downloads.manifest) },
    { label: 'README', ok: Boolean(latestVersion.downloads.readme) },
    { label: 'tool.md', ok: Boolean(latestVersion.downloads.markdown) },
    { label: 'MenuConfig', ok: latestManifest.menuConfigMerge.itemsToAdd.length > 0 },
    { label: 'Python', ok: latestManifest.files.some((file) => file.path.toLowerCase().endsWith('.py')) },
    { label: 'UI JSON', ok: latestManifest.files.some((file) => file.path.toLowerCase().endsWith('.json')) }
  ];
  const manualStepOptions = tool.summary.installSteps.map((step, index) => ({ label: step, value: `${index}` }));

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFallbackCopyText('');
      messageApi.success(successMessage);
    } catch {
      setFallbackCopyText(text);
      messageApi.warning('剪贴板写入失败，请从下方文本框手动选择复制。');
    }
  };

  return (
    <Card>
      {contextHolder}
      <Alert
        type="warning"
        showIcon
        message="先预览，再安装"
        description="站点不直接写用户项目目录。手动安装或 Agent 安装都应先确认目标路径、同名工具和 MenuConfig diff。"
      />
      <Divider />
      <Segmented
        block
        className="install-mode-selector"
        value={installMode}
        onChange={(value) => setInstallMode(value as InstallMode)}
        options={[
          { label: 'AI 帮我安装', value: 'ai', icon: <RobotOutlined /> },
          { label: '终端安装', value: 'cli', icon: <CodeOutlined /> },
          { label: '下载 ZIP', value: 'zip', icon: <CloudDownloadOutlined /> }
        ]}
      />
      <div className="install-option-grid install-option-grid-single">
        {installMode === 'ai' ? (
        <div className="install-option install-option-active">
          <Space align="start" size={12}>
            <span className="install-option-icon"><RobotOutlined /></span>
            <Space direction="vertical" size={8} className="full-width">
              <Title level={5}>我想让 AI 帮我安装</Title>
              <Paragraph type="secondary">
                复制提示词后，AI 助手会使用 Hub API：<Text code>{hubBaseUrl}</Text>。
              </Paragraph>
              <pre className="code-block ai-prompt-block">{aiPrompt}</pre>
              <Button type="primary" icon={<CopyOutlined />} onClick={() => void copyText(aiPrompt, 'AI 安装提示词已复制')}>
                复制 AI 安装提示词
              </Button>
              <Collapse
                ghost
                items={[{
                  key: 'ai-details',
                  label: '查看完整步骤',
                  children: <Timeline items={[
                    { children: '检查 tapython-tool-hub CLI 是否可用。' },
                    { children: '读取工具 API、manifest 和 ZIP 包。' },
                    { children: '校验 sha256，并先输出 dry-run 安装计划。' },
                    { children: '确认目标项目、写入文件和 MenuConfig diff 后再安装。' }
                  ]} />
                }]}
              />
            </Space>
          </Space>
        </div>
        ) : null}
        {installMode === 'cli' ? (
        <div className="install-option install-option-active">
          <Space align="start" size={12}>
            <span className="install-option-icon"><CodeOutlined /></span>
            <Space direction="vertical" size={8} className="full-width">
              <Title level={5}>终端安装，适合可运行命令的项目环境</Title>
              <Paragraph type="secondary">
                建议先复制 dry-run 命令预览安装计划，再执行安装命令。
              </Paragraph>
              <Text strong>预览命令</Text>
              <pre className="inline-code-block">{cliDryRunCmd}</pre>
              <Button icon={<CopyOutlined />} onClick={() => void copyText(cliDryRunCmd, 'dry-run 命令已复制')}>复制预览命令</Button>
              <Text strong>安装命令</Text>
              <pre className="inline-code-block">{cliInstallCmd}</pre>
              <Button icon={<CopyOutlined />} onClick={() => void copyText(cliInstallCmd, '安装命令已复制')}>复制安装命令</Button>
              <Divider className="compact-divider" />
              <Text strong>如果尚未安装 CLI</Text>
              <Segmented
                value={cliPlatform}
                onChange={(value) => setCliPlatform(value as CliPlatform)}
                options={[
                  { label: 'macOS/Linux', value: 'posix' },
                  { label: 'Windows PowerShell', value: 'windows' },
                  { label: '仅下载 CLI 包', value: 'download' }
                ]}
              />
              <pre className="inline-code-block">{cliBootstrapCommands[cliPlatform]}</pre>
              <Button icon={<CopyOutlined />} onClick={() => void copyText(cliBootstrapCommands[cliPlatform], 'CLI 获取命令已复制')}>复制 CLI 命令</Button>
            </Space>
          </Space>
        </div>
        ) : null}
        {installMode === 'zip' ? (
        <div className="install-option install-option-active">
          <Space align="start" size={12}>
            <span className="install-option-icon"><CloudDownloadOutlined /></span>
            <Space direction="vertical" size={8} className="full-width">
              <Title level={5}>下载 ZIP，适合离线或手动审计</Title>
              <Paragraph type="secondary">
                下载后先核对 sha256，再按清单逐项确认文件和 MenuConfig 合并项。
              </Paragraph>
              {packageUrl ? (
                <Space direction="vertical" size={4}>
                  <Button type="primary" size="small" href={packageUrl} target="_blank" download>
                    下载完整包
                  </Button>
                  {packageSha256 ? (
                    <Space direction="vertical" size={2}>
                      <Text type="secondary">
                        sha256: {packageSha256.slice(0, 16)}…
                      </Text>
                      <Button size="small" icon={<CopyOutlined />} onClick={() => void copyText(packageSha256, 'sha256 已复制')}>复制 sha256</Button>
                      {packageSize > 0 && (
                        <Text type="secondary">大小: {formatBytes(packageSize)}</Text>
                      )}
                    </Space>
                  ) : null}
                </Space>
              ) : <Text type="secondary">当前版本暂无完整包。</Text>}
              <div className="zip-checklist">
                {packageChecklist.map((item) => (
                  <Tag key={item.label} color={item.ok ? 'green' : 'default'}>{item.label}{item.ok ? ' 已包含' : ' 未发现'}</Tag>
                ))}
              </div>
            </Space>
          </Space>
        </div>
        ) : null}
      </div>
      {fallbackCopyText ? (
        <Input.TextArea className="copy-fallback" rows={4} value={fallbackCopyText} readOnly />
      ) : null}
      <Divider />
      <Title level={4}>手动安装步骤</Title>
      <Checkbox.Group
        className="manual-step-checklist"
        value={checkedSteps}
        options={manualStepOptions}
        onChange={(values) => setCheckedSteps(values.map(String))}
      />
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
  const [messageApi, contextHolder] = message.useMessage();
  const manifestText = JSON.stringify(manifest, null, 2);
  const fileColumns: ColumnsType<ToolFileManifest> = [
    { title: '文件', dataIndex: 'path', key: 'path', render: (value: string) => <Text className="diff-inline-code">{value}</Text> },
    { title: 'SHA256', dataIndex: 'sha256', key: 'sha256', render: renderHashValue },
    { title: '大小', dataIndex: 'size', key: 'size', width: 120, render: (value) => `${value} B` }
  ];

  const copyManifest = async () => {
    try {
      await navigator.clipboard.writeText(manifestText);
      messageApi.success('Manifest 已复制');
    } catch {
      messageApi.warning('剪贴板写入失败，请从完整 Manifest 面板中手动选择复制。');
    }
  };

  return (
    <Space direction="vertical" size={16} className="full-width">
      {contextHolder}
      <Card>
        <Descriptions bordered column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="版本">{manifest.version}</Descriptions.Item>
          <Descriptions.Item label="风险">{manifest.riskLevel}</Descriptions.Item>
          <Descriptions.Item label="安装路径" span={{ xs: 1, md: 2 }}>
            {manifest.installPath}
          </Descriptions.Item>
          <Descriptions.Item label="挂载点">{manifest.mountPoint}</Descriptions.Item>
          <Descriptions.Item label="入口 JSON">{manifest.entryJson}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="文件清单">
        <Table className="diff-table manifest-file-table" rowKey="path" columns={fileColumns} dataSource={manifest.files} pagination={false} size="small" />
      </Card>
      <Card
        title="完整 Manifest"
        extra={<Button icon={<CopyOutlined />} onClick={() => void copyManifest()}>复制 Manifest</Button>}
      >
        <pre className="code-block">{manifestText}</pre>
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
    { title: '字段', dataIndex: 'label', key: 'label', width: 150, render: (value: string) => <Text strong>{value}</Text> },
    { title: `From ${from.version}`, dataIndex: 'fromValue', key: 'fromValue', render: renderDiffValue },
    { title: `To ${to.version}`, dataIndex: 'toValue', key: 'toValue', render: renderDiffValue },
    {
      title: '状态',
      dataIndex: 'changed',
      key: 'changed',
      width: 100,
      render: (changed: boolean) => (changed ? <Tag color="orange">changed</Tag> : <Tag>same</Tag>)
    }
  ];

  const fileColumns: ColumnsType<FileDiffRow> = [
    { title: '文件', dataIndex: 'path', key: 'path', render: (value: string) => <Text className="diff-inline-code">{value}</Text> },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value) => <Tag color={value === 'unchanged' ? 'default' : value === 'added' ? 'green' : value === 'removed' ? 'red' : 'orange'}>{value}</Tag>
    },
    { title: 'From Hash', dataIndex: 'fromHash', key: 'fromHash', render: renderHashValue },
    { title: 'To Hash', dataIndex: 'toHash', key: 'toHash', render: renderHashValue }
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
        <Table className="diff-table manifest-diff-table" rowKey="key" columns={fieldColumns} dataSource={fieldRows} pagination={false} size="small" />
      </Card>
      <Card title="ZIP 包级文件差异">
        <Table className="diff-table file-diff-table" rowKey="path" columns={fileColumns} dataSource={fileRows} pagination={false} size="small" />
      </Card>
    </Space>
  );
}

function renderDiffValue(value: string) {
  return <pre className="diff-value-block">{value || '-'}</pre>;
}

function renderHashValue(value?: string) {
  return <Text className="diff-inline-code">{value || '-'}</Text>;
}

