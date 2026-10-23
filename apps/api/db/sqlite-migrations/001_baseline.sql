-- Baseline: key/value metadata used by backup verification and later phases.
CREATE TABLE hub_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
