create extension if not exists pgcrypto;

create table if not exists tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  display_name text not null,
  description text not null,
  category text not null,
  author text not null,
  owner_team text not null,
  status text not null,
  risk_level text not null,
  tags text[] not null default '{}',
  compatibility jsonb not null default '{}'::jsonb,
  mount_point text not null,
  install_path text not null,
  entry_json text not null,
  source_document text,
  source_mode text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint tools_status_check check (status in ('draft', 'pending', 'approved', 'rejected', 'deprecated', 'archived')),
  constraint tools_risk_level_check check (risk_level in ('low', 'medium', 'high'))
);

create table if not exists tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references tools(id) on delete cascade,
  version text not null,
  released_at timestamptz not null,
  author text not null,
  change_summary text not null,
  breaking boolean not null default false,
  manifest jsonb not null,
  downloads jsonb not null default '{}'::jsonb,
  immutable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tool_id, version)
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  tool_version_id uuid not null references tool_versions(id) on delete cascade,
  path text not null,
  sha256 text not null,
  size_bytes integer not null check (size_bytes >= 0),
  storage_key text,
  content_type text,
  created_at timestamptz not null default now(),
  unique (tool_version_id, path)
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid references tools(id) on delete set null,
  slug text not null,
  submitter text not null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  markdown text,
  validation_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_status_check check (status in ('draft', 'pending', 'approved', 'rejected', 'deprecated', 'archived'))
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  reviewer text not null,
  decision text not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint reviews_decision_check check (decision in ('approved', 'rejected', 'changes_requested'))
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_versions_tool_id on tool_versions(tool_id);
create index if not exists idx_assets_tool_version_id on assets(tool_version_id);
create index if not exists idx_submissions_status on submissions(status);
create index if not exists idx_reviews_submission_id on reviews(submission_id);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
