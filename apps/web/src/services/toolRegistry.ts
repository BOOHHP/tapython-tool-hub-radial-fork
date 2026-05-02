import type { ToolRecord } from '@tapython-tool-hub/shared';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8787';

interface ToolIndexResponse {
  tools: Array<{ slug: string; apiUrl: string }>;
}

interface ToolDetailResponse {
  tool: ToolRecord;
}

export async function getTools(): Promise<ToolRecord[]> {
  const indexResponse = await fetch(`${apiBaseUrl}/api/tools/index.json`);
  if (!indexResponse.ok) {
    throw new Error(`Failed to load tool index: ${indexResponse.status}`);
  }

  const index = await indexResponse.json() as ToolIndexResponse;
  const details = await Promise.all(index.tools.map(async (tool) => {
    const detailResponse = await fetch(`${apiBaseUrl}${tool.apiUrl}`);
    if (!detailResponse.ok) {
      throw new Error(`Failed to load tool detail '${tool.slug}': ${detailResponse.status}`);
    }
    return (await detailResponse.json() as ToolDetailResponse).tool;
  }));

  return details;
}

export function getCategories(tools: ToolRecord[]): string[] {
  return Array.from(new Set(tools.map((tool) => tool.category))).sort();
}

export function getRiskLevels(tools: ToolRecord[]): string[] {
  return Array.from(new Set(tools.map((tool) => tool.riskLevel))).sort();
}

export function getStatuses(tools: ToolRecord[]): string[] {
  return Array.from(new Set(tools.map((tool) => tool.status))).sort();
}

export function getApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}