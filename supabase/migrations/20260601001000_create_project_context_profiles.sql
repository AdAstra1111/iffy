-- Create project_context_profiles table for PCP storage
-- This table stores Project Context Profiles used by costume-atomiser,
-- location-atomiser, creature-atomiser, prop-atomiser, and other
-- CPIE-dependent functions.

CREATE TABLE IF NOT EXISTS project_context_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_type text NOT NULL DEFAULT 'runtime',
  status text NOT NULL DEFAULT 'partial' CHECK (status IN ('complete', 'partial', 'empty')),
  version_number integer NOT NULL DEFAULT 1,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'pcp-resolver',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

-- Index for lookup by project_id
CREATE INDEX IF NOT EXISTS idx_project_context_profiles_project_id 
  ON project_context_profiles(project_id);

-- Enable RLS
ALTER TABLE project_context_profiles ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all" 
  ON project_context_profiles 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY "authenticated_read" 
  ON project_context_profiles 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- Authenticated users can insert/update
CREATE POLICY "authenticated_insert" 
  ON project_context_profiles 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "authenticated_update" 
  ON project_context_profiles 
  FOR UPDATE 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);
