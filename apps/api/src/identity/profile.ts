import type { SqliteDatabase } from '../database/sqlite.js';
import { AliasError, type AuthorAliases } from './authorAliases.js';

type Row = Record<string, unknown>;

// "Mine" is derived from the aliases a person is bound to; names are matched case-insensitively.
const mineVersion = 'EXISTS (SELECT 1 FROM author_aliases a WHERE a.open_id = ? AND a.alias = v.author COLLATE NOCASE)';
const mineSubmission = 'EXISTS (SELECT 1 FROM author_aliases a WHERE a.open_id = ? AND a.alias = s.submitter COLLATE NOCASE)';

export class ProfileService {
  constructor(private readonly db: SqliteDatabase, private readonly aliases: AuthorAliases) {}

  private all(sql: string, ...params: string[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  get(openId: string) {
    const tools = this.all(
      `SELECT t.slug, t.display_name AS name, t.latest_version AS latestVersion, COUNT(*) AS versions,
         (SELECT COUNT(*) FROM events e JOIN tool_versions v2 ON v2.slug = e.slug AND v2.version = e.version
            WHERE e.type = 'download.package' AND e.slug = t.slug
              AND EXISTS (SELECT 1 FROM author_aliases a WHERE a.open_id = ? AND a.alias = v2.author COLLATE NOCASE)) AS downloads
       FROM tool_versions v JOIN tools t ON t.slug = v.slug
       WHERE ${mineVersion} GROUP BY t.slug ORDER BY t.display_name`,
      openId,
      openId
    ).map((r) => ({ slug: String(r.slug), name: String(r.name), latestVersion: r.latestVersion === null ? null : String(r.latestVersion), versions: Number(r.versions), downloads: Number(r.downloads) }));

    const submissions = this.all(
      `SELECT s.id, s.slug, s.status, s.updated_at AS updatedAt FROM submissions s WHERE ${mineSubmission} ORDER BY s.updated_at DESC LIMIT 50`,
      openId
    ).map((r) => ({ id: String(r.id), slug: String(r.slug), status: String(r.status), updatedAt: String(r.updatedAt) }));

    const reviews = this.all(
      `SELECT r.decision, r.created_at AS createdAt, s.slug FROM submission_reviews r JOIN submissions s ON s.id = r.submission_id
       WHERE r.reviewer_open_id = ? ORDER BY r.created_at DESC LIMIT 20`,
      openId
    ).map((r) => ({ slug: String(r.slug), decision: String(r.decision), createdAt: String(r.createdAt) }));
    const reviewTotal = Number(this.all('SELECT COUNT(*) AS n FROM submission_reviews WHERE reviewer_open_id = ?', openId)[0]?.n ?? 0);

    return {
      aliases: this.aliases.list().filter((a) => a.openId === openId).map((a) => a.alias),
      claimable: this.aliases.candidates().filter((c) => !c.kind).map((c) => ({ name: c.name, submissions: c.submissions, tools: c.tools })),
      tools,
      submissions,
      reviews: { total: reviewTotal, recent: reviews }
    };
  }

  // Members may only take names nobody has claimed yet; reassigning is an admin action.
  claim(openId: string, alias: string): void {
    const name = alias.trim();
    const all = this.aliases.candidates();
    const candidate = all.find((c) => c.name === name) ?? all.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!candidate) {
      throw new AliasError('unknown name');
    }
    if (candidate.kind) {
      throw new AliasError('already bound');
    }
    this.aliases.bind(openId, candidate.name, 'person', openId);
  }

  release(openId: string, alias: string): boolean {
    const own = this.aliases.list().find((a) => a.alias.toLowerCase() === alias.trim().toLowerCase() && a.openId === openId);
    return own ? this.aliases.unbind(openId, own.alias) : false;
  }
}
