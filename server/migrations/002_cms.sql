-- ============================================================
--  AI-Solutions — CMS Tables (Migration 002)
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(300) NOT NULL,
  slug         VARCHAR(300),
  category     VARCHAR(100),
  excerpt      TEXT,
  content      TEXT,
  author       VARCHAR(100) DEFAULT 'AI-Solutions Team',
  image_url    VARCHAR(500),
  status       VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(300) NOT NULL,
  type         VARCHAR(50),
  event_date   DATE NOT NULL,
  time_info    VARCHAR(100),
  location     VARCHAR(300),
  description  TEXT,
  is_past      BOOLEAN NOT NULL DEFAULT FALSE,
  status       VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testimonials (
  id           SERIAL PRIMARY KEY,
  client_name  VARCHAR(150) NOT NULL,
  client_role  VARCHAR(150),
  company      VARCHAR(200),
  quote        TEXT NOT NULL,
  product      VARCHAR(100),
  rating       NUMERIC(2,1) NOT NULL DEFAULT 5.0,
  initials     VARCHAR(5),
  status       VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  role         VARCHAR(150),
  bio          TEXT,
  initials     VARCHAR(5),
  image_url    VARCHAR(500),
  order_index  INTEGER NOT NULL DEFAULT 0,
  status       VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gallery_items (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  image_url    VARCHAR(500),
  category     VARCHAR(100),
  order_index  INTEGER NOT NULL DEFAULT 0,
  status       VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed blog posts
INSERT INTO blog_posts (title, slug, category, excerpt, author, status, published_at) VALUES
('Why production AI fails — and how to build systems that don''t', 'why-production-ai-fails', 'AI Strategy', 'Most AI systems that fail in production don''t fail because the model was bad. They fail because the surrounding system wasn''t designed for the real world.', 'AI-Solutions Team', 'published', NOW()),
('How HealthSync AI reduced patient waiting times by 40%', 'healthsync-ai-waiting-times', 'Healthcare AI', 'A deep dive into the predictive scheduling algorithms that transformed patient flow at Horizon Care Group.', 'AI-Solutions Team', 'published', NOW() - INTERVAL '7 days'),
('AI-driven inventory optimisation: the RetailMind story', 'retailmind-inventory', 'Retail & Analytics', 'How we built a demand forecasting engine that cut overstock by 35% and improved shelf availability.', 'AI-Solutions Team', 'published', NOW() - INTERVAL '14 days'),
('Personalised learning at scale: lessons from EduNova', 'edunova-personalised-learning', 'EdTech', 'Building adaptive learning modules that respond to individual student progress.', 'AI-Solutions Team', 'published', NOW() - INTERVAL '21 days'),
('Route optimisation and the £2M fuel saving for SwiftMove', 'fleetpilot-fuel-saving', 'Logistics AI', 'Inside FleetPilot AI''s optimisation engine and how predictive fuel analytics delivered major savings.', 'AI-Solutions Team', 'published', NOW() - INTERVAL '28 days'),
('Designing AI pipelines for regulated industries', 'ai-pipelines-regulated', 'Platform Engineering', 'Compliance, auditability, and trust aren''t optional in regulated sectors — they''re architectural requirements.', 'AI-Solutions Team', 'published', NOW() - INTERVAL '35 days')
ON CONFLICT DO NOTHING;

-- Seed events
INSERT INTO events (title, type, event_date, time_info, location, description, is_past) VALUES
('AI & Enterprise Summit 2026', 'Conference', '2026-07-18', '09:00–18:00 BST', 'ExCeL London', 'Join 2,000+ AI leaders at the UK''s premier enterprise AI event. AI-Solutions presents a keynote on reliable AI deployment.', FALSE),
('AI in Healthcare Workshop', 'Workshop', '2026-08-05', '10:00–16:00 BST', 'AI-Solutions HQ, Sunderland', 'Full-day hands-on workshop on AI in healthcare: patient risk prediction, clinical workflow automation, and compliance.', FALSE),
('Responsible AI Webinar', 'Webinar', '2026-08-22', '14:00–15:30 BST', 'Online (Zoom)', 'Free 90-minute session on explainability, bias detection, and human oversight in production AI.', FALSE),
('North East Tech Festival 2026', 'Festival', '2026-09-10', 'All day', 'Sage Gateshead', 'AI-Solutions will be exhibiting, running an AI demo zone, and hosting a panel on AI in regional business.', FALSE),
('AI-Solutions Annual Showcase 2026', 'Showcase', '2026-10-04', '18:00 BST', 'Stadium of Light, Sunderland', 'Our flagship annual showcase — live demos, client awards, and networking dinner.', FALSE),
('AI-Solutions Annual Showcase 2025', 'Showcase', '2025-10-05', '18:00 BST', 'Stadium of Light, Sunderland', '2025 showcase celebrated SecureVision and FleetPilot AI v2. Over 350 guests attended.', TRUE),
('AI & Enterprise Summit 2025', 'Conference', '2025-07-15', '09:00–18:00 BST', 'ExCeL London', 'AI-Solutions won Best AI Platform. CEO delivered keynote to 1,800 attendees.', TRUE)
ON CONFLICT DO NOTHING;

-- Seed testimonials
INSERT INTO testimonials (client_name, client_role, company, quote, product, rating, initials, status) VALUES
('Dr. Melissa Carter', 'Chief Medical Officer', 'Horizon Care Group', 'AI-Solutions has been working with us to transform patient care delivery. The HealthSync AI platform reduced our waiting times by 40% within the first three months. Exceptional expertise and support throughout.', 'HealthSync AI', 4.8, 'MC', 'published'),
('Daniel Brooks', 'Head of E-Commerce', 'UrbanStyle Retail', 'RetailMind gave us a completely new understanding of customer behaviour. Inventory costs are down 35% and our shelf availability has never been better. The ROI was clear within the first quarter.', 'RetailMind', 4.7, 'DB', 'published'),
('Priya Sharma', 'Director of Learning', 'Nova International College', 'EduNova transformed the learning experience for our 8,000 students. Engagement metrics are up 38% across every cohort. The multilingual support was a complete game-changer for our diverse student body.', 'EduNova', 4.9, 'PS', 'published'),
('Eric Thompson', 'Fleet Operations Director', 'SwiftMove Logistics', 'FleetPilot AI streamlined our entire delivery network. Fuel efficiency improved beyond what we thought achievable. Driver insights reduced incidents by 28% and the ROI was clear within the first quarter.', 'FleetPilot AI', 4.6, 'ET', 'published'),
('Karen White', 'Head of Corporate Security', 'Nexa Corporate Solutions', 'SecureVision strengthened our security infrastructure with real-time monitoring and instant alerts. Response times dropped by over 60% and false-positive rates are minimal. Excellent team.', 'SecureVision', 4.8, 'KW', 'published')
ON CONFLICT DO NOTHING;

-- Seed team members
INSERT INTO team_members (name, role, bio, initials, order_index, status) VALUES
('Dr. James Harrison', 'Chief Executive Officer', 'James founded AI-Solutions with a vision to make enterprise AI reliable and trustworthy. 15 years in AI research, previously at DeepMind.', 'JH', 1, 'active'),
('Sarah Chen', 'Chief Technology Officer', 'Sarah leads our engineering teams building the AI-Solutions platform. Expert in MLOps and large-scale AI deployment.', 'SC', 2, 'active'),
('Ravi Anand', 'Head of AI Research', 'Ravi oversees our research lab, developing next-generation tools for AI evaluation and model governance.', 'RA', 3, 'active'),
('Maria Torres', 'Head of Client Success', 'Maria ensures every client deployment achieves its goals. She has led 200+ enterprise AI projects across 12 industries.', 'MT', 4, 'active'),
('Liam O''Brien', 'Head of Data Engineering', 'Liam builds the data pipelines that power our clients'' AI systems — from ingestion to governed, AI-ready assets.', 'LO', 5, 'active'),
('Kavya Patel', 'Head of Product', 'Kavya shapes the AI-Solutions product roadmap, translating complex enterprise AI needs into elegant platform features.', 'KP', 6, 'active')
ON CONFLICT DO NOTHING;

-- Seed gallery items
INSERT INTO gallery_items (title, description, category, order_index, status) VALUES
('AI Summit 2026', 'Our team at the UK AI Summit keynote', 'Events', 1, 'active'),
('Workshop — Manchester', 'AI in Healthcare full-day workshop', 'Workshops', 2, 'active'),
('Product Launch Event', 'SecureVision public launch at Manchester Central', 'Launches', 3, 'active'),
('Hackathon Day', 'Internal hackathon — 24 hours of building', 'Team', 4, 'active'),
('Tech Awards Gala', 'Receiving Technology Company of the Year 2024', 'Awards', 5, 'active'),
('Client Partnership', 'Signing the Horizon Care Group partnership', 'Clients', 6, 'active'),
('Sunderland HQ', 'Our home at 12 Innovation Quarter', 'Office', 7, 'active'),
('Keynote Speech', 'CEO addressing 1,800 delegates at AI Summit 2025', 'Events', 8, 'active'),
('Team Offsite 2025', 'Annual team offsite in the Lake District', 'Team', 9, 'active')
ON CONFLICT DO NOTHING;
