import type { ToolRecord } from '@tapython-tool-hub/shared';
import actorRenameToolApi from '../../public/api/tools/actor-rename-tool.json';
import testSelectionAuditToolApi from '../../public/api/tools/test-selection-audit-tool.json';

export const tools = [actorRenameToolApi.tool as ToolRecord, testSelectionAuditToolApi.tool as ToolRecord];

export const categories = Array.from(new Set(tools.map((tool) => tool.category))).sort();
export const riskLevels = Array.from(new Set(tools.map((tool) => tool.riskLevel))).sort();
export const statuses = Array.from(new Set(tools.map((tool) => tool.status))).sort();

export function getTools() {
  return tools;
}