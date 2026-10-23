import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CodeOutlined,
  FolderOpenOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';
import { Avatar, Button, Card, Empty, Flex, Input, Select, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { ToolRecord } from '@tapython-tool-hub/shared';
import { riskColor, statusColor } from '../tools/display';
import { filterCollectionModules, summarizeCollection } from './model';

const { Paragraph, Text, Title } = Typography;

interface CollectionDetailProps {
  shell: ToolRecord;
  modules: ToolRecord[];
  onBack: () => void;
  onOpenModule: (module: ToolRecord) => void;
}

export function CollectionDetail({ shell, modules, onBack, onOpenModule }: CollectionDetailProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>();
  const [riskLevel, setRiskLevel] = useState<string>();
  const [status, setStatus] = useState<string>();
  const summary = useMemo(() => summarizeCollection(modules), [modules]);
  const filteredModules = useMemo(() => filterCollectionModules(modules, { query, category, riskLevel, status }), [category, modules, query, riskLevel, status]);
  const groupedModules = useMemo(() => groupModules(filteredModules), [filteredModules]);
  const shellVersion = shell.versions[0]?.version ?? '-';
  const activeFilterCount = [query.trim(), category, riskLevel, status].filter(Boolean).length;
  const resetFilters = () => {
    setQuery('');
    setCategory(undefined);
    setRiskLevel(undefined);
    setStatus(undefined);
  };

  return (
    <Space direction="vertical" size={18} className="full-width detail-page collection-detail-page">
      <Flex className="detail-breadcrumb" align="center" gap={8} wrap="wrap">
        <Button className="detail-back-button" icon={<ArrowLeftOutlined />} onClick={onBack}>返回工具库</Button>
        <Text type="secondary">工具集 /</Text>
        <Text>{shell.collection?.id}</Text>
      </Flex>

      <section className="tool-hero collection-hero">
        <div className="tool-hero-layout">
          <Flex gap={16} align="flex-start" className="tool-hero-main">
            <Avatar className="tool-avatar" shape="square" size={72}>UE</Avatar>
            <Space direction="vertical" size={10} className="tool-hero-copy">
              <Space wrap align="center" className="tool-title-row">
                <Title level={1}>{shell.displayName}</Title>
                <Tag icon={<CodeOutlined />} color="blue">Python Shell</Tag>
                <Tag color={statusColor[shell.status]}>{shell.status}</Tag>
              </Space>
              <Paragraph className="detail-summary">{shell.description}</Paragraph>
              <Paragraph type="secondary" className="source-line">
                由 <Text strong>{shell.ownerTeam}</Text> 维护；模块独立版本化，当前页面仅浏览，不执行批量安装。
              </Paragraph>
            </Space>
          </Flex>
        </div>
      </section>

      <section className="metric-strip" aria-label="Collection summary">
        <CollectionMetric icon={<AppstoreOutlined />} label="模块" value={summary.moduleCount} />
        <CollectionMetric icon={<FolderOpenOutlined />} label="一级分类" value={summary.categoryCount} />
        <CollectionMetric icon={<CodeOutlined />} label="Shell 版本" value={`V ${shellVersion}`} />
        <CollectionMetric icon={<SafetyCertificateOutlined />} label="风险分布" value={`低 ${summary.risks.low} / 中 ${summary.risks.medium} / 高 ${summary.risks.high}`} />
      </section>

      <Card className="catalog-toolbar collection-toolbar">
        <Flex justify="space-between" align="center" gap={12} wrap="wrap">
          <Space direction="vertical" size={0}>
            <Title level={4}>浏览模块</Title>
            <Text type="secondary" aria-live="polite">当前显示 {filteredModules.length} / {summary.moduleCount} 个模块</Text>
          </Space>
          {activeFilterCount > 0 ? <Button size="small" onClick={resetFilters}>清空筛选</Button> : null}
        </Flex>
        <Flex gap={12} wrap="wrap" align="center">
          <Input.Search
            id="collection-module-search"
            name="collectionModuleSearch"
            className="search-input"
            aria-label="搜索工具集模块"
            placeholder="搜索模块名称、描述、ID 或分类"
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            className="filter-select collection-category-select"
            aria-label="模块分类"
            allowClear
            placeholder="一级分类"
            value={category}
            onChange={setCategory}
            options={summary.categories.map((item) => ({ value: item.name, label: `${stripOrderPrefix(item.name)} (${item.count})` }))}
          />
          <Select
            className="filter-select"
            aria-label="模块风险"
            allowClear
            placeholder="风险等级"
            value={riskLevel}
            onChange={setRiskLevel}
            options={['low', 'medium', 'high'].map((value) => ({ value, label: `风险 ${value}` }))}
          />
          <Select
            className="filter-select"
            aria-label="模块状态"
            allowClear
            placeholder="发布状态"
            value={status}
            onChange={setStatus}
            options={Array.from(new Set(modules.map((module) => module.status))).sort().map((value) => ({ value, label: value }))}
          />
        </Flex>
      </Card>

      <div className="collection-layout">
        <aside className="collection-category-sidebar" aria-label="工具集分类">
          <Text className="sidebar-section-label">模块分类</Text>
          <button type="button" className={`sidebar-row${!category ? ' sidebar-row-active' : ''}`} aria-pressed={!category} onClick={() => setCategory(undefined)}>
            <span>全部模块</span><span>{summary.moduleCount}</span>
          </button>
          {summary.categories.map((item) => (
            <button
              type="button"
              className={`sidebar-row${category === item.name ? ' sidebar-row-active' : ''}`}
              aria-pressed={category === item.name}
              key={item.name}
              onClick={() => setCategory(item.name)}
            >
              <span>{stripOrderPrefix(item.name)}</span><span>{item.count}</span>
            </button>
          ))}
        </aside>

        <section className="collection-module-content" aria-label="工具集模块列表">
          {groupedModules.length === 0 ? (
            <Empty
              description={query || category || riskLevel || status ? '当前筛选没有匹配模块' : '该工具集尚未发布模块'}
            >
              {activeFilterCount > 0 ? <Button onClick={resetFilters}>清空筛选</Button> : null}
            </Empty>
          ) : groupedModules.map((group) => (
            <section className="collection-module-group" key={group.key}>
              <Flex align="baseline" justify="space-between" gap={12} wrap="wrap" className="collection-module-group-header">
                <Title level={4}>{group.title}</Title>
                <Text type="secondary">{group.modules.length} 个模块</Text>
              </Flex>
              <div className="collection-module-grid">
                {group.modules.map((module) => (
                  <article className="collection-module-row" key={module.slug}>
                    <div className="collection-module-copy">
                      <Flex gap={8} align="center" wrap="wrap">
                        <Text strong className="collection-module-name">{module.displayName}</Text>
                        <Tag color={riskColor[module.riskLevel]}>风险 {module.riskLevel}</Tag>
                        <Tag color={statusColor[module.status]}>{module.status}</Tag>
                      </Flex>
                      <Text type="secondary" className="collection-module-description">{module.description}</Text>
                      <Flex gap={8} wrap="wrap" className="collection-module-meta">
                        <Text type="secondary">模块 {module.versions[0]?.version ?? '-'}</Text>
                        <Text type="secondary">需要 Shell {module.collection?.requiredShellVersion ?? '-'}</Text>
                        <Text code>{module.collection?.moduleId}</Text>
                      </Flex>
                    </div>
                    <Button aria-label={`查看模块：${module.displayName}`} onClick={() => onOpenModule(module)}>查看模块</Button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>
      </div>
    </Space>
  );
}

function CollectionMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="metric-item">
      <span className="metric-icon">{icon}</span>
      <div><Text strong>{value}</Text><Text type="secondary">{label}</Text></div>
    </div>
  );
}

function groupModules(modules: ToolRecord[]): Array<{ key: string; title: string; modules: ToolRecord[] }> {
  const groups = new Map<string, ToolRecord[]>();
  for (const module of modules) {
    const path = module.collection?.categoryPath ?? [];
    const key = path.join('/') || '未分类';
    const group = groups.get(key) ?? [];
    group.push(module);
    groups.set(key, group);
  }
  return Array.from(groups, ([key, items]) => ({
    key,
    title: key === '未分类' ? key : key.split('/').map(stripOrderPrefix).join(' / '),
    modules: items
  })).sort((left, right) => left.key.localeCompare(right.key, 'zh-CN'));
}

function stripOrderPrefix(value: string): string {
  return value.replace(/^\d+_/, '');
}
