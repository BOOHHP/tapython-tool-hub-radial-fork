import type { SubmissionRecord, ToolSubmissionRequest, ValidationReport } from '@tapython-tool-hub/shared';

export interface SubmissionRepository {
  list(): Promise<SubmissionRecord[]>;
  get(id: string): Promise<SubmissionRecord | undefined>;
  create(request: ToolSubmissionRequest, validationReport: ValidationReport): Promise<SubmissionRecord>;
  save(submission: SubmissionRecord): Promise<SubmissionRecord>;
  delete(id: string): Promise<boolean>;
}