import {
  CheckCircleOutlined,
  CopyOutlined,
  FileTextOutlined,
  InboxOutlined,
  ReloadOutlined,
  ToolOutlined,
  UploadOutlined
} from '@ant-design/icons';
import { Alert, Button, Card, Collapse, Divider, Empty, Flex, Form, Input, List, Modal, Radio, Segmented, Space, Tag, Timeline, Typography, Upload, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { PackageRepairDecisions, PackageRepairReport, SubmissionAssetPayload, SubmissionRecord, ToolSubmissionRequest, ToolType } from '@tapython-tool-hub/shared';
import { analyzePackageRepair, createSubmission, listSubmissions, submitRepairedPackage } from '../../services/submissionWorkflow';
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
  const toolType = Form.useWatch('toolType', form) ?? 'chameleon';
  const [messageApi, contextHolder] = message.useMessage();
  const [assets, setAssets] = useState<SubmissionAssetPayload[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<SubmissionFilter>('all');
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>('new-tool');
  const [repairFile, setRepairFile] = useState<File>();
  const [repairReport, setRepairReport] = useState<PackageRepairReport>();
  const [repairDecisions, setRepairDecisions] = useState<PackageRepairDecisions>({});
  const [repairSubmitter, setRepairSubmitter] = useState('');
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairError, setRepairError] = useState<string>();
  const [repairSubmission, setRepairSubmission] = useState<SubmissionRecord>();
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
    const markdownSlug = extractMarkdownSlug(values.markdown);
    if (markdownSlug && markdownSlug !== values.slug) {
      const errorMessage = `表单 slug (${values.slug}) 与 Markdown front matter slug (${markdownSlug}) 不一致，请保持一致。`;
      form.setFields([
        { name: 'slug', errors: [errorMessage] },
        { name: 'markdown', errors: [errorMessage] }
      ]);
      messageApi.error(errorMessage);
      return;
    }

    const markdownToolType = extractMarkdownToolType(values.markdown) ?? 'chameleon';
    if (markdownToolType !== values.toolType) {
      const errorMessage = `所选工具类型为“${toolTypeLabel(values.toolType ?? 'chameleon')}”，但 Markdown front matter 为“${markdownToolType}”。请保持一致。`;
      form.setFields([
        { name: 'toolType', errors: [errorMessage] },
        { name: 'markdown', errors: [errorMessage] }
      ]);
      messageApi.error(errorMessage);
      return;
    }

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
    const markdownSlug = extractMarkdownSlug(content);
    if (markdownSlug && !form.getFieldValue('slug')) {
      form.setFieldValue('slug', markdownSlug);
    }
    const markdownSubmitter = extractMarkdownSubmitter(content);
    if (markdownSubmitter && !form.getFieldValue('submitter')) {
      form.setFieldValue('submitter', markdownSubmitter);
    }
    const markdownToolType = extractMarkdownToolType(content);
    if (markdownToolType) {
      form.setFieldValue('toolType', markdownToolType);
    } else {
      form.setFieldValue('toolType', 'chameleon');
      messageApi.info('Markdown 未声明 toolType，已按兼容规则识别为 Chameleon 工具。');
    }
    void form.validateFields(['markdown']).catch(() => undefined);
    messageApi.success(`已导入 ${file.name}，识别为${toolTypeLabel(markdownToolType ?? 'chameleon')}`);
    return Upload.LIST_IGNORE;
  };

  const applyMarkdownTemplate = () => {
    const writeTemplate = () => {
      const slug = form.getFieldValue('slug') || (toolType === 'python-script' ? 'my-python-script' : 'my-chameleon-tool');
      const submitter = form.getFieldValue('submitter') || 'TA Team';
      form.setFieldValue('slug', slug);
      form.setFieldValue('markdown', buildMarkdownTemplate(toolType, slug, submitter));
      void form.validateFields(['slug', 'markdown']).catch(() => undefined);
    };
    if (!form.getFieldValue('markdown')?.trim()) {
      writeTemplate();
      return;
    }
    Modal.confirm({
      title: '覆盖当前 Markdown？',
      content: '使用模板会替换当前 Markdown 文本，但不会删除已上传的资源文件。',
      okText: '使用模板',
      cancelText: '取消',
      onOk: writeTemplate
    });
  };

  const analyzeRepairPackage = async (file: File, decisions: PackageRepairDecisions) => {
    setRepairLoading(true);
    setRepairError(undefined);
    try {
      const report = await analyzePackageRepair(file, decisions);
      setRepairReport(report);
      messageApi[report.repairable ? 'success' : 'warning'](
        report.repairable
          ? `分析完成：将执行 ${report.changes.length} 项确定性修复`
          : `分析完成：仍有 ${report.issues.length} 项需要处理`
      );
    } catch (error) {
      setRepairReport(undefined);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setRepairError(errorMessage);
      messageApi.error(errorMessage);
    } finally {
      setRepairLoading(false);
    }
  };

  const importRepairPackage = async (file: File) => {
    setRepairFile(file);
    setRepairDecisions({});
    setRepairReport(undefined);
    setRepairError(undefined);
    setRepairSubmission(undefined);
    await analyzeRepairPackage(file, {});
    return Upload.LIST_IGNORE;
  };

  const submitRepairPackage = async () => {
    if (!repairFile || !repairReport?.repairable || !repairSubmitter.trim()) return;
    setRepairLoading(true);
    setRepairError(undefined);
    try {
      const result = await submitRepairedPackage(repairFile, repairSubmitter.trim(), repairDecisions);
      setRepairReport(result.repairReport);
      if (!result.submission) {
        setRepairError('修复结果仍未通过投稿校验，请根据下方问题调整后重新分析。');
        messageApi.warning('仍有问题需要确认，尚未创建投稿。');
        return;
      }
      if (!result.submission.validationReport.valid || result.submission.status !== 'pending') {
        setRepairError('服务器未创建有效的待审核投稿，请重新分析后再试。');
        messageApi.error('修复后投稿未通过校验。');
        return;
      }
      setSubmissions((current) => [result.submission!, ...current]);
      setRepairSubmission(result.submission);
      messageApi.success('工具包已规范化并进入待审核队列');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setRepairError(errorMessage);
      messageApi.error(errorMessage);
    } finally {
      setRepairLoading(false);
    }
  };

  const resetRepairPackage = () => {
    setRepairFile(undefined);
    setRepairReport(undefined);
    setRepairDecisions({});
    setRepairError(undefined);
    setRepairSubmission(undefined);
  };

  const repairIssueCodes = new Set(repairReport?.issues.map((issue) => issue.code));
  const showRepairToolType = repairIssueCodes.has('tool_type_required') || Boolean(repairDecisions.toolType);
  const showRepairVersion = repairIssueCodes.has('version_required') || repairIssueCodes.has('version_invalid') || Boolean(repairDecisions.version);
  const showRepairEntryJson = Array.from(repairIssueCodes).some((code) => code.startsWith('entry_json') || code === 'chameleon_menu_mismatch') || Boolean(repairDecisions.entryJson);
  const showRepairCommand = repairIssueCodes.has('command_required') || repairIssueCodes.has('python_menu_invalid') || Boolean(repairDecisions.command);

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

      <Card className="release-desk-card" title={<Space><ToolOutlined />AI 工具包格式修复</Space>}>
        <Space direction="vertical" size={14} className="full-width" aria-busy={repairLoading}>
          <Alert
            type="info"
            showIcon
            message="上传前统一为 TAPython Tool Package v2"
            description="仅修复可验证的结构问题，不会猜测不明确的 toolType、command 或 entryJson；原 ZIP 不会被覆盖。"
          />
          <Flex gap={12} wrap="wrap" align="flex-start">
            <div style={{ flex: '1 1 360px' }}>
              <Upload.Dragger
                accept=".zip,.tapython-tool.zip,application/zip"
                multiple={false}
                showUploadList={false}
                beforeUpload={importRepairPackage}
                disabled={repairLoading || Boolean(repairSubmission)}
              >
                <p className="ant-upload-drag-icon"><ToolOutlined /></p>
                <p className="ant-upload-text">上传 AI 生成的 ZIP 并检查</p>
                <p className="ant-upload-hint">自动统一路径、协议常量、files hash/size 和菜单容器。</p>
              </Upload.Dragger>
            </div>
            <Space direction="vertical" size={8} style={{ flex: '1 1 260px' }}>
              <Text strong>提交人</Text>
              <Input id="repair-submitter" name="repairSubmitter" value={repairSubmitter} onChange={(event) => setRepairSubmitter(event.target.value)} placeholder="TA Team" aria-label="修复包提交人" />
              {repairFile ? <Text type="secondary">当前文件：{repairFile.name}</Text> : <Text type="secondary">尚未选择 ZIP</Text>}
            </Space>
          </Flex>

          {repairError ? <Alert type="error" showIcon message="本次操作未完成" description={repairError} /> : null}
          {repairSubmission ? (
            <Alert
              type="success"
              showIcon
              message="已进入待审核队列"
              description={`投稿 ${repairSubmission.slug} · ${repairSubmission.id} 已创建，不会重复提交。`}
            />
          ) : null}

          {showRepairToolType ? (
            <Space direction="vertical" size={6}>
              <Text strong id="repair-tool-type-label">确认工具类型</Text>
              <Radio.Group
                name="repairToolType"
                aria-labelledby="repair-tool-type-label"
                optionType="button"
                buttonStyle="solid"
                value={repairDecisions.toolType}
                onChange={(event) => setRepairDecisions((current) => ({ ...current, toolType: event.target.value as ToolType }))}
              >
                <Radio.Button value="chameleon">Chameleon 工具</Radio.Button>
                <Radio.Button value="python-script">Python 脚本</Radio.Button>
              </Radio.Group>
            </Space>
          ) : null}
          {showRepairVersion ? (
            <Space direction="vertical" size={6} className="full-width">
              <Text strong>确认发布版本</Text>
              <Input
                id="repair-version"
                name="repairVersion"
                value={repairDecisions.version}
                onChange={(event) => setRepairDecisions((current) => ({ ...current, version: event.target.value }))}
                placeholder="1.0.0"
                aria-label="发布版本"
              />
            </Space>
          ) : null}
          {showRepairEntryJson ? (
            <Space direction="vertical" size={6} className="full-width">
              <Text strong>确认 Chameleon 入口</Text>
              <Input
                id="repair-entry-json"
                name="repairEntryJson"
                value={repairDecisions.entryJson}
                onChange={(event) => setRepairDecisions((current) => ({ ...current, entryJson: event.target.value }))}
                placeholder="ToolName/ToolName.json"
                aria-label="Chameleon entryJson"
              />
            </Space>
          ) : null}
          {showRepairCommand ? (
            <Space direction="vertical" size={6} className="full-width">
              <Text strong>确认 Python 执行命令</Text>
              <Input
                id="repair-command"
                name="repairCommand"
                value={repairDecisions.command}
                onChange={(event) => setRepairDecisions((current) => ({ ...current, command: event.target.value }))}
                placeholder="import ToolName; ToolName.run()"
                aria-label="Python 执行命令"
              />
            </Space>
          ) : null}

          {repairReport ? (
            <Space direction="vertical" size={10} className="full-width">
              <div aria-live="polite">
                <Alert
                  type={repairReport.repairable ? 'success' : repairReport.issues.some((issue) => issue.level === 'error') ? 'error' : 'warning'}
                  showIcon
                  message={repairReport.repairable ? '可以生成标准投稿' : '仍需处理后才能投稿'}
                  description={`拟执行 ${repairReport.changes.length} 项修复，当前有 ${repairReport.issues.length} 项问题。`}
                />
              </div>
              <Flex gap={8} wrap="wrap" align="center" className="repair-identity-summary">
                <Text type="secondary">最终身份</Text>
                <Tag>{repairReport.detected.slug ?? 'slug 待确认'}</Tag>
                <Tag>{repairReport.detected.version ?? '版本待确认'}</Tag>
                <Tag color={repairReport.detected.toolType === 'python-script' ? 'blue' : 'cyan'}>
                  {repairReport.detected.toolType ? toolTypeLabel(repairReport.detected.toolType) : '类型待确认'}
                </Tag>
              </Flex>
              {repairReport.changes.length > 0 ? (
                <Collapse
                  size="small"
                  items={[{
                    key: 'changes',
                    label: `查看 ${repairReport.changes.length} 项修复`,
                    children: (
                      <List
                        size="small"
                        dataSource={repairReport.changes}
                        renderItem={(change) => (
                          <List.Item>
                            <Space direction="vertical" size={2} className="repair-wrap-content">
                              <Text code>{change.path}</Text>
                              <Text>{change.before ? `修改前：${change.before} · ` : ''}修改后：{change.after}</Text>
                              <Text type="secondary">{change.reason}</Text>
                            </Space>
                          </List.Item>
                        )}
                      />
                    )
                  }]}
                />
              ) : null}
              {repairReport.issues.length > 0 ? (
                <List
                  size="small"
                  dataSource={repairReport.issues}
                  renderItem={(issue) => (
                    <List.Item>
                      <Space align="start">
                        <Tag color={issue.level === 'error' ? 'red' : issue.level === 'needs-input' ? 'gold' : 'blue'}>{issue.level}</Tag>
                        <Text className="repair-wrap-content">{issue.path ? `${issue.path}：` : ''}{issue.message}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : null}
            </Space>
          ) : null}

          <Flex gap={10} wrap="wrap">
            <Button
              icon={<ReloadOutlined />}
              disabled={!repairFile || Boolean(repairSubmission)}
              loading={repairLoading}
              onClick={() => repairFile && void analyzeRepairPackage(repairFile, repairDecisions)}
            >
              重新分析
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              disabled={!repairFile || !repairReport?.repairable || !repairSubmitter.trim() || Boolean(repairSubmission)}
              loading={repairLoading}
              onClick={() => void submitRepairPackage()}
            >
              修复并提交审核
            </Button>
            {repairSubmission ? <Button onClick={resetRepairPackage}>修复另一个包</Button> : null}
            {!repairSubmitter.trim() && repairReport?.repairable ? <Text type="secondary">填写提交人后即可投稿。</Text> : null}
          </Flex>
        </Space>
      </Card>

      <section className="submission-grid">
        <Card id="submission-form" className="release-form-card" title={modeCopy.title}>
          <Alert type={submissionMode === 'new-tool' ? 'info' : 'warning'} showIcon message={modeCopy.title} description={modeCopy.description} />
          <Divider className="compact-divider" />
          <Form form={form} layout="vertical" initialValues={{ toolType: 'chameleon' }} onFinish={submit} disabled={loading}>
            <Form.Item name="slug" label={modeCopy.slugLabel} rules={[{ required: true }, { pattern: /^[a-z0-9-]+$/, message: '只允许小写字母、数字和连字符' }]}>
              <Input placeholder={modeCopy.slugPlaceholder} />
            </Form.Item>
            <Form.Item name="submitter" label="提交人" rules={[{ required: true }]}>
              <Input placeholder="TA Team" />
            </Form.Item>
            <Form.Item
              name="toolType"
              label="工具类型"
              htmlFor="submission-tool-type-chameleon"
              rules={[{ required: true, message: '请选择工具类型' }]}
              extra={(
                <span aria-live="polite">
                  {toolType === 'python-script'
                    ? '纯 Python、无 Slate 界面；MenuConfig 使用 command，默认挂载到 OnToolbar。'
                    : '包含 Slate JSON 界面；MenuConfig 使用 ChameleonTools，默认挂载到 OnToolBarChameleon。'}
                </span>
              )}
            >
              <Radio.Group optionType="button" buttonStyle="solid">
                <Radio.Button id="submission-tool-type-chameleon" value="chameleon">Chameleon 工具</Radio.Button>
                <Radio.Button value="python-script">Python 脚本</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item
              label={(
                <Flex align="center" gap={8} wrap="wrap">
                  <span>工具 Markdown</span>
                  <Button type="link" size="small" icon={<FileTextOutlined />} onClick={applyMarkdownTemplate}>
                    使用{toolTypeLabel(toolType)}模板
                  </Button>
                </Flex>
              )}
              required
            >
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
              <p className="ant-upload-hint">
                {toolType === 'python-script'
                  ? '上传 Markdown 中 @file 引用的 .py、__init__.py、MenuConfig.snippet.json 等文本资源；纯脚本工具不需要 Slate UI JSON。'
                  : '上传 Markdown 中 @file 引用的 Slate UI .json、Controller .py、__init__.py、MenuConfig.snippet.json 等文本资源。'}
              </p>
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
          title="我的投稿状态"
          extra={<Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>刷新</Button>}
        >
          <Space direction="vertical" size={12} className="full-width">
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

function extractMarkdownSlug(markdown: string): string | undefined {
  return extractMarkdownFrontMatterValue(markdown, 'slug');
}

function extractMarkdownSubmitter(markdown: string): string | undefined {
  return extractMarkdownFrontMatterValue(markdown, 'author') ?? extractMarkdownFrontMatterValue(markdown, 'ownerTeam');
}

function extractMarkdownToolType(markdown: string): ToolType | undefined {
  const value = extractMarkdownFrontMatterValue(markdown, 'toolType');
  return value === 'chameleon' || value === 'python-script' ? value : undefined;
}

function toolTypeLabel(toolType: ToolType): string {
  return toolType === 'python-script' ? 'Python 脚本' : 'Chameleon 工具';
}

function buildMarkdownTemplate(toolType: ToolType, slug: string, submitter: string): string {
  const toolName = slug.split('-').filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join('') || 'MyTool';
  const isScript = toolType === 'python-script';
  const mountPoint = isScript ? 'OnToolbar' : 'OnToolBarChameleon';
  const menuEntry = isScript
    ? `    - name: ${toolName}\n      command: import ${toolName}; ${toolName}.run()`
    : `    - name: ${toolName}\n      ChameleonTools: ../Python/${toolName}/${toolName}.json\n      ExtensionHookName: OnToolBarChameleon`;
  const entryJson = isScript ? '' : `entryJson: ${toolName}/${toolName}.json\n`;
  const resourceBlocks = isScript
    ? `\`\`\`python controller path=${toolName}/${toolName}.py\n@file:${toolName}/${toolName}.py\n\`\`\``
    : `\`\`\`json chameleon-ui path=${toolName}/${toolName}.json\n@file:${toolName}/${toolName}.json\n\`\`\`\n\n\`\`\`python controller path=${toolName}/${toolName}.py\n@file:${toolName}/${toolName}.py\n\`\`\``;
  return `---
schemaVersion: "1.0.0"
slug: ${slug}
name: ${toolName}
displayName: ${toolName}
version: "1.0.0"
releasedAt: "${new Date().toISOString().slice(0, 10)}"
updatedAt: "${new Date().toISOString().slice(0, 10)}"
author: ${submitter}
ownerTeam: ${submitter}
status: pending
description: 请填写工具用途和适用场景。
category: utility
toolType: ${toolType}
riskLevel: low
sourceMode: markdown-with-external-files
tags: [python]
compatibility:
  unrealEngine: ["5.5"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
dependencies: []
mountPoint: ${mountPoint}
installPath: <Project>/TA/TAPython/Python/${toolName}/
${entryJson}changeSummary: Initial release.
summary:
  features:
    - 请填写核心功能。
  unrealApis: []
  widgetAkas: []
  installSteps:
    - 安装 Python 文件并合并菜单配置。
  riskNotes: []
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: ${mountPoint}
  itemsToAdd:
${menuEntry}
preInstallChecks: []
postInstallSteps:
  - Reload TAPython 或重启 UE 编辑器
uninstallSteps: []
---

# ${toolName}

## 快速开始

1. 安装工具并 Reload TAPython。

## 资源

${resourceBlocks}
`;
}

function extractMarkdownFrontMatterValue(markdown: string, fieldName: string): string | undefined {
  const frontMatterMatch = markdown.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (!frontMatterMatch) {
    return undefined;
  }

  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fieldMatch = frontMatterMatch[1].match(new RegExp(`^${escapedFieldName}:\\s*(.+?)\\s*$`, 'm'));
  return normalizeFrontMatterScalar(fieldMatch?.[1]);
}

function normalizeFrontMatterScalar(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).trim() || undefined;
  }

  return trimmed.replace(/\s+#.*$/, '').trim() || undefined;
}

function getSubmissionErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (/immutable|same slug|same version|already published|同.*版本|已发布/.test(errorMessage)) {
    return `${errorMessage}。建议把 version 改为下一个未发布版本后重新提交。`;
  }
  return errorMessage;
}
