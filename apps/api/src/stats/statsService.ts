import type { SqliteDatabase } from '../database/sqlite.js';

type Row = Record<string, unknown>;
const num = (value: unknown) => Number(value ?? 0);

export interface StatsOptions {
  now?: () => Date;
  // Local-calendar offset for day/week/month buckets (the team works in UTC+8).
  tzOffsetHours?: number;
}

export class StatsService {
  private readonly now: () => Date;
  private readonly offset: string;

  constructor(private readonly db: SqliteDatabase, options: StatsOptions = {}) {
    this.now = options.now ?? (() => new Date());
    const hours = options.tzOffsetHours ?? 8;
    this.offset = `${hours >= 0 ? '+' : '-'}${Math.abs(hours)} hours`;
  }

  private all(sql: string, ...params: Array<string | number>): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  private sinceDays(days: number): string {
    return new Date(this.now().getTime() - days * 24 * 3600_000).toISOString();
  }

  platform() {
    const total = num(this.all('SELECT COUNT(*) AS n FROM tools')[0]?.n);
    const group = (column: string) => this.all(`SELECT COALESCE(${column}, '(未填写)') AS name, COUNT(*) AS count FROM tools GROUP BY 1 ORDER BY count DESC, name`).map((r) => ({ name: String(r.name), count: num(r.count) }));

    const downloads30 = this.sinceDays(30);
    const dailyRows = this.all(
      `SELECT date(at, ?) AS day, COUNT(*) AS count FROM events WHERE type = 'download.package' AND at >= ? GROUP BY day ORDER BY day`,
      this.offset,
      downloads30
    );
    const byDay = new Map(dailyRows.map((r) => [String(r.day), num(r.count)]));
    const series: Array<{ day: string; downloads: number }> = [];
    for (let i = 29; i >= 0; i -= 1) {
      const day = new Date(this.now().getTime() + this.offsetMs() - i * 24 * 3600_000).toISOString().slice(0, 10);
      series.push({ day, downloads: byDay.get(day) ?? 0 });
    }

    const top = (since?: string) =>
      this.all(
        `SELECT e.slug AS slug, COALESCE(t.display_name, e.slug) AS name, COUNT(*) AS downloads
         FROM events e LEFT JOIN tools t ON t.slug = e.slug
         WHERE e.type = 'download.package' AND e.slug IS NOT NULL ${since ? 'AND e.at >= ?' : ''}
         GROUP BY e.slug ORDER BY downloads DESC, e.slug LIMIT 10`,
        ...(since ? [since] : [])
      ).map((r) => ({ slug: String(r.slug), name: String(r.name), downloads: num(r.downloads) }));

    const reach = this.all(
      `SELECT COUNT(DISTINCT device_id) AS devices, COUNT(DISTINCT open_id) AS users, SUM(type = 'tool.install') AS installs
       FROM events WHERE source = 'client' AND at >= ?`,
      downloads30
    )[0];

    return {
      generatedAt: this.now().toISOString(),
      tools: {
        total,
        versions: num(this.all('SELECT COUNT(*) AS n FROM tool_versions')[0]?.n),
        byStatus: group('status'),
        byCategory: group('category'),
        byTeam: group('owner_team')
      },
      downloads: {
        total: num(this.all("SELECT COUNT(*) AS n FROM events WHERE type = 'download.package'")[0]?.n),
        last30Days: series.reduce((sum, point) => sum + point.downloads, 0),
        daily: series,
        topAllTime: top(),
        topLast30Days: top(downloads30)
      },
      releasesByMonth: this.all(
        `SELECT substr(released_at, 1, 7) AS month, COUNT(*) AS count FROM tool_versions WHERE released_at IS NOT NULL
         GROUP BY month ORDER BY month DESC LIMIT 12`
      ).map((r) => ({ month: String(r.month), versions: num(r.count) })).reverse(),
      reach: { devices30d: num(reach?.devices), users30d: num(reach?.users), installs30d: num(reach?.installs) }
    };
  }

  private offsetMs(): number {
    const sign = this.offset.startsWith('-') ? -1 : 1;
    return sign * Number.parseInt(this.offset.slice(1), 10) * 3600_000;
  }

  process() {
    const byStatus = this.all('SELECT status, COUNT(*) AS count FROM submissions GROUP BY status ORDER BY count DESC').map((r) => ({ status: String(r.status), count: num(r.count) }));
    const weekly = this.all(
      `SELECT strftime('%Y-W%W', created_at, ?) AS week, COUNT(*) AS count FROM submissions WHERE created_at >= ? GROUP BY week ORDER BY week`,
      this.offset,
      this.sinceDays(7 * 12)
    ).map((r) => ({ week: String(r.week), submissions: num(r.count) }));

    // First review minus creation time, for submissions that have at least one review.
    const latencies = this.all(
      `SELECT (julianday(MIN(r.created_at)) - julianday(s.created_at)) * 24 AS hours
       FROM submissions s JOIN submission_reviews r ON r.submission_id = s.id GROUP BY s.id`
    ).map((r) => num(r.hours)).filter((hours) => hours >= 0).sort((a, b) => a - b);
    const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
    const average = latencies.length ? latencies.reduce((sum, hours) => sum + hours, 0) / latencies.length : null;

    const decisions = this.all('SELECT decision, COUNT(*) AS count FROM submission_reviews GROUP BY decision');
    const count = (decision: string) => num(decisions.find((r) => r.decision === decision)?.count);
    const approved = count('approved');
    const rejected = count('rejected');
    const oldestPending = this.all("SELECT MIN(created_at) AS at FROM submissions WHERE status = 'pending'")[0]?.at;

    return {
      generatedAt: this.now().toISOString(),
      submissions: { total: byStatus.reduce((sum, r) => sum + r.count, 0), byStatus, weekly },
      pending: {
        count: num(this.all("SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending'")[0]?.n),
        oldestAgeHours: typeof oldestPending === 'string' ? (this.now().getTime() - Date.parse(oldestPending)) / 3600_000 : null
      },
      review: {
        decisions: { approved, rejected, changesRequested: count('changes_requested') },
        approvalRate: approved + rejected > 0 ? approved / (approved + rejected) : null,
        firstReviewHours: { median, average, samples: latencies.length }
      }
    };
  }

  contribution() {
    const teams = this.all(
      `SELECT COALESCE(t.owner_team, '(未填写)') AS team, COUNT(DISTINCT t.slug) AS tools,
         (SELECT COUNT(*) FROM tool_versions v WHERE v.slug IN (SELECT slug FROM tools x WHERE COALESCE(x.owner_team, '(未填写)') = COALESCE(t.owner_team, '(未填写)'))) AS versions,
         (SELECT COUNT(*) FROM events e WHERE e.type = 'download.package' AND e.slug IN (SELECT slug FROM tools x WHERE COALESCE(x.owner_team, '(未填写)') = COALESCE(t.owner_team, '(未填写)'))) AS downloads,
         MAX(t.updated_at) AS lastUpdated
       FROM tools t GROUP BY team ORDER BY tools DESC, team`
    ).map((r) => ({ team: String(r.team), tools: num(r.tools), versions: num(r.versions), downloads: num(r.downloads), lastUpdated: r.lastUpdated === null ? null : String(r.lastUpdated) }));

    // Each version belongs to its author text; the alias table turns that text into a person, a team name or nothing.
    const authors = this.all(
      `SELECT v.author AS author, COUNT(DISTINCT v.slug) AS tools, COUNT(*) AS versions,
         (SELECT COUNT(*) FROM events e JOIN tool_versions v2 ON v2.slug = e.slug AND v2.version = e.version
            WHERE e.type = 'download.package' AND v2.author = v.author) AS downloads
       FROM tool_versions v WHERE v.author IS NOT NULL GROUP BY v.author`
    );
    const aliasRows = this.all('SELECT a.alias, a.kind, a.open_id, u.name, u.department, u.team FROM author_aliases a LEFT JOIN users u ON u.open_id = a.open_id');
    const aliasByName = new Map(aliasRows.map((a) => [String(a.alias).toLowerCase(), a]));

    const people = new Map<string, { openId: string; name: string; team: string | null; tools: number; versions: number; downloads: number; aliases: string[] }>();
    const teamAuthors: Array<{ name: string; tools: number; versions: number; downloads: number }> = [];
    const unbound: Array<{ name: string; tools: number; versions: number; downloads: number }> = [];
    for (const row of authors) {
      const stats = { tools: num(row.tools), versions: num(row.versions), downloads: num(row.downloads) };
      const alias = aliasByName.get(String(row.author).toLowerCase());
      if (!alias) {
        unbound.push({ name: String(row.author), ...stats });
      } else if (alias.kind === 'team') {
        teamAuthors.push({ name: String(row.author), ...stats });
      } else {
        const openId = String(alias.open_id);
        const entry = people.get(openId) ?? { openId, name: String(alias.name), team: (alias.team ?? alias.department ?? null) as string | null, tools: 0, versions: 0, downloads: 0, aliases: [] };
        entry.tools += stats.tools;
        entry.versions += stats.versions;
        entry.downloads += stats.downloads;
        entry.aliases.push(String(row.author));
        people.set(openId, entry);
      }
    }

    const reviewsByPerson = this.all('SELECT reviewer_open_id AS open_id, COUNT(*) AS n FROM submission_reviews WHERE reviewer_open_id IS NOT NULL GROUP BY reviewer_open_id');
    const reviewCount = new Map(reviewsByPerson.map((r) => [String(r.open_id), num(r.n)]));
    const reviewers = this.all('SELECT u.open_id, u.name, u.department, u.team FROM submission_reviews r JOIN users u ON u.open_id = r.reviewer_open_id GROUP BY u.open_id');
    for (const reviewer of reviewers) {
      if (!people.has(String(reviewer.open_id))) {
        people.set(String(reviewer.open_id), { openId: String(reviewer.open_id), name: String(reviewer.name), team: (reviewer.team ?? reviewer.department ?? null) as string | null, tools: 0, versions: 0, downloads: 0, aliases: [] });
      }
    }

    const byTools = (a: { tools: number; versions: number }, b: { tools: number; versions: number }) => b.tools - a.tools || b.versions - a.versions;
    return {
      generatedAt: this.now().toISOString(),
      teams,
      people: [...people.values()].map((p) => ({ ...p, reviews: reviewCount.get(p.openId) ?? 0 })).sort(byTools),
      teamAuthors: teamAuthors.sort(byTools),
      unbound: unbound.sort(byTools),
      legacyReviews: num(this.all('SELECT COUNT(*) AS n FROM submission_reviews WHERE reviewer_open_id IS NULL')[0]?.n)
    };
  }
}
