import { randomUUID } from 'node:crypto';
import type { SqliteDatabase } from '../database/sqlite.js';

export type EventClient = 'installer' | 'cli' | 'web';

// Closed list so dashboards never have to guess what a free-form string means.
export const clientEventTypes = ['app.launch', 'tool.install', 'tool.install_failed', 'tool.update', 'tool.uninstall'] as const;
const maxBatch = 50;
const maxMetaBytes = 2048;
const maxPastMs = 30 * 24 * 3600_000;
const maxFutureMs = 5 * 60_000;
export const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const slugPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const versionPattern = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const clients: EventClient[] = ['installer', 'cli', 'web'];

export interface ClientEvent {
  eventId: string;
  type: string;
  at?: string;
  slug?: string;
  version?: string;
  meta?: Record<string, unknown>;
}

export interface EventBatch {
  deviceId: string;
  client: EventClient;
  clientVersion?: string;
  ueVersion?: string;
  events: ClientEvent[];
}

export type BatchParse = { ok: true; batch: EventBatch } | { ok: false; error: string };

function optionalText(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return typeof value === 'string' && value.length <= max ? value : null;
}

export function parseEventBatch(body: unknown): BatchParse {
  const input = (body ?? {}) as Record<string, unknown>;
  if (typeof input.deviceId !== 'string' || !idPattern.test(input.deviceId)) {
    return { ok: false, error: 'invalid_device_id' };
  }
  if (!clients.includes(input.client as EventClient)) {
    return { ok: false, error: 'invalid_client' };
  }
  const clientVersion = optionalText(input.clientVersion, 64);
  const ueVersion = optionalText(input.ueVersion, 32);
  if (clientVersion === null || ueVersion === null) {
    return { ok: false, error: 'invalid_client_info' };
  }
  if (!Array.isArray(input.events) || input.events.length === 0 || input.events.length > maxBatch) {
    return { ok: false, error: 'invalid_events' };
  }

  const events: ClientEvent[] = [];
  for (const raw of input.events as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'invalid_event' };
    }
    if (typeof raw.eventId !== 'string' || !idPattern.test(raw.eventId)) {
      return { ok: false, error: 'invalid_event_id' };
    }
    if (!(clientEventTypes as readonly string[]).includes(raw.type as string)) {
      return { ok: false, error: 'invalid_event_type' };
    }
    const slug = optionalText(raw.slug, 128);
    const version = optionalText(raw.version, 64);
    if (slug === null || (slug !== undefined && !slugPattern.test(slug)) || version === null || (version !== undefined && !versionPattern.test(version))) {
      return { ok: false, error: 'invalid_event_target' };
    }
    if (String(raw.type).startsWith('tool.') && !slug) {
      return { ok: false, error: 'invalid_event_target' };
    }
    let meta: Record<string, unknown> | undefined;
    if (raw.meta !== undefined) {
      if (typeof raw.meta !== 'object' || raw.meta === null || Array.isArray(raw.meta) || Buffer.byteLength(JSON.stringify(raw.meta)) > maxMetaBytes) {
        return { ok: false, error: 'invalid_event_meta' };
      }
      meta = raw.meta as Record<string, unknown>;
    }
    events.push({ eventId: raw.eventId, type: String(raw.type), at: typeof raw.at === 'string' ? raw.at : undefined, slug, version, meta });
  }
  return { ok: true, batch: { deviceId: input.deviceId, client: input.client as EventClient, clientVersion, ueVersion, events } };
}

export interface ServerEvent {
  type: 'download.manifest' | 'download.package';
  slug: string;
  version?: string;
  openId?: string;
  deviceId?: string;
}

export class EventStore {
  constructor(private readonly db: SqliteDatabase, private readonly now: () => Date = () => new Date()) {}

  ingest(batch: EventBatch, openId?: string): { accepted: number; duplicates: number } {
    const nowMs = this.now().getTime();
    const stamp = new Date(nowMs).toISOString();
    const insert = this.db.prepare(
      `INSERT INTO events (event_id, type, at, open_id, device_id, slug, version, client, client_version, ue_version, source, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'client', ?) ON CONFLICT(event_id) DO NOTHING`
    );
    let accepted = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.touchDevice(batch.deviceId, openId, batch.client, batch.clientVersion, batch.ueVersion, stamp);
      for (const event of batch.events) {
        const result = insert.run(
          event.eventId,
          event.type,
          this.clampTimestamp(event.at, nowMs),
          openId ?? null,
          batch.deviceId,
          event.slug ?? null,
          event.version ?? null,
          batch.client,
          batch.clientVersion ?? null,
          batch.ueVersion ?? null,
          event.meta ? JSON.stringify(event.meta) : null
        );
        accepted += Number(result.changes);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { accepted, duplicates: batch.events.length - accepted };
  }

  recordServerEvent(event: ServerEvent): void {
    this.db
      .prepare("INSERT INTO events (event_id, type, at, open_id, device_id, slug, version, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'server')")
      .run(randomUUID(), event.type, this.now().toISOString(), event.openId ?? null, event.deviceId ?? null, event.slug, event.version ?? null);
  }

  // After sign-in, anonymous history from the same device becomes the user's own history.
  bindDevice(openId: string, deviceId: string): number {
    const stamp = this.now().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT INTO devices (device_id, open_id, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET open_id = excluded.open_id, last_seen_at = excluded.last_seen_at')
        .run(deviceId, openId, stamp, stamp);
      const result = this.db.prepare('UPDATE events SET open_id = ? WHERE device_id = ? AND open_id IS NULL').run(openId, deviceId);
      this.db.exec('COMMIT');
      return Number(result.changes);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private touchDevice(deviceId: string, openId: string | undefined, client: string, clientVersion: string | undefined, ueVersion: string | undefined, stamp: string): void {
    this.db
      .prepare(
        `INSERT INTO devices (device_id, open_id, first_seen_at, last_seen_at, client, client_version, ue_version) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, client = excluded.client,
           client_version = COALESCE(excluded.client_version, client_version), ue_version = COALESCE(excluded.ue_version, ue_version),
           open_id = COALESCE(excluded.open_id, open_id)`
      )
      .run(deviceId, openId ?? null, stamp, stamp, client, clientVersion ?? null, ueVersion ?? null);
  }

  // Client clocks drift; anything implausible falls back to the server clock instead of skewing statistics.
  private clampTimestamp(value: string | undefined, nowMs: number): string {
    const parsed = value ? Date.parse(value) : NaN;
    if (Number.isNaN(parsed) || parsed < nowMs - maxPastMs || parsed > nowMs + maxFutureMs) {
      return new Date(nowMs).toISOString();
    }
    return new Date(parsed).toISOString();
  }
}
