import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  InboxOutlined,
  ReloadOutlined,
  UploadOutlined
} from '@ant-design/icons';
import { Alert, Button, Card, Collapse, Divider, Empty, Flex, Form, Input, List, Segmented, Space, Tag, Timeline, Typography, Upload, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { SubmissionAssetPayload, SubmissionRecord, ToolSubmissionRequest } from '@tapython-tool-hub/shared';
import { createSubmission, listSubmissions, reviewSubmission } from '../../services/submissionWorkflow';
import { statusColor } from '../tools/display';

const { Paragraph, Text, Title } = Typography;
type SubmissionFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'validation_failed';
type SubmissionMode = 'new-tool' | 'new-version';

const submissionModeCopy: Record<SubmissionMode, {
  title: string;
  description: string;
  slugLabel: string;
  slugPlaceholder: string;
  markdownPlaceholder: string;
  notesPlaceholder: string;
  submitLabel: string;
  noteTemplate: string;
}> = {
  'new-tool': {
    title: '提交新工具',
    description: '用于首次加入 Tool Hub 的工具。请使用未发布过的 slug，并提供完整 front matter、正文和资源文件。',
    slugLabel: '新工具 Slug',
    slugPlaceholder: 'my-new-tool',
    markdownPlaceholder: '粘贴新工具 Markdown，front matter 中的 slug/version 应对应首个发布版本。',
    notesPlaceholder: '说明适用场景、风险等级、依赖插件或首次审核重点。',
    submitLabel: '提交新工具并校验',
    noteTemplate: '提交新工具：请重点审核工具用途、风险等级、安装路径和 MenuConfig 挂载点。'
  },
  'new-version': {
    title: '发布新版本',
    description: '用于已存在工具的增量发布。slug 应保持不变，front matter 的 version 必须高于已发布版本。',
    slugLabel: '已有工具 Slug',
    slugPlaceholder: 'actor-rename-tool',
    markdownPlaceholder: '粘贴新版本 Markdown，保持 slug 不变，并将 version 改为下一个未发布版本。',
    notesPlaceholder: '说明版本变化、兼容性影响、迁移步骤或 breaking change。',
    submitLabel: '提交新版本并校验',
    noteTemplate: '发布新版本：请确认 version 已递增，并重点审核变更摘要、兼容性影响和覆盖风险。'
  }
};

export function SubmissionWorkbench() {
  const [form] = Form.useForm<ToolSubmissionRequest>();
  const [messageApi, contextHolder] = message.useMessage();
  const [assets, setAssets] = useState<SubmissionAssetPayload[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewer, setReviewer] = useState('TA Reviewer');
  const [filter, setFilter] = useState<SubmissionFilter>('all');
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>('new-tool');
  const modeCopy = submissionModeCopy[submissionMode];

  const filteredSubmissions = useMemo(() => submissions.filter((submission) => {
    if (filter === 'validation_failed') return !submission.validationReport.valid;
    if (filter === 'all') return true;
    return submission.status === filter;
  }), [filter, submissions]);

  const refresh = async () => {
    setLoading(true);
    try {
      setSubmissions(await listSubmissions());
    } catch (error) {
      messageApi.warning(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const submit = async (values: ToolSubmissionRequest) => {
    setLoading(true);
    try {
      const submission = await createSubmission({ ...values, assets });
      form.resetFields();
      setAssets([]);
      setSubmissions((current) => [submission, ...current]);
      messageApi.success(submission.validationReport.valid ? '投稿已进入待审核队列' : '投稿已保存为草稿，校验未通过');
    } catch (error) {
      messageApi.error(getSubmissionErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const review = async (submission: SubmissionRecord, decision: 'approved' | 'rejected' | 'changes_requested') => {
    setLoading(true);
    try {
      const updated = await reviewSubmission(submission.id, { reviewer, decision });
      setSubmissions((current) => current.map((item) => item.id === updated.id ? updated : item));
      messageApi.success(decision === 'approved' ? '已审核通过并发布兼容产物' : '审核状态已更新');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const copyValidationIssues = async (submission: SubmissionRecord) => {
    try {
      await navigator.clipboard.writeText(formatValidationIssues(submission));
      messageApi.success('校验详情已复制');
    } catch {
      messageApi.warning('剪贴板写入失败，请展开详情后手动选择复制。');
    }
  };

  const selectSubmissionMode = (mode: SubmissionMode) => {
    setSubmissionMode(mode);
    const currentNotes = form.getFieldValue('notes');
    const generatedNotes = Object.values(submissionModeCopy).map((copy) => copy.noteTemplate);
    if (!currentNotes || generatedNotes.includes(currentNotes)) {
      form.setFieldValue('notes', submissionModeCopy[mode].noteTemplate);
    }
    const formElement = document.getElementById('submission-form');
    if (formElement) {
      const top = formElement.getBoundingClientRect().top + window.scrollY - 18;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const importMarkdownFile = async (file: File) => {
    const content = await file.text();
    form.setFieldValue('markdown', content);
    void form.validateFields(['markdown']).catch(() => undefined);
    messageApi.success(`已导入 ${file.name}`);
    return Upload.LIST_IGNORE;
  };

  return (
    <Space direction="vertical" size={16} className="full-width submission-workbench">
      {contextHolder}
      <Card className="release-desk-card">
        <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
          <Space direction="vertical" size={8}>
            <Text className="eyebrow">Release Desk</Text>
            <Title level={4}>投稿/发布工作台</Title>
            <Text type="secondary">提交新工具或发布新版本，校验通过后由审核队列发布兼容产物。</Text>
          </Space>
        </Flex>
        <Divider className="compact-divider" />
        <div className="submission-mode-grid">
          <button
            type="button"
            className={`submission-mode-card${submissionMode === 'new-tool' ? ' submission-mode-card-active' : ''}`}
            onClick={() => selectSubmissionMode('new-tool')}
          >
            <span className="submission-mode-icon"><UploadOutlined /></span>
            <span>
              <Text strong>提交新工具</Text>
              <Text type="secondary">创建新的 slug，首次进入审核队列。</Text>
            </span>
          </button>
          <button
            type="button"
            className={`submission-mode-card${submissionMode === 'new-version' ? ' submission-mode-card-active' : ''}`}
            onClick={() => selectSubmissionMode('new-version')}
          >
            <span className="submission-mode-icon"><CheckCircleOutlined /></span>
            <span>
              <Text strong>发布新版本</Text>
              <Text type="secondary">复用已有 slug，version 必须递增。</Text>
            </span>
          </button>
        </div>
        <Divider className="compact-divider" />
        <Timeline
          items={[
            { children: '提交 Markdown front matter、正文和外部资源文件。' },
            { children: '后端调用内容处理包生成校验报告，校验通过后进入待审核。' },
            { children: '审核通过后写入 data/tool-docs，并导出兼容 API、manifest、README 和下载产物。' },
            { children: '已发布版本不可变；同 slug 同版本会被校验拦截。' }
          ]}
        />
      </Card>

      <section className="submission-grid">
        <Card id="submission-form" className="release-form-card" title={modeCopy.title}>
          <Alert type={submissionMode === 'new-tool' ? 'info' : 'warning'} showIcon message={modeCopy.title} description={modeCopy.description} />
          <Divider className="compact-divider" />
          <Form form={form} layout="vertical" onFinish={submit} disabled={loading}>
            <Form.Item name="slug" label={modeCopy.slugLabel} rules={[{ required: true }, { pattern: /^[a-z0-9-]+$/, message: '只允许小写字母、数字和连字符' }]}>
              <Input placeholder={modeCopy.slugPlaceholder} />
            </Form.Item>
            <Form.Item name="submitter" label="提交人" rules={[{ required: true }]}>
              <Input placeholder="TA Team" />
            </Form.Item>
            <Form.Item label="工具 Markdown" required>
              <Space direction="vertical" size={10} className="full-width markdown-input-group">
                <Upload.Dragger
                  className="markdown-file-dropzone"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  multiple={false}
                  showUploadList={false}
                  beforeUpload={importMarkdownFile}
                >
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text">拖入 Markdown 文件，或点击选择</p>
                  <p className="ant-upload-hint">支持 .md、.markdown、.txt；导入后仍可在下方继续编辑文本。</p>
                </Upload.Dragger>
                <Form.Item name="markdown" noStyle rules={[{ required: true, message: '请粘贴 Markdown 文本或导入 Markdown 文件' }]}>
                  <Input.TextArea rows={14} placeholder={modeCopy.markdownPlaceholder} />
                </Form.Item>
              </Space>
            </Form.Item>
            <Form.Item name="notes" label="投稿备注">
              <Input.TextArea rows={3} placeholder={modeCopy.notesPlaceholder} />
            </Form.Item>
            <Upload.Dragger
              multiple
              showUploadList={false}
              beforeUpload={async (file) => {
                const content = await file.text();
                const path = file.webkitRelativePath || file.name;
                setAssets((current) => [{ path, content }, ...current.filter((asset) => asset.path !== path)]);
                return Upload.LIST_IGNORE;
              }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">拖入 @file 引用资源，或点击选择</p>
              <p className="ant-upload-hint">支持 JSON、Python、MenuConfig 片段等文本文件。</p>
            </Upload.Dragger>
            {assets.length > 0 ? (
              <List
                className="asset-list"
                size="small"
                dataSource={assets}
                renderItem={(asset) => (
                  <List.Item actions={[<Button type="link" danger onClick={() => setAssets((current) => current.filter((item) => item.path !== asset.path))} key="remove">移除</Button>]}>
                    <Text code>{asset.path}</Text>
                  </List.Item>
                )}
              />
            ) : null}
            <Button type="primary" htmlType="submit" icon={<UploadOutlined />} loading={loading} block>
              {modeCopy.submitLabel}
            </Button>
          </Form>
        </Card>

        <Card
          className="review-queue-card"
          title="审核队列"
          extra={<Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>刷新</Button>}
        >
          <Space direction="vertical" size={12} className="full-width">
            <Input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="审核人" />
            <Segmented
              value={filter}
              onChange={(value) => setFilter(value as SubmissionFilter)}
              options={[
                { label: '全部', value: 'all' },
                { label: '待审核', value: 'pending' },
                { label: '已通过', value: 'approved' },
                { label: '已拒绝', value: 'rejected' },
                { label: '校验失败', value: 'validation_failed' }
              ]}
            />
            {filteredSubmissions.length === 0 ? <Empty description="暂无匹配投稿" /> : null}
            <List
              loading={loading}
              dataSource={filteredSubmissions}
              renderItem={(submission) => (
                <List.Item>
                  <Space direction="vertical" size={10} className="full-width">
                    <Flex align="center" justify="space-between" gap={10} wrap="wrap">
                      <Space wrap>
                        <Title level={5}>{submission.slug}</Title>
                        <Tag color={statusColor[submission.status]}>{submission.status}</Tag>
                        <Tag color={submission.validationReport.valid ? 'green' : 'red'}>
                          {submission.validationReport.valid ? 'validation passed' : 'validation failed'}
                        </Tag>
                      </Space>
                      <Space wrap className="review-action-group">
                        <Button
                          className="review-action-button review-action-approve"
                          icon={<CheckCircleOutlined />}
                          type="primary"
                          disabled={!submission.validationReport.valid || submission.status === 'approved'}
                          onClick={() => review(submission, 'approved')}
                        >
                          通过并发布
                        </Button>
                        <Button
                          className="review-action-button review-action-reject"
                          icon={<CloseCircleOutlined />}
                          danger
                          disabled={submission.status === 'rejected'}
                          onClick={() => review(submission, 'rejected')}
                        >
                          拒绝
                        </Button>
                      </Space>
                    </Flex>
                    <Paragraph type="secondary">提交人：{submission.submitter} · {new Date(submission.updatedAt).toLocaleString()}</Paragraph>
                    {submission.validationReport.issues.length > 0 ? (
                      <Space direction="vertical" size={8} className="full-width">
                        <Alert
                          type={submission.validationReport.valid ? 'warning' : 'error'}
                          showIcon
                          message="校验报告"
                          description={`${submission.validationReport.issues.length} 条问题，可展开查看并复制详情。`}
                          action={<Button size="small" icon={<CopyOutlined />} onClick={() => void copyValidationIssues(submission)}>复制详情</Button>}
                        />
                        <Collapse
                          className="validation-detail-panel"
                          size="small"
                          items={submission.validationReport.issues.map((issue, index) => ({
                            key: `${index}`,
                            label: `${issue.level}${issue.path ? ` · ${issue.path}` : ''}`,
                            children: (
                              <Paragraph className="validation-issue-message" copyable={{ text: `${issue.path ? `${issue.path}: ` : ''}${issue.message}` }}>
                                {issue.message}
                              </Paragraph>
                            )
                          }))}
                        />
                      </Space>
                    ) : (
                      <Alert type="success" showIcon message="校验报告" description="内容处理包已成功生成兼容 API 和下载产物预览。" />
                    )}
                    {submission.reviews.length > 0 ? (
                      <Text type="secondary">最近审核：{submission.reviews[0].reviewer} / {submission.reviews[0].decision}</Text>
                    ) : null}
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        </Card>
      </section>
    </Space>
  );
}

function formatValidationIssues(submission: SubmissionRecord): string {
  return submission.validationReport.issues
    .map((issue) => `${issue.level}${issue.path ? ` ${issue.path}` : ''}: ${issue.message}`)
    .join('\n');
}

function getSubmissionErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (/immutable|same slug|same version|already published|同.*版本|已发布/.test(errorMessage)) {
    return `${errorMessage}。建议把 version 改为下一个未发布版本后重新提交。`;
  }
  return errorMessage;
}
