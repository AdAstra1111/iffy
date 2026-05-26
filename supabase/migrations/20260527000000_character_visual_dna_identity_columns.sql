-- Character Visual DNA — Structured identity fields
-- 
-- Adds queryable canonical role identity columns to character_visual_dna,
-- preserving the existing flexible JSON model. New columns are nullable
-- so existing DNA rows remain valid.

BEGIN;

-- ── New columns ─────────────────────────────────────────────────────

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS biological_sex TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS gender_presentation TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS age_range TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS ethnicity TEXT[];

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS body_type TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS height_class TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS facial_archetype TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS voice_quality TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS wardrobe_signals JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS social_class TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS role_archetype TEXT;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS identity_evidence JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS identity_confidence JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS identity_inference_type JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.character_visual_dna
  ADD COLUMN IF NOT EXISTS user_override BOOLEAN DEFAULT false;

-- ── Safe backfill from existing JSON ────────────────────────────────
--
-- Reads identity_signature, inferred_guidance, and canon facts to
-- populate new columns ONLY when they are NULL (missing).
--
-- Does NOT overwrite populated columns on any row — even weak ones.
-- The generate-visual-dna-from-canon function handles population on
-- regeneration; this is a one-time structural backfill.
--
-- Identity strength preservation:
--   - All rows: populates NULL columns from existing stored evidence
--   - Strong rows: also populates NULL columns (the data is already
--     approved/strong; we're just making it queryable, not changing it)
--   - Never overwrites non-null values

DO $$
DECLARE
  rec RECORD;
  sig JSONB;
  guid JSONB;
  sig_type TEXT := pg_typeof('{}'::jsonb);
  
  -- Accumulated field values from evidence
  v_biological_sex TEXT;
  v_gender_presentation TEXT;
  v_age_range TEXT;
  v_ethnicity TEXT[];
  v_body_type TEXT;
  v_height_class TEXT;
  v_facial_archetype TEXT;
  v_voice_quality TEXT;
  v_wardrobe_signals JSONB := '{}'::jsonb;
  v_social_class TEXT;
  v_role_archetype TEXT;
  v_evidence JSONB := '{}'::jsonb;
  v_confidence JSONB := '{}'::jsonb;
  v_inference_type JSONB := '{}'::jsonb;
  
  -- Helper: field confidence
  c_sex TEXT;
  c_age TEXT;
  c_ethnicity TEXT;
  c_body TEXT;
  c_height TEXT;
  c_face TEXT;
  
  -- Trait iterator
  trait JSONB;
  trait_label TEXT;
  trait_val TEXT;
  trait_conf TEXT;
  trait_cat TEXT;
  trait_source TEXT;
BEGIN
  
  FOR rec IN
    SELECT 
      d.id, d.identity_signature, d.inferred_guidance, d.identity_strength
    FROM public.character_visual_dna d
    WHERE d.is_current = true
      AND (
        d.biological_sex IS NULL
        OR d.gender_presentation IS NULL
        OR d.age_range IS NULL
        OR d.ethnicity IS NULL
        OR d.body_type IS NULL
        OR d.height_class IS NULL
        OR d.facial_archetype IS NULL
        OR d.voice_quality IS NULL
        OR d.wardrobe_signals = '{}'::jsonb
        OR d.social_class IS NULL
        OR d.role_archetype IS NULL
      )
  LOOP
    -- Reset accumulators per row
    v_biological_sex := NULL;
    v_gender_presentation := NULL;
    v_age_range := NULL;
    v_ethnicity := NULL;
    v_body_type := NULL;
    v_height_class := NULL;
    v_facial_archetype := NULL;
    v_voice_quality := NULL;
    v_wardrobe_signals := '{}'::jsonb;
    v_social_class := NULL;
    v_role_archetype := NULL;
    v_evidence := '{}'::jsonb;
    v_confidence := '{}'::jsonb;
    v_inference_type := '{}'::jsonb;
    
    c_sex := 'unknown';
    c_age := 'unknown';
    c_ethnicity := 'unknown';
    c_body := 'unknown';
    c_height := 'unknown';
    c_face := 'unknown';
    
    sig := rec.identity_signature;
    guid := rec.inferred_guidance;
    
    -- ── PASS 1: Extract from identity_signature ──────────────
    -- identity_signature has format D (canon extraction):
    --   { signature: { face: { "eye color": {value, confidence, source}, ... } },
    --     evidence_traits: [{label, category, confidence, source, excerpt, provenance}] }
    -- OR format B (legacy):
    --   { face: { eyeSpacing, jawShape, ... }, body: {heightClass, build, ...}, 
    --     silhouette: {...}, wardrobeBaseline: {style, fit, paletteRange} }
    
    IF sig IS NOT NULL THEN
      
      -- Try format D: evidence_traits array
      IF jsonb_typeof(sig->'evidence_traits') = 'array' THEN
        FOR trait IN SELECT * FROM jsonb_array_elements(sig->'evidence_traits')
        LOOP
          trait_label := LOWER(TRIM(trait->>'label'));
          trait_cat := LOWER(TRIM(trait->>'category'));
          trait_conf := LOWER(TRIM(trait->>'confidence'));
          trait_source := TRIM(trait->>'source');
          
          -- Map known trait categories to columns
          CASE trait_cat
            WHEN 'age' THEN
              v_age_range := COALESCE(v_age_range, trait_label);
              c_age := trait_conf;
            WHEN 'gender' THEN
              v_biological_sex := COALESCE(v_biological_sex, trait_label);
              c_sex := trait_conf;
              v_gender_presentation := COALESCE(v_gender_presentation, trait_label);
            WHEN 'build' THEN
              v_body_type := COALESCE(v_body_type, trait_label);
              c_body := trait_conf;
            WHEN 'height' THEN
              v_height_class := COALESCE(v_height_class, trait_label);
              c_height := trait_conf;
            WHEN 'face' THEN
              v_facial_archetype := COALESCE(v_facial_archetype, trait_label);
              c_face := trait_conf;
            WHEN 'clothing' THEN
              v_wardrobe_signals := v_wardrobe_signals || 
                jsonb_build_object(trait_label, jsonb_build_object(
                  'value', trait->>'value',
                  'source', trait_source,
                  'confidence', trait_conf
                ));
            WHEN 'voice' THEN
              v_voice_quality := COALESCE(v_voice_quality, trait_label);
            WHEN 'ethnicity' THEN
              v_ethnicity := array_append(COALESCE(v_ethnicity, '{}'::text[]), trait_label);
              c_ethnicity := trait_conf;
            WHEN 'role' THEN
              v_role_archetype := COALESCE(v_role_archetype, trait_label);
            WHEN 'social_class' THEN
              v_social_class := COALESCE(v_social_class, trait_label);
            ELSE
              -- No mapping — skip
          END CASE;
        END LOOP;
      END IF;
      
      -- Try format D: signature.face/body sub-objects for legacy-compat fields
      IF sig ? 'signature' AND jsonb_typeof(sig->'signature') = 'object' THEN
        -- age_range from signature if not found in evidence_traits
        IF v_age_range IS NULL AND sig->'signature' ? 'age' THEN
          v_age_range := sig->'signature'->'age'->>'value';
          c_age := COALESCE(sig->'signature'->'age'->>'confidence', 'unknown');
        END IF;
        IF v_body_type IS NULL AND sig->'signature' ? 'body' THEN
          v_body_type := sig->'signature'->'body'->>'build';
          c_body := 'low';  -- legacy, no confidence tracking
        END IF;
        IF v_height_class IS NULL AND sig->'signature' ? 'body' THEN
          v_height_class := sig->'signature'->'body'->>'heightClass';
          c_height := 'low';
        END IF;
      END IF;
      
      -- Try format B: legacy flat structure (no 'signature' key)
      IF NOT (sig ? 'signature') THEN
        -- body section
        IF v_body_type IS NULL AND sig ? 'body' THEN
          v_body_type := sig->'body'->>'build';
          c_body := 'low';
        END IF;
        IF v_height_class IS NULL AND sig ? 'body' THEN
          v_height_class := sig->'body'->>'heightClass';
          c_height := 'low';
        END IF;
        -- face section
        IF v_facial_archetype IS NULL AND sig ? 'face' THEN
          v_facial_archetype := COALESCE(
            sig->'face'->>'jawShape', 
            sig->'face'->>'facialStructure',
            NULL
          );
          c_face := 'low';
        END IF;
        -- wardrobe section
        IF sig ? 'wardrobeBaseline' THEN
          v_wardrobe_signals := v_wardrobe_signals || jsonb_build_object(
            'style', jsonb_build_object('value', sig->'wardrobeBaseline'->>'style', 'source', 'legacy_identity_signature', 'confidence', 'low'),
            'fit', jsonb_build_object('value', sig->'wardrobeBaseline'->>'fit', 'source', 'legacy_identity_signature', 'confidence', 'low'),
            'palette', jsonb_build_object('value', sig->'wardrobeBaseline'->>'paletteRange', 'source', 'legacy_identity_signature', 'confidence', 'low')
          );
        END IF;
      END IF;
    END IF;
    
    -- ── PASS 2: Extract from inferred_guidance ───────────────
    -- inferred_guidance array: [{label, value, confidence, source, category, provenance}]
    IF guid IS NOT NULL AND jsonb_typeof(guid) = 'array' THEN
      FOR trait IN SELECT * FROM jsonb_array_elements(guid)
      LOOP
        trait_label := LOWER(TRIM(trait->>'label'));
        trait_cat := LOWER(TRIM(trait->>'category'));
        trait_conf := LOWER(TRIM(trait->>'confidence'));
        trait_val := TRIM(trait->>'value');
        trait_source := COALESCE(TRIM(trait->>'source'), TRIM(trait#>'{provenance,evidence_source}'->>0), 'inferred_guidance');
        
        -- Only map if we don't already have a value from identity_signature
        CASE trait_cat
          WHEN 'age' THEN
            v_age_range := COALESCE(v_age_range, trait_label, trait_val);
            IF c_age = 'unknown' THEN c_age := trait_conf; END IF;
          WHEN 'gender' THEN
            v_biological_sex := COALESCE(v_biological_sex, trait_label, trait_val);
            IF c_sex = 'unknown' THEN c_sex := trait_conf; END IF;
          WHEN 'build' THEN
            v_body_type := COALESCE(v_body_type, trait_label, trait_val);
            IF c_body = 'unknown' THEN c_body := trait_conf; END IF;
          WHEN 'face' THEN
            v_facial_archetype := COALESCE(v_facial_archetype, trait_label, trait_val);
            IF c_face = 'unknown' THEN c_face := trait_conf; END IF;
          WHEN 'clothing' THEN
            IF NOT (v_wardrobe_signals ? trait_label) THEN
              v_wardrobe_signals := v_wardrobe_signals || 
                jsonb_build_object(trait_label, jsonb_build_object(
                  'value', trait_val,
                  'source', trait_source,
                  'confidence', trait_conf
                ));
            END IF;
          WHEN 'height' THEN
            v_height_class := COALESCE(v_height_class, trait_label, trait_val);
            IF c_height = 'unknown' THEN c_height := trait_conf; END IF;
          WHEN 'voice' THEN
            v_voice_quality := COALESCE(v_voice_quality, trait_label, trait_val);
          WHEN 'ethnicity' THEN
            IF NOT (v_ethnicity @> ARRAY[COALESCE(trait_label, trait_val)]) THEN
              v_ethnicity := array_append(COALESCE(v_ethnicity, '{}'::text[]), COALESCE(trait_label, trait_val));
            END IF;
            IF c_ethnicity = 'unknown' THEN c_ethnicity := trait_conf; END IF;
          WHEN 'role' THEN
            v_role_archetype := COALESCE(v_role_archetype, trait_label, trait_val);
          WHEN 'social_class' THEN
            v_social_class := COALESCE(v_social_class, trait_label, trait_val);
          ELSE
            -- No mapping
        END CASE;
      END LOOP;
    END IF;
    
    -- ── Build evidence/confidence/inference_type JSON ─────
    v_evidence := jsonb_build_object(
      'biological_sex', CASE WHEN v_biological_sex IS NOT NULL THEN 
        COALESCE((sig->'evidence_traits'->0->>'source')::text, 'backfill_from_json') ELSE NULL END,
      'age_range', CASE WHEN v_age_range IS NOT NULL THEN 'backfill_from_json' ELSE NULL END,
      'body_type', CASE WHEN v_body_type IS NOT NULL THEN 'backfill_from_json' ELSE NULL END,
      'height_class', CASE WHEN v_height_class IS NOT NULL THEN 'backfill_from_json' ELSE NULL END,
      'ethnicity', CASE WHEN v_ethnicity IS NOT NULL THEN 'backfill_from_json' ELSE NULL END,
      'facial_archetype', CASE WHEN v_facial_archetype IS NOT NULL THEN 'backfill_from_json' ELSE NULL END,
      'voice_quality', CASE WHEN v_voice_quality IS NOT NULL THEN 'backfill_from_json' ELSE NULL END
    );
    
    v_confidence := jsonb_build_object(
      'biological_sex', c_sex,
      'age_range', c_age,
      'body_type', c_body,
      'height_class', c_height,
      'facial_archetype', c_face,
      'ethnicity', c_ethnicity
    );
    
    v_inference_type := jsonb_build_object(
      'biological_sex', CASE WHEN v_biological_sex IS NOT NULL THEN 'ai_extraction' ELSE NULL END,
      'age_range', CASE WHEN v_age_range IS NOT NULL THEN 'ai_extraction' ELSE NULL END,
      'body_type', CASE WHEN v_body_type IS NOT NULL THEN 'ai_extraction' ELSE NULL END,
      'height_class', CASE WHEN v_height_class IS NOT NULL THEN 'ai_extraction' ELSE NULL END,
      'ethnicity', CASE WHEN v_ethnicity IS NOT NULL THEN 'ai_extraction' ELSE NULL END,
      'facial_archetype', CASE WHEN v_facial_archetype IS NOT NULL THEN 'ai_extraction' ELSE NULL END,
      'voice_quality', CASE WHEN v_voice_quality IS NOT NULL THEN 'ai_extraction' ELSE NULL END
    );
    
    -- ── Apply backfill (NULL columns only) ────────────────
    UPDATE public.character_visual_dna
    SET
      biological_sex        = COALESCE(biological_sex, v_biological_sex),
      gender_presentation   = COALESCE(gender_presentation, v_gender_presentation),
      age_range             = COALESCE(age_range, v_age_range),
      ethnicity             = COALESCE(ethnicity, v_ethnicity),
      body_type             = COALESCE(body_type, v_body_type),
      height_class          = COALESCE(height_class, v_height_class),
      facial_archetype      = COALESCE(facial_archetype, v_facial_archetype),
      voice_quality         = COALESCE(voice_quality, v_voice_quality),
      wardrobe_signals      = CASE WHEN wardrobe_signals = '{}'::jsonb THEN v_wardrobe_signals ELSE wardrobe_signals END,
      social_class          = COALESCE(social_class, v_social_class),
      role_archetype        = COALESCE(role_archetype, v_role_archetype),
      identity_evidence     = CASE 
                               WHEN identity_evidence = '{}'::jsonb OR identity_evidence IS NULL 
                               THEN v_evidence 
                               ELSE identity_evidence 
                             END,
      identity_confidence   = CASE 
                               WHEN identity_confidence = '{}'::jsonb OR identity_confidence IS NULL 
                               THEN v_confidence 
                               ELSE identity_confidence 
                             END,
      identity_inference_type = CASE 
                                 WHEN identity_inference_type = '{}'::jsonb OR identity_inference_type IS NULL 
                                 THEN v_inference_type 
                                 ELSE identity_inference_type 
                               END
    WHERE id = rec.id;
    
  END LOOP;
  
END $$;

COMMIT;