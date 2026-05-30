-- phase_6_5_atom_dependency_index.sql — MVP Atom Dependency Index
--
-- Creates the thin atom-to-document dependency map.
-- No new truth stores. No new canon system.
-- Atoms remain derivative indexes over existing documents, canon, and scene graph.
--
-- Constitutional rules:
-- 1. One-hop only — no transitive closure, no graph traversal
-- 2. Each dependency must have a concrete staleness handler (enforced in application code)
-- 3. No pressure/energy/force fields permitted
-- 4. SHADOW data is isolated and ignored by invalidation

-- ── ATOM DEPENDENCIES ──
-- Maps atoms to the document types they affect for staleness computation.

CREATE TABLE IF NOT EXISTS public.atom_dependencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    atom_id uuid NOT NULL REFERENCES public.atoms(id) ON DELETE CASCADE,
    project_id uuid NOT NULL,
    affected_doc_type text NOT NULL,
    dependency_type text NOT NULL CHECK (dependency_type IN ('origin', 'derived', 'reference')),
    affected_scope text NOT NULL DEFAULT 'full_doc' CHECK (affected_scope IN ('full_doc', 'specific_scenes', 'visual_only', 'metadata_only')),
    created_at timestamptz NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT unique_atom_doc_dep UNIQUE (atom_id, affected_doc_type)
);

-- Index for querying affected docs by atom
CREATE INDEX IF NOT EXISTS idx_atom_dependencies_atom_id ON public.atom_dependencies(atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_dependencies_project ON public.atom_dependencies(project_id);

COMMENT ON TABLE public.atom_dependencies IS 'Thin atom-to-document dependency map. One-hop only. Each dependency must have a concrete staleness handler in application code.';
COMMENT ON COLUMN public.atom_dependencies.atom_id IS 'FK to atoms table — the atom whose change triggers staleness';
COMMENT ON COLUMN public.atom_dependencies.affected_doc_type IS 'Document type affected (e.g. character_bible, feature_script)';
COMMENT ON COLUMN public.atom_dependencies.dependency_type IS 'origin = atom source doc (must regen), derived = uses atom (soft stale), reference = mentions atom (info only)';
COMMENT ON COLUMN public.atom_dependencies.affected_scope IS 'full_doc = entire doc stale, specific_scenes = select scenes affected, visual_only = image assets only, metadata_only = display fields';

-- ── STALENESS FLAGS ──
-- Lightweight persistent staleness records for UI display.
-- Created when atoms change. Cleared when user dismisses or regenerates.

CREATE TABLE IF NOT EXISTS public.atom_staleness_flags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL,
    affected_document_id uuid REFERENCES public.project_documents(id) ON DELETE CASCADE,
    affected_doc_type text NOT NULL,
    changed_atom_id uuid REFERENCES public.atoms(id) ON DELETE SET NULL,
    changed_atom_type text NOT NULL,
    changed_atom_text text NOT NULL,
    changed_atom_entity text,
    origin_source text,
    dependency_type text NOT NULL CHECK (dependency_type IN ('origin', 'derived', 'reference')),
    affected_scope text NOT NULL DEFAULT 'full_doc' CHECK (affected_scope IN ('full_doc', 'specific_scenes', 'visual_only', 'metadata_only')),
    stale_reason text NOT NULL,
    suggested_action text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'resolved')),
    created_at timestamptz NOT NULL DEFAULT now(),
    dismissed_at timestamptz,
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_staleness_project_active ON public.atom_staleness_flags(project_id, status);
CREATE INDEX IF NOT EXISTS idx_staleness_document ON public.atom_staleness_flags(affected_document_id);

COMMENT ON TABLE public.atom_staleness_flags IS 'Read-only staleness flags for UI display. One-hop only. No auto-regeneration.';
COMMENT ON COLUMN public.atom_staleness_flags.status IS 'active = displayed in UI, dismissed = user dismissed, resolved = document regenerated';
COMMENT ON COLUMN public.atom_staleness_flags.suggested_action IS 'Human-readable action recommendation';

-- ── ENFORCEMENT TRIGGER: Block forbidden attribute keys ──

CREATE OR REPLACE FUNCTION public.guard_atom_attributes()
RETURNS trigger AS $$
DECLARE
    forbidden_keys text[] := ARRAY['pressure', 'energy', 'force', 'expected_choice', 'predicted_choice', 'arc_score', 'arc_percent', 'arc_percentage'];
    key text;
BEGIN
    -- Check top-level keys
    FOREACH key IN ARRAY forbidden_keys LOOP
        IF NEW.attributes ? key THEN
            RAISE EXCEPTION 'Forbidden atom attribute key: %', key
                USING HINT = 'These keys are prohibited by the MVP Atom Dependency Index. Use display_only for interpretive data.';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_guard_atom_attributes ON public.atoms;
CREATE TRIGGER trigger_guard_atom_attributes
    BEFORE INSERT OR UPDATE OF attributes ON public.atoms
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_atom_attributes();

COMMENT ON FUNCTION public.guard_atom_attributes IS 'Enforces boundary rules: blocks pressure/energy/force/choice/arc_score/arc_percent keys in atom attributes.';

-- ── INDEXES FOR ATOM QUERYING ──
-- Ensure the existing atoms table can be efficiently queried by the dependency index.

CREATE INDEX IF NOT EXISTS idx_atoms_project_type ON public.atoms(project_id, atom_type);
CREATE INDEX IF NOT EXISTS idx_atoms_origin_doc ON public.atoms(origin_doc_id);
