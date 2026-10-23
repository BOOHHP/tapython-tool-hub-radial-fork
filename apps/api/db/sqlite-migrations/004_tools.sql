-- Queryable index of published tools (phase 2). The tool documents and packages stay on disk as the
-- source of truth; this table is rebuilt from the generated API JSON whenever tools change.

CREATE TABLE tools (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT,
  author TEXT,
  owner_team TEXT,
  status TEXT,
  risk_level TEXT,
  tool_type TEXT,
  collection TEXT,
  latest_version TEXT,
  updated_at TEXT,
  source_document TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX idx_tools_category ON tools (category);
CREATE INDEX idx_tools_owner_team ON tools (owner_team);
CREATE INDEX idx_tools_author ON tools (author);

CREATE TABLE tool_versions (
  slug TEXT NOT NULL REFERENCES tools (slug) ON DELETE CASCADE,
  version TEXT NOT NULL,
  released_at TEXT,
  author TEXT,
  package_sha256 TEXT,
  package_size INTEGER,
  PRIMARY KEY (slug, version)
);
