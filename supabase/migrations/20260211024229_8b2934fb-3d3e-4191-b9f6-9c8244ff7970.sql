-- Add pinned flag to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;