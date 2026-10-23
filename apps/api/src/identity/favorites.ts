import type { SqliteDatabase } from '../database/sqlite.js';

const slugPattern = /^[a-z0-9][a-z0-9-]{0,127}$/;
export const maxFavorites = 500;

export const isValidSlug = (value: unknown): value is string => typeof value === 'string' && slugPattern.test(value);

export class FavoriteLimitError extends Error {}

export class FavoriteStore {
  constructor(private readonly db: SqliteDatabase, private readonly now: () => Date = () => new Date()) {}

  list(openId: string): string[] {
    return this.db.prepare('SELECT slug FROM favorites WHERE open_id = ? ORDER BY created_at, slug').all(openId).map((row) => String(row.slug));
  }

  // Union of what the server already has and what a device brings along; never removes anything.
  merge(openId: string, slugs: string[]): string[] {
    const unique = [...new Set(slugs)];
    const existing = new Set(this.list(openId));
    const fresh = unique.filter((slug) => !existing.has(slug));
    if (existing.size + fresh.length > maxFavorites) {
      throw new FavoriteLimitError(`at most ${maxFavorites} favorites`);
    }
    const insert = this.db.prepare('INSERT INTO favorites (open_id, slug, created_at) VALUES (?, ?, ?) ON CONFLICT(open_id, slug) DO NOTHING');
    const stamp = this.now().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const slug of fresh) {
        insert.run(openId, slug, stamp);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.list(openId);
  }

  add(openId: string, slug: string): void {
    this.merge(openId, [slug]);
  }

  remove(openId: string, slug: string): void {
    this.db.prepare('DELETE FROM favorites WHERE open_id = ? AND slug = ?').run(openId, slug);
  }
}
