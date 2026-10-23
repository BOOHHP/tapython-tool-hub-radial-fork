import type { ToolRecord } from '@tapython-tool-hub/shared';

export interface CollectionModuleFilters {
  query?: string;
  category?: string;
  riskLevel?: string;
  status?: string;
}

export interface CollectionSummary {
  moduleCount: number;
  categoryCount: number;
  categories: Array<{ name: string; count: number }>;
  risks: { low: number; medium: number; high: number };
}

export function getCatalogTools(tools: ToolRecord[]): ToolRecord[] {
  return tools.filter((tool) => tool.collection?.role !== 'module');
}

export function getCollectionModules(tools: ToolRecord[], collectionId: string): ToolRecord[] {
  return tools
    .filter((tool) => tool.collection?.role === 'module' && tool.collection.id === collectionId)
    .sort(compareModules);
}

export function summarizeCollection(modules: ToolRecord[]): CollectionSummary {
  const categoryCounts = new Map<string, number>();
  const risks = { low: 0, medium: 0, high: 0 };

  for (const module of modules) {
    const category = module.collection?.categoryPath?.[0] ?? '未分类';
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    risks[module.riskLevel] += 1;
  }

  const categories = Array.from(categoryCounts, ([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));

  return {
    moduleCount: modules.length,
    categoryCount: categories.length,
    categories,
    risks
  };
}

export function filterCollectionModules(modules: ToolRecord[], filters: CollectionModuleFilters): ToolRecord[] {
  const query = filters.query?.trim().toLowerCase();
  return modules.filter((module) => {
    const categoryPath = module.collection?.categoryPath ?? [];
    const searchText = [
      module.name,
      module.displayName,
      module.description,
      module.slug,
      module.collection?.moduleId,
      ...categoryPath,
      ...module.tags
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      (!query || searchText.includes(query)) &&
      (!filters.category || categoryPath[0] === filters.category) &&
      (!filters.riskLevel || module.riskLevel === filters.riskLevel) &&
      (!filters.status || module.status === filters.status)
    );
  });
}

function compareModules(left: ToolRecord, right: ToolRecord): number {
  const leftPath = left.collection?.categoryPath?.join('/') ?? '';
  const rightPath = right.collection?.categoryPath?.join('/') ?? '';
  return leftPath.localeCompare(rightPath, 'zh-CN') || left.displayName.localeCompare(right.displayName, 'zh-CN');
}
