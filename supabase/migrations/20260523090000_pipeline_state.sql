-- Migration: Add pipeline_state JSONB column to projects table
-- Purpose: State persistence for the production stills pipeline

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pipeline_state JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN projects.pipeline_state IS
  'State persistence for the production stills pipeline — tracks phase progress, budgets, and error retry state';