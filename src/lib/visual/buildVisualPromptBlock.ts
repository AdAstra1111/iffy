/**
 * buildVisualPromptBlock.ts — Deterministic visual prompt block derivation.
 *
 * Takes structured character_visual_dna fields and produces a concise
 * human-readable prompt. No LLM. No DB writes. Pure function.
 *
 * Designed to replace the phantom `visual_prompt_block` column that
 * never existed in any table.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface VisualDNARow {
  character_name?: string;
  biological_sex?: string | null;
  gender_presentation?: string | null;
  age_range?: string | null;
  ethnicity?: string[] | null;
  body_type?: string | null;
  height_class?: string | null;
  facial_archetype?: string | null;
  voice_quality?: string | null;
  wardrobe_signals?: Record<string, { value?: string; source?: string; confidence?: string }> | null;
  social_class?: string | null;
  role_archetype?: string | null;
  identity_signature?: Record<string, unknown> | null;
  traits_json?: unknown[] | null;
  physical_categories?: Record<string, { value?: string }> | null;
  binding_markers?: unknown[] | null;
}

// ── Builders ────────────────────────────────────────────────────────

/**
 * Build a human-readable visual prompt block from structured DNA fields.
 *
 * Output format combines physical descriptors, identity traits, and
 * wardrobe signals into a concise string like:
 * "A female, 30s-40s, athletic build character with sharp gaze.
 *  Wears tailored formal wear in dark neutrals.
 *  Traits: resilient, determined"
 *
 * Returns empty string if no meaningful data is available.
 */
export function buildVisualPromptBlock(row: VisualDNARow | null | undefined): string {
  if (!row) return '';

  const parts: string[] = [];

  // ── Physical description: biological sex + age + build ──
  const physical: string[] = [];

  // Biological sex (prefer gender_presentation as broader)
  const gender = row.gender_presentation || row.biological_sex;
  if (gender && isValidDescriptor(gender)) {
    physical.push(capitalizeFirst(gender));
  }

  // Age
  if (row.age_range && isValidDescriptor(row.age_range)) {
    physical.push(stripLowConfidenceLabels(row.age_range));
  }

  // Ethnicity (only if explicitly present — never infer)
  if (row.ethnicity && Array.isArray(row.ethnicity) && row.ethnicity.length > 0) {
    const cleanEth = row.ethnicity
      .filter(e => e && e.length > 1 && e.length < 40)
      .map(e => capitalizeFirst(e));
    if (cleanEth.length > 0) {
      physical.push(cleanEth.join('/'));
    }
  }

  // Body type
  if (row.body_type && isValidDescriptor(row.body_type)) {
    physical.push(stripLowConfidenceLabels(row.body_type));
  }

  // Height
  if (row.height_class && isValidDescriptor(row.height_class)) {
    physical.push(stripLowConfidenceLabels(row.height_class));
  }

  if (physical.length > 0) {
    parts.push(`A ${physical.join(', ')} character`);
  }

  // ── Face ──
  const faceParts: string[] = [];
  if (row.facial_archetype && isValidDescriptor(row.facial_archetype)) {
    const cleaned = stripLowConfidenceLabels(row.facial_archetype);
    // Skip if it's just "eyes" — too vague
    if (cleaned !== 'eyes' && cleaned !== 'eyes.') {
      faceParts.push(cleaned);
    }
  }

  // Legacy face from identity_signature
  if (faceParts.length === 0 && row.identity_signature) {
    const sig = row.identity_signature as Record<string, unknown>;
    // Format B legacy
    if (sig.face && typeof sig.face === 'object') {
      const face = sig.face as Record<string, unknown>;
      // Collect all face descriptors
      const faceDescriptors: string[] = [];
      for (const val of Object.values(face)) {
        if (typeof val === 'string' && val.length > 2 && val.length < 80) {
          faceDescriptors.push(val);
        }
      }
      if (faceDescriptors.length > 0) {
        faceParts.push(faceDescriptors.join(', '));
      }
    }
    // Format D signature key
    if (sig.signature && typeof sig.signature === 'object') {
      const sigObj = sig.signature as Record<string, unknown>;
      if (sigObj.face && typeof sigObj.face === 'object') {
        const faceEntries = sigObj.face as Record<string, { value?: string }>;
        const values: string[] = [];
        for (const entry of Object.values(faceEntries)) {
          if (entry?.value && typeof entry.value === 'string' && entry.value.length > 2 && entry.value.length < 60) {
            values.push(entry.value);
          }
        }
        if (values.length > 0) {
          faceParts.push(values.join(', '));
        }
      }
    }
  }

  if (faceParts.length > 0) {
    // Append face info — avoid duplicating "features" suffix
    const faceStr = faceParts.join('; ');
    if (parts.length > 0) {
      const suffix = faceStr.toLowerCase().endsWith(' features') ? '' : ' features';
      parts[parts.length - 1] += ` with ${faceStr}${suffix}`;
    } else {
      parts.push(`Character with ${faceStr} features`);
    }
  }

  // Legacy body from identity_signature
  if (!row.body_type && row.identity_signature) {
    const sig = row.identity_signature as Record<string, unknown>;
    if (sig.body && typeof sig.body === 'object') {
      const body = sig.body as Record<string, unknown>;
      const bodyDesc: string[] = [];
      for (const val of Object.values(body)) {
        if (typeof val === 'string' && val.length > 2 && val.length < 80) {
          bodyDesc.push(val);
        }
      }
      if (bodyDesc.length > 0 && bodyDesc.join(', ').length > 3) {
        parts.push(bodyDesc.join(', '));
      }
    }
  }

  // ── Voice ──
  if (row.voice_quality && isValidDescriptor(row.voice_quality)) {
    parts.push(`${capitalizeFirst(row.voice_quality)} voice`);
  }

  // ── Role ──
  if (row.role_archetype && isValidDescriptor(row.role_archetype)) {
    parts.push(`${capitalizeFirst(row.role_archetype)} archetype`);
  }

  // ── Wardrobe ──
  if (row.wardrobe_signals && typeof row.wardrobe_signals === 'object') {
    const wardrobeItems: string[] = [];
    for (const [key, val] of Object.entries(row.wardrobe_signals)) {
      if (val && typeof val === 'object' && val.value) {
        const cleanVal = String(val.value).trim();
        if (cleanVal.length > 1 && cleanVal.length < 80) {
          wardrobeItems.push(cleanVal);
        }
      } else if (val && typeof val === 'string') {
        const cleanVal = String(val).trim();
        if (cleanVal.length > 1 && cleanVal.length < 80) {
          wardrobeItems.push(cleanVal);
        }
      }
    }
    if (wardrobeItems.length > 0) {
      const unique = Array.from(new Set(wardrobeItems));
      parts.push(`Wears ${unique.join(', ')}`);
    }
  }

  // ── Social class ──
  if (row.social_class && isValidDescriptor(row.social_class)) {
    parts.push(`${capitalizeFirst(row.social_class)} class`);
  }

  // ── Traits from traits_json ──
  const traitLabels: string[] = [];
  if (row.traits_json && Array.isArray(row.traits_json)) {
    for (const trait of row.traits_json) {
      if (trait && typeof trait === 'object' && 'label' in trait && 'category' in trait) {
        const cat = String((trait as any).category || '').toLowerCase().trim();
        const label = String((trait as any).label || '').trim();
        // Skip if it's already covered by structured fields or too vague
        if (label && label.length > 2 && label.length < 60 &&
            !['gender', 'age', 'build', 'height', 'face', 'voice', 'ethnicity', 'clothing'].includes(cat)) {
          traitLabels.push(capitalizeFirst(label));
        }
      }
    }
  }

  // Traits from physical_categories
  if (row.physical_categories && typeof row.physical_categories === 'object') {
    for (const val of Object.values(row.physical_categories)) {
      if (val && typeof val === 'object' && 'value' in val) {
        const v = String((val as any).value || '').trim();
        if (v.length > 2 && v.length < 60 && !traitLabels.includes(capitalizeFirst(v))) {
          traitLabels.push(capitalizeFirst(v));
        }
      }
    }
  }

  // Legacy traits from identity_signature hair/skin/etc
  if (row.identity_signature) {
    const sig = row.identity_signature as Record<string, unknown>;
    const legacyCategories = ['hair', 'skin', 'posture'];
    for (const cat of legacyCategories) {
      if (sig[cat] && typeof sig[cat] === 'string') {
        const v = String(sig[cat]).trim();
        if (v.length > 2 && v.length < 60 && !traitLabels.includes(capitalizeFirst(v))) {
          traitLabels.push(`${capitalizeFirst(cat)}: ${capitalizeFirst(v)}`);
        }
      }
    }
  }

  if (traitLabels.length > 0) {
    // Limit to most meaningful traits
    const uniqueTraits = Array.from(new Set(traitLabels)).slice(0, 8);
    parts.push(`Traits: ${uniqueTraits.join(', ')}`);
  }

  // ── Social class as context (already handled above) ──

  const result = parts.join('. ').trim();
  return result.length > 0 ? result : '';
}

// ── Helpers ─────────────────────────────────────────────────────────

function capitalizeFirst(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Strip low-confidence labels like "age estimate", "age", "eyes" 
 * that are too vague for meaningful prompts.
 */
function stripLowConfidenceLabels(value: string): string {
  const lowConfidence = [
    'age estimate', 'age', 'eyes', 'eyes.', 'eyes hold wisdom',
    'ancient age', 'unknown',
  ];
  const clean = value.toLowerCase().trim();
  if (lowConfidence.includes(clean)) return '';
  // Also strip "age", "years old" suffixes
  return value
    .replace(/\s+years?\s*old$/i, '')
    .replace(/\s+age\s*range$/i, '')
    .replace(/\s+age$/i, '')
    .trim();
}

/**
 * Validate that a descriptor is meaningful enough for a prompt.
 */
function isValidDescriptor(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const clean = value.toLowerCase().trim();
  // Reject very short values, single letters, or known noise
  if (clean.length < 2) return false;
  const noise = ['n/a', 'none', 'null', 'undefined', 'unknown', '-', '—', 'eyes', 'eyes.'];
  if (noise.includes(clean)) return false;
  // Reject identifiers that look like UUID fragments
  if (/^[a-f0-9]{8,}$/i.test(clean)) return false;
  return true;
}