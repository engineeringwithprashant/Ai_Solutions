-- ============================================================
--  AI-Solutions — Blog table repair (Migration 004)
--  Adds columns that may be missing if the table was created
--  by an earlier migration, and deduplicates seed rows.
-- ============================================================

-- Add missing columns (no-op if they already exist)
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content    TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS image_url  VARCHAR(500);
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Remove duplicate seed rows (keep the one with the lowest id per slug)
DELETE FROM blog_posts
WHERE id NOT IN (
  SELECT MIN(id) FROM blog_posts GROUP BY slug
);

-- Create a unique index on slug so ON CONFLICT DO NOTHING works in seed data
CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
