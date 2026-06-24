-- ============================================================
--  AI-Solutions — Initial Database Schema
--  Run via: node setup.js
-- ============================================================

-- Admin users
CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255)        NOT NULL,
  name          VARCHAR(100)        NOT NULL DEFAULT 'Admin',
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Contact / enquiry form submissions
CREATE TABLE IF NOT EXISTS contacts (
  id          SERIAL PRIMARY KEY,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  phone       VARCHAR(50),
  company     VARCHAR(200),
  country     VARCHAR(100),
  job_title   VARCHAR(100),
  industry    VARCHAR(100),
  goal        VARCHAR(100),
  message     TEXT,
  status      VARCHAR(20)  NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new','read','replied')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Newsletter subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','unsubscribed')),
  subscribed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- AI assistant conversation history
CREATE TABLE IF NOT EXISTS assistant_messages (
  id         SERIAL PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  role       VARCHAR(20)  NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_contacts_status     ON contacts (status);
CREATE INDEX IF NOT EXISTS idx_contacts_created    ON contacts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_session   ON assistant_messages (session_id, created_at);
