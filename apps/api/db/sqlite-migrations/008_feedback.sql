-- Feedback pipeline (phase 4): sign-in required, handled by reviewers/admins inside the Hub.

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  author_open_id TEXT NOT NULL REFERENCES users (open_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'suggestion')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  slug TEXT,
  client TEXT,
  client_version TEXT,
  ue_version TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'wontfix')),
  assignee_open_id TEXT REFERENCES users (open_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_feedback_author ON feedback (author_open_id, created_at);
CREATE INDEX idx_feedback_status ON feedback (status, created_at);

CREATE TABLE feedback_replies (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
  author_open_id TEXT NOT NULL REFERENCES users (open_id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_feedback_replies_feedback ON feedback_replies (feedback_id, created_at);
