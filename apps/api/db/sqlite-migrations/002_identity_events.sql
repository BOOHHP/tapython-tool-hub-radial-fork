-- Identity, sessions, devices, events and audit trail (phase 1).
-- Roles: every active user is an implicit member; only elevated roles are stored.

CREATE TABLE users (
  open_id TEXT PRIMARY KEY,
  union_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE UNIQUE INDEX idx_users_email ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_users_union_id ON users (union_id);

CREATE TABLE user_roles (
  open_id TEXT NOT NULL REFERENCES users (open_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('reviewer', 'admin')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (open_id, role)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  open_id TEXT NOT NULL REFERENCES users (open_id) ON DELETE CASCADE,
  refresh_hash TEXT NOT NULL UNIQUE,
  client TEXT NOT NULL CHECK (client IN ('web', 'installer', 'cli')),
  device_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_open_id ON sessions (open_id);

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  open_id TEXT REFERENCES users (open_id) ON DELETE SET NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  client TEXT,
  client_version TEXT,
  ue_version TEXT
);
CREATE INDEX idx_devices_open_id ON devices (open_id);

CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  open_id TEXT REFERENCES users (open_id) ON DELETE SET NULL,
  device_id TEXT,
  slug TEXT,
  version TEXT,
  client TEXT,
  client_version TEXT,
  ue_version TEXT,
  source TEXT NOT NULL CHECK (source IN ('server', 'client')),
  meta TEXT
);
CREATE INDEX idx_events_type_at ON events (type, at);
CREATE INDEX idx_events_slug_at ON events (slug, at);
CREATE INDEX idx_events_open_id_at ON events (open_id, at);
CREATE INDEX idx_events_device_id ON events (device_id);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before TEXT,
  after TEXT
);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
