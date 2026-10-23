-- Per-user favorite tools. slug is not a foreign key: favorites survive a tool being unpublished and re-published.
CREATE TABLE favorites (
  open_id TEXT NOT NULL REFERENCES users (open_id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (open_id, slug)
);
