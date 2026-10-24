-- Feishu bot notifications (phase 4). Rows are an outbox: enqueue inside the request, deliver in the background with retry.
-- dedupe_key makes enqueueing idempotent (e.g. one card per review per recipient).

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  recipient_open_id TEXT NOT NULL REFERENCES users (open_id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX idx_notifications_due ON notifications (status, next_attempt_at);
CREATE INDEX idx_notifications_recipient ON notifications (recipient_open_id, created_at);

-- Members may opt out of the broadcast "tool listed" card; workflow cards (review, feedback) are always sent.
ALTER TABLE users ADD COLUMN notify_listed INTEGER NOT NULL DEFAULT 1;
