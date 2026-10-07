/*
# DataProofAI Core Schema

Creates the core tables for a proof-carrying data analytics platform.

1. New Tables
- `datasets` — uploaded or connected data sources (CSV, XLSX, JSON, scanned). Stores parsed rows as JSONB.
- `dataset_versions` — snapshots of dataset data for version history and proof replay.
- `dataset_columns` — per-column metadata (type, meaning, stats) for the data dictionary.
- `data_quality_reports` — computed health metrics (completeness, validity, etc.) per dataset version.
- `analyses` — user questions, analysis contract, assumptions, status.
- `analysis_results` — primary + independent calculation results, verification status.
- `proofs` — proof passport artifacts with proof IDs.
- `reports` — generated reports (PDF/Excel metadata).
- `audit_logs` — user/system action tracking.
- `investigations` — grouped analyses.
- `comments` — comments on analyses/proofs/reports.
- `notifications` — user notifications.

2. Security
- Multi-user app with sign-in: all tables owner-scoped via user_id with DEFAULT auth.uid().
- RLS enabled on every table.
- 4 policies per table (SELECT/INSERT/UPDATE/DELETE), scoped TO authenticated.
*/

-- datasets
CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'csv',
  source_label text,
  row_count integer NOT NULL DEFAULT 0,
  column_count integer NOT NULL DEFAULT 0,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_sample boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_datasets" ON datasets;
CREATE POLICY "select_own_datasets" ON datasets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_datasets" ON datasets;
CREATE POLICY "insert_own_datasets" ON datasets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_datasets" ON datasets;
CREATE POLICY "update_own_datasets" ON datasets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_datasets" ON datasets;
CREATE POLICY "delete_own_datasets" ON datasets FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- dataset_versions
CREATE TABLE IF NOT EXISTS dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  row_count integer NOT NULL DEFAULT 0,
  column_count integer NOT NULL DEFAULT 0,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  changes_summary text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE dataset_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_dataset_versions" ON dataset_versions;
CREATE POLICY "select_own_dataset_versions" ON dataset_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_dataset_versions" ON dataset_versions;
CREATE POLICY "insert_own_dataset_versions" ON dataset_versions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_dataset_versions" ON dataset_versions;
CREATE POLICY "update_own_dataset_versions" ON dataset_versions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_dataset_versions" ON dataset_versions;
CREATE POLICY "delete_own_dataset_versions" ON dataset_versions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- data_quality_reports
CREATE TABLE IF NOT EXISTS data_quality_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  completeness numeric NOT NULL DEFAULT 0,
  validity numeric NOT NULL DEFAULT 0,
  consistency numeric NOT NULL DEFAULT 0,
  uniqueness numeric NOT NULL DEFAULT 0,
  freshness numeric NOT NULL DEFAULT 0,
  overall_score numeric NOT NULL DEFAULT 0,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE data_quality_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_quality" ON data_quality_reports;
CREATE POLICY "select_own_quality" ON data_quality_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_quality" ON data_quality_reports;
CREATE POLICY "insert_own_quality" ON data_quality_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_quality" ON data_quality_reports;
CREATE POLICY "update_own_quality" ON data_quality_reports FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_quality" ON data_quality_reports;
CREATE POLICY "delete_own_quality" ON data_quality_reports FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- analyses
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
  question text NOT NULL,
  contract jsonb,
  assumptions jsonb,
  status text NOT NULL DEFAULT 'draft',
  investigation_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_analyses" ON analyses;
CREATE POLICY "select_own_analyses" ON analyses FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_analyses" ON analyses;
CREATE POLICY "insert_own_analyses" ON analyses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_analyses" ON analyses;
CREATE POLICY "update_own_analyses" ON analyses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_analyses" ON analyses;
CREATE POLICY "delete_own_analyses" ON analyses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- analysis_results
CREATE TABLE IF NOT EXISTS analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_result jsonb,
  independent_result jsonb,
  verification_status text NOT NULL DEFAULT 'pending',
  match boolean,
  primary_code text,
  independent_code text,
  execution_log jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_results" ON analysis_results;
CREATE POLICY "select_own_results" ON analysis_results FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_results" ON analysis_results;
CREATE POLICY "insert_own_results" ON analysis_results FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_results" ON analysis_results;
CREATE POLICY "update_own_results" ON analysis_results FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_results" ON analysis_results;
CREATE POLICY "delete_own_results" ON analysis_results FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- proofs
CREATE TABLE IF NOT EXISTS proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL,
  proof_id_serial text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  answer_value jsonb,
  source_dataset text,
  dataset_version text,
  calculation text,
  execution_method text,
  independent_method text,
  match boolean NOT NULL DEFAULT false,
  reproducible boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'verified',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_proofs" ON proofs;
CREATE POLICY "select_own_proofs" ON proofs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_proofs" ON proofs;
CREATE POLICY "insert_own_proofs" ON proofs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_proofs" ON proofs;
CREATE POLICY "update_own_proofs" ON proofs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_proofs" ON proofs;
CREATE POLICY "delete_own_proofs" ON proofs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- reports
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  report_type text NOT NULL DEFAULT 'pdf',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  proof_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'generated',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_reports" ON reports;
CREATE POLICY "select_own_reports" ON reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_reports" ON reports;
CREATE POLICY "insert_own_reports" ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_reports" ON reports;
CREATE POLICY "update_own_reports" ON reports FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_reports" ON reports;
CREATE POLICY "delete_own_reports" ON reports FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_audit" ON audit_logs;
CREATE POLICY "select_own_audit" ON audit_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_audit" ON audit_logs;
CREATE POLICY "insert_own_audit" ON audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);
DROP POLICY IF EXISTS "update_own_audit" ON audit_logs;
CREATE POLICY "update_own_audit" ON audit_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_audit" ON audit_logs;
CREATE POLICY "delete_own_audit" ON audit_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- investigations
CREATE TABLE IF NOT EXISTS investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_investigations" ON investigations;
CREATE POLICY "select_own_investigations" ON investigations FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_investigations" ON investigations;
CREATE POLICY "insert_own_investigations" ON investigations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_investigations" ON investigations;
CREATE POLICY "update_own_investigations" ON investigations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_investigations" ON investigations;
CREATE POLICY "delete_own_investigations" ON investigations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- comments
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_comments" ON comments;
CREATE POLICY "select_own_comments" ON comments FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_comments" ON comments;
CREATE POLICY "insert_own_comments" ON comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_comments" ON comments;
CREATE POLICY "update_own_comments" ON comments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_comments" ON comments;
CREATE POLICY "delete_own_comments" ON comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- profiles (extends auth.users with app-level metadata)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  organization text,
  role text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_datasets_user_id ON datasets(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_user_id ON proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
