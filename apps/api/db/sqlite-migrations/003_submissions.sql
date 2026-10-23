-- Submissions and review history (phase 2). `record` keeps the full SubmissionRecord JSON
-- so the API shape is unchanged; the other columns exist for filtering and statistics.

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  submitter TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  record TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_sha256 TEXT
);
CREATE INDEX idx_submissions_slug ON submissions (slug);
CREATE INDEX idx_submissions_status ON submissions (status);
CREATE INDEX idx_submissions_submitter ON submissions (submitter);

-- reviewer_open_id stays NULL for the legacy shared "admin" logins.
CREATE TABLE submission_reviews (
  review_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  reviewer TEXT NOT NULL,
  reviewer_open_id TEXT REFERENCES users (open_id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
  comment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_submission_reviews_submission ON submission_reviews (submission_id, seq);
CREATE INDEX idx_submission_reviews_reviewer ON submission_reviews (reviewer_open_id);

-- Free-text submitters map to a person or a team; unmapped aliases simply stay unattributed.
CREATE TABLE author_aliases (
  alias TEXT PRIMARY KEY COLLATE NOCASE,
  kind TEXT NOT NULL CHECK (kind IN ('person', 'team')),
  open_id TEXT REFERENCES users (open_id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (kind = 'team' OR open_id IS NOT NULL)
);
CREATE INDEX idx_author_aliases_open_id ON author_aliases (open_id);
