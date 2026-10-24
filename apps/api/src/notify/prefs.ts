import type { SqliteDatabase } from '../database/sqlite.js';

export class NotificationPrefs {
  constructor(private readonly db: SqliteDatabase) {}

  get(openId: string): { listed: boolean } {
    const row = this.db.prepare('SELECT notify_listed FROM users WHERE open_id = ?').get(openId);
    return { listed: Number(row?.notify_listed ?? 1) === 1 };
  }

  setListed(openId: string, listed: boolean): void {
    this.db.prepare('UPDATE users SET notify_listed = ? WHERE open_id = ?').run(listed ? 1 : 0, openId);
  }
}
