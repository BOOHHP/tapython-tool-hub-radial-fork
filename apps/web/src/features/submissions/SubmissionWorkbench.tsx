import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
  ReloadOutlined,
  UploadOutlined
} from '@ant-design/icons';
import { Alert, Button, Card, Empty, Flex, Form, Input, List, Space, Tag, Timeline, Typography, Upload, message } from 'antd';
import { useEffect, useState } from 'react';
import type { SubmissionAssetPayload, SubmissionRecord, ToolSubmissionRequest } from '@tapython-tool-hub/shared';
import { createSubmission, listSubmissions, reviewSubmission } from '../../services/submissionWorkflow';
import { statusColor } from '../tools/display';

const { Paragraph, Text, Title } = Typography;

export function SubmissionWorkbench() {
  const [form] = Form.useForm<ToolSubmissionRequest>();
  const [messageApi, contextHolder] = message.useMessage();
  const [assets, setAssets] = useState<SubmissionAssetPayload[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewer, setReviewer] = useState('TA Reviewer');

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
      messageApi.error(error instanceof Error ? error.message : String(error));
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

  return (
    <Space direction="vertical" size={16} className="full-width submission-workbench">
      {contextHolder}
      <Card>
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
        <Card title="提交工具或新版本">
          <Form form={form} layout="vertical" onFinish={submit} disabled={loading}>
            <Form.Item name="slug" label="Slug" rules={[{ required: true }, { pattern: /^[a-z0-9-]+$/, message: '只允许小写字母、数字和连字符' }]}>
              <Input placeholder="my-tool" />
            </Form.Item>
            <Form.Item name="submitter" label="提交人" rules={[{ required: true }]}>
              <Input placeholder="TA Team" />
            </Form.Item>
            <Form.Item name="markdown" label="工具 Markdown" rules={[{ required: true }]}>
              <Input.TextArea rows={14} placeholder="粘贴包含 front matter 的工具 Markdown" />
            </Form.Item>
            <Form.Item name="notes" label="投稿备注">
              <Input.TextArea rows={3} placeholder="兼容性、风险说明或审核备注" />
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
              <p className="ant-upload-text">上传 Markdown 中 @file 引用的文本资源</p>
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
              提交并校验
            </Button>
          </Form>
        </Card>

        <Card
          title="审核队列"
          extra={<Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>刷新</Button>}
        >
          <Space direction="vertical" size={12} className="full-width">
            <Input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="审核人" />
            {submissions.length === 0 ? <Empty description="暂无投稿" /> : null}
            <List
              loading={loading}
              dataSource={submissions}
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
                      <Space wrap>
                        <Button
                          icon={<CheckCircleOutlined />}
                          type="primary"
                          disabled={!submission.validationReport.valid || submission.status === 'approved'}
                          onClick={() => review(submission, 'approved')}
                        >
                          通过并发布
                        </Button>
                        <Button
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
                      <Alert
                        type={submission.validationReport.valid ? 'warning' : 'error'}
                        showIcon
                        message="校验报告"
                        description={submission.validationReport.issues.map((issue) => `${issue.path ? `${issue.path}: ` : ''}${issue.message}`).join('\n')}
                      />
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