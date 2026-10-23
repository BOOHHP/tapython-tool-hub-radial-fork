-- Admin-assigned team; falls back to the Feishu department when empty.
ALTER TABLE users ADD COLUMN team TEXT;
