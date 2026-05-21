import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Flex, Form, Input, Popconfirm, Row, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminUpdateToolRequest, SubmissionRecord, ToolRecord, ToolStatus } from '@tapython-tool-hub/shared';
import { deleteAdminSubmission, deleteAdminTool, listAdminSubmissions, reviewAdminSubmission, updateAdminTool } from '../../services/adminConsole';
import { getCurrentAdmin, loginAdmin, logoutAdmin, type AuthUser } from '../../services/auth';
import { riskColor, statusColor } from '../tools/display';

const { Paragraph, Text, Title } = Typography;

type SubmissionFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'validation_failed';

interface AdminConsoleProps {
  tools: ToolRecord[];
  loadingTools: boolean;
  onToolsChanged: () => void;
}

export function AdminConsole({ tools, loadingTools, onToolsChanged }: AdminConsoleProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<AdminUpdateToolRequest & { slug?: string }>();
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submittingReview, setSubmittingReview] = useState<string>();
  const [savingTool, setSavingTool] = useState(false);
  const [deletingTool, setDeletingTool] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser>();
  const [loginLoading, setLoginLoading] = useState(false);
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>('pending');
  const selectedSlug = Form.useWatch('slug', form);
  const selectedTool = useMemo(() => tools.find((tool) => tool.slug === selectedSlug), [selectedSlug, tools]);

  const filteredSubmissions = useMemo(() => submissions.filter((submission) => {
    if (submissionFilter === 'all') return true;
    if (submissionFilter === 'validation_failed') return !submission.validationReport.valid;
    return submission.status === submissionFilter;
  }), [submissionFilter, submissions]);

  const checkSession = useCallback(async () => {
    setAuthChecking(true);
    try {
      const state = await getCurrentAdmin();
      setAuthUser(state.authenticated ? state.user : undefined);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthChecking(false);
    }
  }, [messageApi]);

  const refreshSubmissions = useCallback(async () => {
    if (!authUser) return;
    setLoadingSubmissions(true);
    try {
      setSubmissions(await listAdminSubmissions());
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSubmissions(false);
    }
  }, [authUser, messageApi]);

  const login = async (values: { username: string; password: string }) => {
    setLoginLoading(true);
    try {
      const state = await loginAdmin(values.username, values.password);
      setAuthUser(state.user);
      messageApi.success('已进入后台管理');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    await logoutAdmin();
    setAuthUser(undefined);
    setSubmissions([]);
  };

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!authUser) return;
    void refreshSubmissions();
    const intervalId = window.setInterval(() => {
      void refreshSubmissions();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [authUser, refreshSubmissions]);

  useEffect(() => {
    if (!selectedTool) return;
    form.setFieldsValue({
      slug: selectedTool.slug,
      displayName: selectedTool.displayName,
      description: selectedTool.description,
      category: selectedTool.category,
      ownerTeam: selectedTool.ownerTeam,
      status: selectedTool.status,
      riskLevel: selectedTool.riskLevel,
      tags: selectedTool.tags
    });
  }, [form, selectedTool]);

  const review = async (submission: SubmissionRecord, decision: 'approved' | 'rejected' | 'changes_requested') => {
    setSubmittingReview(submission.id);
    try {
      const updated = await reviewAdminSubmission(submission.id, { reviewer: authUser?.username ?? 'admin', decision });
      setSubmissions((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (decision === 'approved') {
        onToolsChanged();
      }
      messageApi.success(decision === 'approved' ? '已通过并发布' : '审核状态已更新');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmittingReview(undefined);
    }
  };

  const deleteSubmission = async (submission: SubmissionRecord) => {
    setSubmittingReview(submission.id);
    try {
      await deleteAdminSubmission(submission.id);
      setSubmissions((current) => current.filter((item) => item.id !== submission.id));
      messageApi.success('投稿记录已删除');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmittingReview(undefined);
    }
  };

  const saveTool = async (values: AdminUpdateToolRequest & { slug?: string }) => {
    if (!values.slug) {
      messageApi.warning('请先选择工具');
      return;
    }
    setSavingTool(true);
    try {
      await updateAdminTool(values.slug, {
        displayName: values.displayName,
        description: values.description,
        category: values.category,
        ownerTeam: values.ownerTeam,
        status: values.status,
        riskLevel: values.riskLevel,
        tags: values.tags
      });
      onToolsChanged();
      messageApi.success('工具发布信息已更新');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingTool(false);
    }
  };

  const deleteTool = async () => {
    if (!selectedTool) {
      messageApi.warning('请先选择工具');
      return;
    }
    setDeletingTool(true);
    try {
      await deleteAdminTool(selectedTool.slug);
      form.resetFields();
      onToolsChanged();
      messageApi.success('工具已完全删除');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingTool(false);
    }
  };

  const submissionColumns: ColumnsType<SubmissionRecord> = [
    {
      title: '工具',
      dataIndex: 'slug',
      width: 190,
      render: (_, submission) => (
        <Space direction="vertical" size={2} className="admin-tool-cell">
          <Text strong ellipsis={{ tooltip: submission.slug }}>{submission.slug}</Text>
          <Text type="secondary" ellipsis={{ tooltip: submission.submitter }}>{submission.submitter}</Text>
        </Space>
      )
    },
    {
      title: '状态',
      width: 150,
      render: (_, submission) => (
        <Space direction="vertical" size={4}>
          <Tag color={statusColor[submission.status]}>{submission.status}</Tag>
          <Tag color={submission.validationReport.valid ? 'green' : 'red'}>
            {submission.validationReport.valid ? 'valid' : 'invalid'}
          </Tag>
        </Space>
      )
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 190,
      render: (value: string) => new Date(value).toLocaleString()
    },
    {
      title: '校验信息',
      width: 110,
      render: (_, submission) => submission.validationReport.issues.length > 0
        ? `${submission.validationReport.issues.length} 条问题`
        : '通过'
    },
    {
      title: '操作',
      width: 330,
      render: (_, submission) => (
        <Space wrap className="review-action-group">
          <Button
            type="primary"
            className="review-action-button review-action-approve"
            icon={<CheckCircleOutlined />}
            loading={submittingReview === submission.id}
            disabled={!submission.validationReport.valid || submission.status === 'approved'}
            onClick={() => void review(submission, 'approved')}
          >
            通过并发布
          </Button>
          <Button
            danger
            className="review-action-button review-action-reject"
            icon={<CloseCircleOutlined />}
            loading={submittingReview === submission.id}
            disabled={submission.status === 'approved' || submission.status === 'rejected'}
            onClick={() => void review(submission, 'rejected')}
          >
            拒绝
          </Button>
          <Popconfirm
            title="删除投稿记录"
            description="此操作不会删除已发布工具产物。"
            okText="删除"
            cancelText="取消"
            onConfirm={() => void deleteSubmission(submission)}
          >
            <Button danger className="review-action-button review-action-delete" icon={<DeleteOutlined />} loading={submittingReview === submission.id}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={18} className="full-width admin-console">
      {contextHolder}
      {!authUser ? (
        <AdminLoginPanel loading={authChecking || loginLoading} onLogin={login} />
      ) : null}
      {authUser ? (
        <Flex align="center" justify="space-between" gap={12} wrap="wrap" className="admin-session-bar">
          <Text type="secondary">当前管理员：<Text strong>{authUser.username}</Text></Text>
          <Button onClick={() => void logout()}>退出登录</Button>
        </Flex>
      ) : null}
      {authUser ? (
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={15}>
          <Card
            title="上传工具审核"
            extra={<Button icon={<ReloadOutlined />} onClick={() => void refreshSubmissions()} loading={loadingSubmissions}>刷新</Button>}
          >
            <Space direction="vertical" size={12} className="full-width">
              <Flex align="center" justify="space-between" gap={12} wrap="wrap">
                <Text type="secondary" className="admin-reviewer-input">审核人：{authUser.username}</Text>
                <Select<SubmissionFilter>
                  value={submissionFilter}
                  onChange={setSubmissionFilter}
                  className="admin-filter-select"
                  options={[
                    { label: '全部', value: 'all' },
                    { label: '待审核', value: 'pending' },
                    { label: '已通过', value: 'approved' },
                    { label: '已拒绝', value: 'rejected' },
                    { label: '校验失败', value: 'validation_failed' }
                  ]}
                />
              </Flex>
              <Table
                rowKey="id"
                size="middle"
                columns={submissionColumns}
                dataSource={filteredSubmissions}
                loading={loadingSubmissions}
                tableLayout="fixed"
                scroll={{ x: 980 }}
                expandable={{
                  expandedRowRender: (submission) => {
                    const summary = extractSubmissionSummary(submission.markdown);
                    return (
                      <Space direction="vertical" size={10} className="full-width">
                        <SubmissionSummaryPanel summary={summary} />
                        {submission.notes ? <Paragraph type="secondary">备注：{submission.notes}</Paragraph> : null}
                        {submission.validationReport.issues.length > 0 ? (
                          submission.validationReport.issues.map((issue, index) => (
                            <Alert key={`${submission.id}-${index}`} type={issue.level === 'error' ? 'error' : 'warning'} showIcon message={issue.path ?? issue.level} description={issue.message} />
                          ))
                        ) : <Alert type="success" showIcon message="校验通过" description="可发布为工具库产物。" />}
                        {submission.reviews[0] ? <Text type="secondary">最近审核：{submission.reviews[0].reviewer} / {submission.reviews[0].decision}</Text> : null}
                      </Space>
                    );
                  }
                }}
                locale={{ emptyText: <Empty description="暂无匹配投稿" /> }}
              />
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card title="发布工具信息" extra={<ToolOutlined />}>
            <Form form={form} layout="vertical" onFinish={(values) => void saveTool(values)}>
              <Form.Item name="slug" label="工具">
                <Select
                  showSearch
                  loading={loadingTools}
                  placeholder="选择已发布工具"
                  optionFilterProp="label"
                  options={tools.map((tool) => ({ label: `${tool.displayName} (${tool.slug})`, value: tool.slug }))}
                />
              </Form.Item>
              {selectedTool ? (
                <>
                  <Form.Item name="displayName" label="展示名称" rules={[{ required: true }]}> 
                    <Input />
                  </Form.Item>
                  <Form.Item name="description" label="描述" rules={[{ required: true }]}> 
                    <Input.TextArea rows={4} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="status" label="发布状态" rules={[{ required: true }]}> 
                        <Select<ToolStatus>
                          options={['draft', 'pending', 'approved', 'rejected', 'deprecated', 'archived'].map((status) => ({ label: status, value: status }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="riskLevel" label="风险等级" rules={[{ required: true }]}> 
                        <Select
                          options={['low', 'medium', 'high'].map((risk) => ({ label: risk, value: risk }))}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="category" label="分类" rules={[{ required: true }]}> 
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="ownerTeam" label="Owner Team" rules={[{ required: true }]}> 
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="tags" label="标签">
                    <Select mode="tags" tokenSeparators={[',', ' ']} />
                  </Form.Item>
                  <Flex align="center" justify="space-between" gap={12} wrap="wrap">
                    <Space wrap>
                      <Tag color={statusColor[selectedTool.status]}>{selectedTool.status}</Tag>
                      <Tag color={riskColor[selectedTool.riskLevel]}>{selectedTool.riskLevel}</Tag>
                    </Space>
                    <Space wrap>
                      <Popconfirm
                        title="完全删除工具"
                        description={`将删除 ${selectedTool.displayName} 的源文件、API 数据和下载包。此操作不可恢复。`}
                        okText="删除工具"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void deleteTool()}
                      >
                        <Button danger className="review-action-button review-action-delete" icon={<DeleteOutlined />} loading={deletingTool}>删除工具</Button>
                      </Popconfirm>
                      <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingTool}>保存并刷新</Button>
                    </Space>
                  </Flex>
                </>
              ) : (
                <Empty description="选择工具后编辑发布状态和信息" />
              )}
            </Form>
          </Card>
        </Col>
      </Row>
      ) : null}
    </Space>
  );
}

function AdminLoginPanel({ loading, onLogin }: { loading: boolean; onLogin: (values: { username: string; password: string }) => void }) {
  return (
    <Card title="管理员登录" className="admin-login-panel">
      <Form layout="vertical" onFinish={onLogin} autoComplete="off">
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading}>登录</Button>
      </Form>
    </Card>
  );
}

interface SubmissionSummary {
  description?: string;
  changeSummary?: string;
  features: string[];
}

function SubmissionSummaryPanel({ summary }: { summary: SubmissionSummary }) {
  if (!summary.description && !summary.changeSummary && summary.features.length === 0) {
    return <Alert type="info" showIcon message="工具说明" description="投稿 Markdown 中暂未提取到功能或更新描述。" />;
  }

  return (
    <div className="admin-submission-summary-panel">
      {summary.description ? (
        <div className="admin-submission-summary-section">
          <Text strong>工具描述</Text>
          <Paragraph>{summary.description}</Paragraph>
        </div>
      ) : null}
      {summary.features.length > 0 ? (
        <div className="admin-submission-summary-section">
          <Text strong>工具功能</Text>
          <ul className="admin-submission-feature-list">
            {summary.features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
        </div>
      ) : null}
      {summary.changeSummary ? (
        <div className="admin-submission-summary-section">
          <Text strong>更新内容</Text>
          <Paragraph>{summary.changeSummary}</Paragraph>
        </div>
      ) : null}
    </div>
  );
}

function extractSubmissionSummary(markdown: string): SubmissionSummary {
  const frontMatter = extractMarkdownFrontMatter(markdown);
  if (!frontMatter) {
    return { features: [] };
  }

  return {
    description: extractYamlScalar(frontMatter, 'description'),
    changeSummary: extractYamlScalar(frontMatter, 'changeSummary'),
    features: extractYamlList(frontMatter, ['summary', 'features'])
  };
}

function extractMarkdownFrontMatter(markdown: string): string | undefined {
  return markdown.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/)?.[1];
}

function extractYamlScalar(source: string, fieldName: string): string | undefined {
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockMatch = source.match(new RegExp(`^${escapedFieldName}:\\s*(>[+-]?|\\|[+-]?)\\s*\\r?\\n([\\s\\S]*?)(?=^\\S|$)`, 'm'));
  if (blockMatch) {
    const lines = blockMatch[2]
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s{2,}/, '').trim())
      .filter(Boolean);
    return (blockMatch[1].startsWith('|') ? lines.join('\n') : lines.join(' ')) || undefined;
  }

  const scalarMatch = source.match(new RegExp(`^${escapedFieldName}:\\s*(.+?)\\s*$`, 'm'));
  return normalizeYamlScalar(scalarMatch?.[1]);
}

function extractYamlList(source: string, path: string[]): string[] {
  const lines = source.split(/\r?\n/);
  let searchStartIndex = 0;
  let parentIndent = -1;

  for (const fieldName of path) {
    const fieldIndex = lines.findIndex((line, index) => {
      if (index < searchStartIndex) return false;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      return indent > parentIndent && line.trim() === `${fieldName}:`;
    });
    if (fieldIndex < 0) return [];
    parentIndent = lines[fieldIndex].match(/^\s*/)?.[0].length ?? 0;
    searchStartIndex = fieldIndex + 1;
  }

  const items: string[] = [];
  for (let index = searchStartIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= parentIndent) break;
    const listItem = line.match(/^\s*-\s*(.+?)\s*$/)?.[1];
    if (listItem) items.push(listItem);
  }

  return items
    .map(normalizeYamlScalar)
    .filter((value): value is string => Boolean(value));
}

function normalizeYamlScalar(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed.replace(/\s+#.*$/, '').trim() || undefined;
}
