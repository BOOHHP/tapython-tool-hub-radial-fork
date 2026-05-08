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
import { deleteAdminSubmission, listAdminSubmissions, reviewAdminSubmission, updateAdminTool } from '../../services/adminConsole';
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
  const [reviewer, setReviewer] = useState('TA Admin');
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>('pending');
  const selectedSlug = Form.useWatch('slug', form);
  const selectedTool = useMemo(() => tools.find((tool) => tool.slug === selectedSlug), [selectedSlug, tools]);

  const filteredSubmissions = useMemo(() => submissions.filter((submission) => {
    if (submissionFilter === 'all') return true;
    if (submissionFilter === 'validation_failed') return !submission.validationReport.valid;
    return submission.status === submissionFilter;
  }), [submissionFilter, submissions]);

  const refreshSubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    try {
      setSubmissions(await listAdminSubmissions());
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSubmissions(false);
    }
  }, [messageApi]);

  useEffect(() => {
    void refreshSubmissions();
    const intervalId = window.setInterval(() => {
      void refreshSubmissions();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [refreshSubmissions]);

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
      const updated = await reviewAdminSubmission(submission.id, { reviewer, decision });
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

  const submissionColumns: ColumnsType<SubmissionRecord> = [
    {
      title: '工具',
      dataIndex: 'slug',
      render: (_, submission) => (
        <Space direction="vertical" size={2}>
          <Text strong>{submission.slug}</Text>
          <Text type="secondary">{submission.submitter}</Text>
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
      render: (_, submission) => submission.validationReport.issues.length > 0
        ? `${submission.validationReport.issues.length} 条问题`
        : '通过'
    },
    {
      title: '操作',
      width: 330,
      render: (_, submission) => (
        <Space wrap>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={submittingReview === submission.id}
            disabled={!submission.validationReport.valid || submission.status === 'approved'}
            onClick={() => void review(submission, 'approved')}
          >
            通过并发布
          </Button>
          <Button
            danger
            icon={<CloseCircleOutlined />}
            loading={submittingReview === submission.id}
            disabled={submission.status === 'rejected'}
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
            <Button danger icon={<DeleteOutlined />} loading={submittingReview === submission.id}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={18} className="full-width admin-console">
      {contextHolder}
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={15}>
          <Card
            title="上传工具审核"
            extra={<Button icon={<ReloadOutlined />} onClick={() => void refreshSubmissions()} loading={loadingSubmissions}>刷新</Button>}
          >
            <Space direction="vertical" size={12} className="full-width">
              <Flex align="center" justify="space-between" gap={12} wrap="wrap">
                <Input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="审核人" className="admin-reviewer-input" />
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
                expandable={{
                  expandedRowRender: (submission) => (
                    <Space direction="vertical" size={8} className="full-width">
                      {submission.notes ? <Paragraph type="secondary">备注：{submission.notes}</Paragraph> : null}
                      {submission.validationReport.issues.length > 0 ? (
                        submission.validationReport.issues.map((issue, index) => (
                          <Alert key={`${submission.id}-${index}`} type={issue.level === 'error' ? 'error' : 'warning'} showIcon message={issue.path ?? issue.level} description={issue.message} />
                        ))
                      ) : <Alert type="success" showIcon message="校验通过" description="可发布为工具库产物。" />}
                      {submission.reviews[0] ? <Text type="secondary">最近审核：{submission.reviews[0].reviewer} / {submission.reviews[0].decision}</Text> : null}
                    </Space>
                  )
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
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingTool}>保存并刷新</Button>
                  </Flex>
                </>
              ) : (
                <Empty description="选择工具后编辑发布状态和信息" />
              )}
            </Form>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
