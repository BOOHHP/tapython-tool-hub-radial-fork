import { apiBaseUrl } from './apiBaseUrl';

export class StatsAccessError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? 'login_required' : 'forbidden');
  }
}

export interface NameCount { name: string; count: number }

export interface PlatformStats {
  generatedAt: string;
  tools: { total: number; versions: number; byStatus: NameCount[]; byCategory: NameCount[]; byTeam: NameCount[] };
  downloads: {
    total: number;
    last30Days: number;
    daily: Array<{ day: string; downloads: number }>;
    topAllTime: Array<{ slug: string; name: string; downloads: number }>;
    topLast30Days: Array<{ slug: string; name: string; downloads: number }>;
  };
  releasesByMonth: Array<{ month: string; versions: number }>;
  reach: { devices30d: number; users30d: number; installs30d: number };
}

interface ContributionRow { tools: number; versions: number; downloads: number }

export interface ContributionStats {
  generatedAt: string;
  teams: Array<ContributionRow & { team: string; lastUpdated: string | null }>;
  people: Array<ContributionRow & { openId: string; name: string; team: string | null; aliases: string[]; reviews: number }>;
  teamAuthors: Array<ContributionRow & { name: string }>;
  unbound: Array<ContributionRow & { name: string }>;
  legacyReviews: number;
}

export interface ProcessStats {
  generatedAt: string;
  submissions: { total: number; byStatus: Array<{ status: string; count: number }>; weekly: Array<{ week: string; submissions: number }> };
  pending: { count: number; oldestAgeHours: number | null };
  review: {
    decisions: { approved: number; rejected: number; changesRequested: number };
    approvalRate: number | null;
    firstReviewHours: { median: number | null; average: number | null; samples: number };
  };
}

async function load<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: 'include' });
  if (response.status === 401 || response.status === 403) {
    throw new StatsAccessError(response.status);
  }
  if (!response.ok) {
    throw new Error(`加载统计数据失败：${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const getPlatformStats = () => load<PlatformStats>('/api/v1/stats/platform');
export const getContributionStats = () => load<ContributionStats>('/api/v1/stats/contribution');
export const getProcessStats = () => load<ProcessStats>('/api/v1/stats/process');