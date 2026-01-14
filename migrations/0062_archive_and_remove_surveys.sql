-- Migration 0062: Archive and Remove Legacy Survey System
-- Created: 2026-01-12
-- Description: Creates archive tables for survey data, then drops survey tables
--              Run scripts/archive-survey-data.ts BEFORE applying this migration

-- =====================================================================
-- STEP 1: Create Archive Tables (preserves data in database)
-- =====================================================================

-- Archive surveys
CREATE TABLE IF NOT EXISTS surveys_archive (
  id UUID PRIMARY KEY,
  title VARCHAR NOT NULL,
  description TEXT,
  creator_id VARCHAR NOT NULL,
  workspace_id UUID,
  status VARCHAR,
  allow_anonymous BOOLEAN,
  anonymous_access_type VARCHAR,
  public_link VARCHAR,
  anonymous_config JSONB,
  is_public BOOLEAN,
  public_access_mode VARCHAR,
  public_slug VARCHAR,
  allowed_domains JSONB,
  public_settings JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Archive survey_pages
CREATE TABLE IF NOT EXISTS survey_pages_archive (
  id UUID PRIMARY KEY,
  survey_id UUID NOT NULL,
  title VARCHAR NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Archive questions
CREATE TABLE IF NOT EXISTS questions_archive (
  id UUID PRIMARY KEY,
  page_id UUID NOT NULL,
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  required BOOLEAN,
  options JSONB,
  loop_config JSONB,
  conditional_logic JSONB,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Archive loop_group_subquestions
CREATE TABLE IF NOT EXISTS loop_group_subquestions_archive (
  id UUID PRIMARY KEY,
  loop_question_id UUID NOT NULL,
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  required BOOLEAN,
  options JSONB,
  loop_config JSONB,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Archive conditional_rules
CREATE TABLE IF NOT EXISTS conditional_rules_archive (
  id UUID PRIMARY KEY,
  survey_id UUID NOT NULL,
  condition_question_id UUID NOT NULL,
  operator VARCHAR NOT NULL,
  condition_value JSONB NOT NULL,
  target_question_id UUID,
  target_page_id UUID,
  action VARCHAR NOT NULL,
  logical_operator VARCHAR,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Archive responses
CREATE TABLE IF NOT EXISTS responses_archive (
  id UUID PRIMARY KEY,
  survey_id UUID NOT NULL,
  completed BOOLEAN,
  submitted_at TIMESTAMP,
  is_anonymous BOOLEAN,
  ip_address VARCHAR,
  user_agent TEXT,
  session_id VARCHAR,
  anonymous_metadata JSONB,
  created_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Archive answers
CREATE TABLE IF NOT EXISTS answers_archive (
  id UUID PRIMARY KEY,
  response_id UUID NOT NULL,
  question_id UUID NOT NULL,
  subquestion_id UUID,
  loop_index INTEGER,
  value JSONB NOT NULL,
  created_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Archive files (note: actual files remain in storage)
CREATE TABLE IF NOT EXISTS files_archive (
  id UUID PRIMARY KEY,
  answer_id UUID NOT NULL,
  filename VARCHAR NOT NULL,
  original_name VARCHAR NOT NULL,
  mime_type VARCHAR NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Archive analytics_events
CREATE TABLE IF NOT EXISTS analytics_events_archive (
  id UUID PRIMARY KEY,
  response_id UUID NOT NULL,
  survey_id UUID NOT NULL,
  page_id UUID,
  question_id UUID,
  event VARCHAR NOT NULL,
  data JSONB,
  duration INTEGER,
  timestamp TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Create index on archived_at for all archive tables
CREATE INDEX IF NOT EXISTS idx_surveys_archive_archived_at ON surveys_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_survey_pages_archive_archived_at ON survey_pages_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_questions_archive_archived_at ON questions_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_loop_group_subquestions_archive_archived_at ON loop_group_subquestions_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_conditional_rules_archive_archived_at ON conditional_rules_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_responses_archive_archived_at ON responses_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_answers_archive_archived_at ON answers_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_files_archive_archived_at ON files_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_archive_archived_at ON analytics_events_archive(archived_at);

-- =====================================================================
-- STEP 2: Copy Data to Archive Tables
-- =====================================================================

INSERT INTO surveys_archive
  (id, title, description, creator_id, workspace_id, status, allow_anonymous,
   anonymous_access_type, public_link, anonymous_config, is_public, public_access_mode,
   public_slug, allowed_domains, public_settings, created_at, updated_at)
SELECT id, title, description, creator_id, workspace_id, status::VARCHAR, allow_anonymous,
       anonymous_access_type::VARCHAR, public_link, anonymous_config, is_public,
       public_access_mode::VARCHAR, public_slug, allowed_domains, public_settings,
       created_at, updated_at
FROM surveys
ON CONFLICT (id) DO NOTHING;

INSERT INTO survey_pages_archive
  (id, survey_id, title, "order", created_at)
SELECT id, survey_id, title, "order", created_at
FROM survey_pages
ON CONFLICT (id) DO NOTHING;

INSERT INTO questions_archive
  (id, page_id, type, title, description, required, options, loop_config,
   conditional_logic, "order", created_at)
SELECT id, page_id, type::VARCHAR, title, description, required, options,
       loop_config, conditional_logic, "order", created_at
FROM questions
ON CONFLICT (id) DO NOTHING;

INSERT INTO loop_group_subquestions_archive
  (id, loop_question_id, type, title, description, required, options,
   loop_config, "order", created_at)
SELECT id, loop_question_id, type::VARCHAR, title, description, required,
       options, loop_config, "order", created_at
FROM loop_group_subquestions
ON CONFLICT (id) DO NOTHING;

INSERT INTO conditional_rules_archive
  (id, survey_id, condition_question_id, operator, condition_value,
   target_question_id, target_page_id, action, logical_operator, "order", created_at)
SELECT id, survey_id, condition_question_id, operator::VARCHAR, condition_value,
       target_question_id, target_page_id, action::VARCHAR, logical_operator,
       "order", created_at
FROM conditional_rules
ON CONFLICT (id) DO NOTHING;

INSERT INTO responses_archive
  (id, survey_id, completed, submitted_at, is_anonymous, ip_address,
   user_agent, session_id, anonymous_metadata, created_at)
SELECT id, survey_id, completed, submitted_at, is_anonymous, ip_address,
       user_agent, session_id, anonymous_metadata, created_at
FROM responses
ON CONFLICT (id) DO NOTHING;

INSERT INTO answers_archive
  (id, response_id, question_id, subquestion_id, loop_index, value, created_at)
SELECT id, response_id, question_id, subquestion_id, loop_index, value, created_at
FROM answers
ON CONFLICT (id) DO NOTHING;

INSERT INTO files_archive
  (id, answer_id, filename, original_name, mime_type, size, uploaded_at)
SELECT id, answer_id, filename, original_name, mime_type, size, uploaded_at
FROM files
ON CONFLICT (id) DO NOTHING;

INSERT INTO analytics_events_archive
  (id, response_id, survey_id, page_id, question_id, event, data, duration, timestamp)
SELECT id, response_id, survey_id, page_id, question_id, event, data, duration, timestamp
FROM analytics_events
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- STEP 3: Drop Survey Tables (in reverse dependency order)
-- =====================================================================

-- Drop dependent tables first
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS analytics_events CASCADE;
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS responses CASCADE;
DROP TABLE IF EXISTS conditional_rules CASCADE;
DROP TABLE IF EXISTS loop_group_subquestions CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS survey_pages CASCADE;
DROP TABLE IF EXISTS surveys CASCADE;

-- =====================================================================
-- STEP 4: Drop Survey-Related Enums
-- =====================================================================

-- Note: Only drop enums if no other tables are using them
-- Check for usage before dropping

-- Drop survey_status enum (used only by surveys table)
DROP TYPE IF EXISTS survey_status CASCADE;

-- Drop question_type enum (used only by questions/loop_group_subquestions)
DROP TYPE IF EXISTS question_type CASCADE;

-- Drop anonymous_access_type enum (if exists and only used by surveys)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'anonymous_access_type') THEN
    DROP TYPE anonymous_access_type CASCADE;
  END IF;
END $$;

-- Note: We keep condition_operator and conditional_action enums
-- because they may be used by workflow logic rules

-- =====================================================================
-- STEP 5: Add Migration Tracking
-- =====================================================================

-- Add comment to archive tables for documentation
COMMENT ON TABLE surveys_archive IS 'Archived survey data from legacy system (removed 2026-01-12)';
COMMENT ON TABLE survey_pages_archive IS 'Archived survey pages data from legacy system (removed 2026-01-12)';
COMMENT ON TABLE questions_archive IS 'Archived questions data from legacy system (removed 2026-01-12)';
COMMENT ON TABLE loop_group_subquestions_archive IS 'Archived loop subquestions from legacy system (removed 2026-01-12)';
COMMENT ON TABLE conditional_rules_archive IS 'Archived conditional rules from legacy system (removed 2026-01-12)';
COMMENT ON TABLE responses_archive IS 'Archived responses from legacy system (removed 2026-01-12)';
COMMENT ON TABLE answers_archive IS 'Archived answers from legacy system (removed 2026-01-12)';
COMMENT ON TABLE files_archive IS 'Archived file metadata from legacy system (removed 2026-01-12)';
COMMENT ON TABLE analytics_events_archive IS 'Archived analytics events from legacy system (removed 2026-01-12)';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration 0062 completed: Survey system tables archived and removed';
  RAISE NOTICE 'Archive tables created with suffix _archive';
  RAISE NOTICE 'Original tables dropped: surveys, survey_pages, questions, loop_group_subquestions, conditional_rules, responses, answers, files, analytics_events';
  RAISE NOTICE 'Enums dropped: survey_status, question_type, anonymous_access_type';
END $$;
