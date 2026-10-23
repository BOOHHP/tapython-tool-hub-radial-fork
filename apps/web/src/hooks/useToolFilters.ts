import { useMemo, useState } from 'react';
import type { ToolRecord } from '@tapython-tool-hub/shared';

export function useToolFilters(tools: ToolRecord[]) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>();
  const [riskLevel, setRiskLevel] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [toolType, setToolType] = useState<string>();

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tools.filter((tool) => {
      const searchText = [
        tool.name,
        tool.displayName,
        tool.description,
        tool.category,
        tool.author,
        tool.ownerTeam,
        ...tool.tags,
        ...tool.summary.unrealApis,
        ...tool.summary.widgetAkas
      ]
        .join(' ')
        .toLowerCase();

      return (
        (!normalizedQuery || searchText.includes(normalizedQuery)) &&
        (!category || tool.category === category) &&
        (!riskLevel || tool.riskLevel === riskLevel) &&
        (!status || tool.status === status) &&
        (!toolType || (tool.toolType ?? 'chameleon') === toolType)
      );
    });
  }, [category, query, riskLevel, status, toolType, tools]);

  return {
    filteredTools,
    query,
    category,
    riskLevel,
    status,
    toolType,
    setQuery,
    setCategory,
    setRiskLevel,
    setStatus,
    setToolType
  };
}