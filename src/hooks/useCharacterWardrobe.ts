/**
 * useCharacterWardrobe — Hook for extracting, persisting, and reading
 * character wardrobe profiles from project canon.
 *
 * Persists to project_canon.canon_json.character_wardrobe_profiles.
 * Enriches character input with document-derived text for richer extraction.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mergeProjectCanonJson } from '@/lib/canon/projectCanonStorage';
import {
  extractCharacterWardrobes,
  getCharacterWardrobeProfile,
  getCharacterWardrobeStates,
  getSignatureGarmentNouns,
  getWardrobeAdjustments,
  type CharacterWardrobeExtractionResult,
  type CharacterWardrobeProfile,
  type WardrobeStateDefinition,
} from '@/lib/visual/characterWardrobeExtractor';

/** Doc types relevant for wardrobe evidence — aligned with processEvidenceResolver */
const WARDROBE_DOC_TYPES = [
  'character_bible', 'character_profile', 'treatment',
  'story_outline', 'beat_sheet', 'feature_script', 'episode_script',
  'screenplay_draft', 'production_draft', 'season_script', 'world_bible', 'series_bible',
];

/**
 * Load document text and extract character-relevant passages to enrich
 * the canon character objects before wardrobe extraction.
 */
async function loadDocumentEnrichment(
  projectId: string,
): Promise<Record<string, string>> {
  // Fetch docs — same query pattern as processEvidenceResolver
  const { data: docs, error: docsError } = await supabase
    .from('project_documents')
    .select('id, doc_type, plaintext, extracted_text')
    .eq('project_id', projectId)
    .in('doc_type', WARDROBE_DOC_TYPES);

  if (docsError) {
    throw new Error(`[Wardrobe] Document query failed: ${docsError.message}`);
  }

  if (!docs || docs.length === 0) {
    console.warn('[Wardrobe] No relevant documents found for project');
    return { _combined: '' };
  }

  const docIds = docs.map(d => d.id);

  // Fetch current versions — prefer is_current = true
  const { data: versions } = await (supabase as any)
    .from('project_document_versions')
    .select('document_id, plaintext, is_current, version_number')
    .in('document_id', docIds)
    .order('version_number', { ascending: false });

  // Build doc_id → best plaintext (prefer is_current, then latest version)
  const versionMap: Record<string, string> = {};
  for (const v of versions || []) {
    if (!versionMap[v.document_id] || v.is_current) {
      if (v.plaintext && v.plaintext.trim().length > 20) {
        versionMap[v.document_id] = v.plaintext;
      }
    }
  }

  // Collect all document text with coverage logging
  const allTexts: string[] = [];
  const loadedTypes: string[] = [];
  const emptyTypes: string[] = [];

  for (const doc of docs) {
    const text = versionMap[doc.id] || (doc as any).plaintext || (doc as any).extracted_text || '';
    if (text.trim().length > 20) {
      allTexts.push(text);
      loadedTypes.push((doc as any).doc_type);
    } else {
      emptyTypes.push((doc as any).doc_type);
    }
  }

  console.log(
    `[Wardrobe] Document coverage: ${loadedTypes.length} loaded [${loadedTypes.join(', ')}]` +
    (emptyTypes.length > 0 ? `, ${emptyTypes.length} empty [${emptyTypes.join(', ')}]` : '')
  );

  return { _combined: allTexts.join('\n\n') };
}

/**
 * Load scene text from scene_graph_versions for scene-bound costume extraction.
 * Returns structured scene text inputs that feed into the wardrobe pipeline.
 */
async function loadSceneTexts(
  projectId: string,
): Promise<Array<{ scene_key: string; scene_number?: number; slugline?: string; content: string; characters_present?: string[] }>> {
  try {
    // Try scene_graph_versions first (richest scene text source)
    const { data: sceneVersions } = await (supabase as any)
      .from('scene_graph_versions')
      .select('scene_id, slugline, content, summary, characters_present')
      .eq('project_id', projectId)
      .eq('status', 'draft')
      .order('created_at', { ascending: true });

    if (sceneVersions && sceneVersions.length > 0) {
      const { data: orderRows } = await (supabase as any)
        .from('scene_graph_order')
        .select('scene_id, order_key')
        .eq('project_id', projectId)
        .eq('is_active', true);

      const orderMap: Record<string, string> = {};
      for (const row of orderRows || []) {
        orderMap[row.scene_id] = row.order_key;
      }

      return sceneVersions
        .filter((sv: any) => (sv.content || sv.summary || '').trim().length > 10)
        .map((sv: any, idx: number) => ({
          scene_key: sv.scene_id,
          scene_number: idx + 1,
          slugline: sv.slugline || undefined,
          content: sv.content || sv.summary || '',
          characters_present: Array.isArray(sv.characters_present) ? sv.characters_present : undefined,
        }));
    }

    // ── Fallback: parse script documents into scene chunks ──
    // When no scene graph exists, split script text at SCENE markers
    // so the costume extraction pipeline has scene-level text to work with.
    const SCRIPT_DOC_TYPES = ['season_script', 'feature_script', 'episode_script', 'production_draft', 'screenplay_draft'];
    const { data: scriptDocs } = await supabase
      .from('project_documents')
      .select('id, doc_type')
      .eq('project_id', projectId)
      .in('doc_type', SCRIPT_DOC_TYPES);

    if (!scriptDocs || scriptDocs.length === 0) return [];

    const docIds = scriptDocs.map(d => d.id);
    const { data: versions } = await (supabase as any)
      .from('project_document_versions')
      .select('document_id, plaintext, is_current')
      .in('document_id', docIds)
      .eq('is_current', true);

    // Find the longest script text available
    let bestText = '';
    for (const v of versions || []) {
      const txt = v.plaintext || '';
      if (txt.length > bestText.length) bestText = txt;
    }

    if (bestText.length < 100) return [];

    // Split on SCENE markers (e.g. "SCENE 1 — ...", "SCENE 14:", etc.)
    const sceneChunks = parseScriptIntoScenes(bestText);
    console.log(`[Wardrobe] Script fallback: parsed ${sceneChunks.length} scene chunks from script text`);
    return sceneChunks;
  } catch (e) {
    console.warn('[Wardrobe] Scene text loading failed (non-fatal):', e);
    return [];
  }
}

/**
 * Parse a script document into scene-level chunks by splitting on
 * common scene heading patterns: SCENE N, INT./EXT., COLD OPEN, etc.
 */
function parseScriptIntoScenes(
  text: string,
): Array<{ scene_key: string; scene_number?: number; slugline?: string; content: string }> {
  // Three separate patterns for clarity — tested against real script format
  const SCENE_NUM_RE = /^\s*SCENE\s+(\d+)\s*[—–:\-\.]\s*(.*)$/i;
  const SPECIAL_RE = /^\s*(COLD OPEN|TEASER|EPILOGUE|FLASHBACK)(?:\s*[—–:\-\.]\s*(.*))?$/i;
  const SLUG_RE = /^\s*((?:INT|EXT|INT\/EXT)\.?\s+.+)$/i;

  const lines = text.split('\n');
  const scenes: Array<{ scene_key: string; scene_number?: number; slugline?: string; content: string }> = [];
  let currentLines: string[] = [];
  let currentKey = '';
  let currentNumber: number | undefined;
  let currentSlugline: string | undefined;
  let sceneCounter = 0;

  function flushScene() {
    if (currentLines.length > 0 && currentKey) {
      const content = currentLines.join('\n').trim();
      if (content.length > 20) {
        scenes.push({
          scene_key: currentKey,
          scene_number: currentNumber,
          slugline: currentSlugline,
          content,
        });
      }
    }
    currentLines = [];
  }

  for (const line of lines) {
    const m = line.match(SCENE_NUM_RE) || line.match(SPECIAL_RE) || line.match(SLUG_RE);
    if (m) {
      flushScene();
      sceneCounter++;
      // Detect which regex matched by checking the input pattern
      const lineT = line.trim();
      const sceneNumMatch = lineT.match(/^SCENE\s+(\d+)\s*[—–:\-\.]\s*(.*)$/i);
      const specialMatch = lineT.match(/^(COLD OPEN|TEASER|EPILOGUE|FLASHBACK)/i);
      if (sceneNumMatch) {
        currentNumber = parseInt(sceneNumMatch[1], 10);
        currentSlugline = (sceneNumMatch[2] || '').trim() || undefined;
        currentKey = `scene-${currentNumber}`;
      } else if (specialMatch) {
        currentSlugline = m[2] ? m[2].trim() : m[1].trim();
        currentKey = `scene-${sceneCounter}`;
        currentNumber = sceneCounter;
      } else {
        // INT./EXT. heading
        currentSlugline = m[1]?.trim();
        currentKey = `scene-${sceneCounter}`;
        currentNumber = sceneCounter;
      }
    }
    currentLines.push(line);
  }
  flushScene();

  return scenes;
}

/**
 * Extract character-relevant passages from combined document text.
 */
function extractCharacterPassages(
  combinedText: string,
  characterName: string,
): string {
  if (!combinedText || !characterName) return '';

  const nameVariants = [
    characterName,
    characterName.replace(/_/g, ' '),
  ];

  const sentences = combinedText.split(/[.!?\n]+/);
  const passages: string[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (nameVariants.some(n => lower.includes(n.toLowerCase()))) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10 && trimmed.length < 500) {
        passages.push(trimmed);
      }
    }
  }

  // Cap to reasonable size
  return passages.slice(0, 30).join('. ');
}

export function useCharacterWardrobe(projectId: string | undefined) {
  const queryClient = useQueryClient();

  // Load canon JSON
  const canonQuery = useQuery({
    queryKey: ['project-canon', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await (supabase as any)
        .from('project_canon')
        .select('canon_json')
        .eq('project_id', projectId)
        .maybeSingle();
      if (error) throw error;
      return (data?.canon_json as Record<string, unknown>) || null;
    },
    enabled: !!projectId,
  });

  const canonJson = canonQuery.data;

  // Read persisted extraction
  const persisted: CharacterWardrobeExtractionResult | null = useMemo(() => {
    if (!canonJson) return null;
    const raw = canonJson.character_wardrobe_profiles;
    if (raw && typeof raw === 'object' && 'extraction_version' in (raw as any)) {
      return raw as unknown as CharacterWardrobeExtractionResult;
    }
    return null;
  }, [canonJson]);

  // Extract + persist mutation — enriches characters with document text
  const extractMutation = useMutation({
    mutationFn: async (options?: { silent?: boolean; requireTemporal?: boolean }) => {
      if (!projectId) throw new Error('No project ID');
      if (!canonJson) throw new Error('No canon available — ensure project canon exists before extracting wardrobe profiles');

      const characters = (canonJson as any).characters;
      if (!Array.isArray(characters) || characters.length === 0) {
        throw new Error('No characters found in canon — add characters to project canon first');
      }

      // Load document text for enrichment — fail-loud, no silent fallback
      const enrichment = await loadDocumentEnrichment(projectId);
      const docText = enrichment._combined || '';
      const docCount = Object.keys(enrichment).filter(k => k !== '_combined').length;
      
      console.log(`[Wardrobe] Evidence loaded: ${docText.length} chars from documents`);

      // Load scene text for scene-bound costume extraction
      const sceneTexts = await loadSceneTexts(projectId);
      console.log(`[Wardrobe] Scene texts loaded: ${sceneTexts.length} scenes`);

      // Enrich character objects with document-derived passages
      const enrichedCanon = { ...(canonJson as any) };
      if (docText.length > 0) {
        enrichedCanon.characters = characters.map((char: any) => {
          if (!char.name) return char;
          const passages = extractCharacterPassages(docText, char.name);
          if (!passages) return char;

          // Append document passages to description for richer regex matching
          const existingDesc = char.description || '';
          return {
            ...char,
            description: existingDesc
              ? `${existingDesc}\n\n${passages}`
              : passages,
          };
        });
      }

      // Add scene texts to canon input for scene-bound costume extraction
      if (sceneTexts.length > 0) {
        enrichedCanon.scene_texts = sceneTexts;
      }

      // Pass canonical temporal truth to prevent independent era re-derivation
      const canonicalTemporal = canonJson.canonical_temporal_truth as { era: string; family: string } | undefined;
      const result = extractCharacterWardrobes(enrichedCanon, canonicalTemporal || null);

      // ── RUNTIME PROOF: Project-Scoped Wardrobe Truth ──
      // Temporary debug trace proving no cross-project contamination
      const proofTargets = ['Leila Arman', 'Gabriel Varela'];
      const proofProfiles = result.profiles
        .filter(p => proofTargets.some(t => p.character_name.toLowerCase().includes(t.split(' ')[0].toLowerCase())));

      console.group(`%c[WARDROBE PROOF] Project-Scoped Truth — ${projectId}`, 'color: #00e676; font-weight: bold; font-size: 13px');
      console.log('active project_id:', projectId);
      console.log('canonical temporal truth input:', canonicalTemporal ?? '(none — will default to contemporary)');
      
      // Resolve what the extractor actually used
      const worldCtxEra = result.profiles[0]?.extraction_debug?.dominant_anchor_class
        ? `from extraction debug` : 'see per-profile';
      const usedRegexFallback = !canonicalTemporal || !canonicalTemporal.era || canonicalTemporal.era === 'ambiguous';
      console.log('regex fallback used:', usedRegexFallback);
      console.log('final resolved era/family:', canonicalTemporal?.era ?? 'contemporary (default)', '/', canonicalTemporal?.family ?? 'modern (default)');
      
      // Garment vocabulary family
      const eraKey = canonicalTemporal?.era ?? 'contemporary';
      const isHistorical = ['medieval', 'feudal', 'victorian', 'renaissance', 'ancient'].includes(eraKey);
      console.log('garment vocabulary family:', isHistorical ? 'HISTORICAL ⚠️' : 'MODERN ✓', `(era: ${eraKey})`);

      // Per-character proof
      for (const p of proofProfiles) {
        const first3 = p.signature_garments.slice(0, 3);
        const historicalGarments = first3.filter(g => 
          ['tunic', 'cloak', 'robe', 'kimono', 'hakama', 'haori', 'kosode', 'toga', 'tabard', 'doublet', 'bodice', 'corset', 'gown', 'cape'].includes(g.toLowerCase())
        );
        console.log(`  ${p.character_name}:`, {
          first_3_garments: first3,
          historical_contamination: historicalGarments.length > 0 ? `⚠️ FOUND: ${historicalGarments.join(', ')}` : '✓ NONE',
          class: p.extraction_debug?.class_resolution_value,
          class_source: p.extraction_debug?.class_resolution_source,
          used_world_fallback: p.extraction_debug?.used_world_fallback,
          used_generic_fallback: p.extraction_debug?.used_generic_fallback,
        });
      }
      if (proofProfiles.length === 0) {
        console.log('  (target characters not found — available:', result.profiles.map(p => p.character_name).join(', '), ')');
      }
      console.groupEnd();
      // ── END RUNTIME PROOF ──

      if (result.profiles.length === 0) {
        throw new Error(
          `Wardrobe extraction failed due to insufficient character evidence. ` +
          `${characters.length} characters found, document evidence: ${docText.length > 0 ? 'yes' : 'none'}.`
        );
      }

      // Check if ALL profiles are degraded — fail-loud
      const degradedProfiles = result.profiles.filter(p => p.confidence === 'low');
      if (degradedProfiles.length === result.profiles.length) {
        // All degraded — still persist but warn explicitly
        console.warn(
          `[Wardrobe] All ${result.profiles.length} profiles are degraded. ` +
          `Document evidence: ${docText.length} chars. Characters: ${characters.length}.`
        );
      }

      // Track document enrichment provenance
      if (docText.length > 0) {
        result.source_doc_types = [...new Set([
          ...result.source_doc_types,
          'document_enrichment',
        ])];
      }

      const committed = await mergeProjectCanonJson(
        projectId,
        (current) => ({
          ...current,
          character_wardrobe_profiles: result,
        }),
        'useCharacterWardrobe.extract',
      );

      const persistedProfiles = committed.canonJson.character_wardrobe_profiles as any;
      const persistedTemporal = committed.canonJson.canonical_temporal_truth as any;

      if (!persistedProfiles || typeof persistedProfiles !== 'object' || !('extraction_version' in persistedProfiles)) {
        throw new Error('Wardrobe profiles did not persist durably.');
      }

      console.log('[Wardrobe] verified selector row after persist', {
        projectId,
        updatedAt: committed.updatedAt,
        hasTemporal: !!persistedTemporal?.era,
        temporalEra: persistedTemporal?.era ?? null,
        wardrobeVersion: persistedProfiles.extraction_version ?? null,
        silent: options?.silent ?? false,
      });

      if (options?.requireTemporal && (!persistedTemporal || typeof persistedTemporal !== 'object' || !persistedTemporal.era)) {
        throw new Error('Wardrobe persisted but canonical temporal truth was not durable after rebuild.');
      }

      return result;
    },
    onSuccess: (result, options) => {
      queryClient.invalidateQueries({ queryKey: ['project-canon', projectId] });
      // Also invalidate costume/visual queries that depend on wardrobe readiness
      queryClient.invalidateQueries({ queryKey: ['costume-on-actor', projectId] });
      queryClient.invalidateQueries({ queryKey: ['character-wardrobe', projectId] });
      if (!options?.silent) {
        const degradedCount = result.profiles.filter(p => p.confidence === 'low').length;
        const healthyCount = result.profiles.length - degradedCount;
        toast.success(
          `Extracted wardrobe profiles for ${result.profiles.length} characters` +
          (healthyCount > 0 ? ` (${healthyCount} healthy)` : '') +
          (degradedCount > 0 ? ` — ${degradedCount} still need richer source data` : ''),
        );
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Wardrobe extraction failed');
    },
  });

  const MIN_SUPPORTED_WARDROBE_EXTRACTION_VERSION = '1.5.0';

  // Staleness detection
  const staleness = useMemo(() => {
    if (!persisted) return { isStalePersisted: false, staleReasons: [] as string[] };
    const reasons: string[] = [];
    if (persisted.extraction_version < MIN_SUPPORTED_WARDROBE_EXTRACTION_VERSION) {
      reasons.push(`Extraction version ${persisted.extraction_version} < required ${MIN_SUPPORTED_WARDROBE_EXTRACTION_VERSION}`);
    }
    const hasTemporal = canonJson?.canonical_temporal_truth && typeof canonJson.canonical_temporal_truth === 'object' && 'era' in (canonJson.canonical_temporal_truth as any);
    if (!hasTemporal) {
      reasons.push('No persisted canonical temporal truth');
    }
    return { isStalePersisted: reasons.length > 0, staleReasons: reasons };
  }, [persisted, canonJson]);

  // Coverage summary
  const coverage = useMemo(() => {
    if (!persisted) return null;
    const totalStates = Object.values(persisted.state_matrix).reduce((sum, arr) => sum + arr.length, 0);
    const explicitStates = Object.values(persisted.state_matrix)
      .flat()
      .filter(s => s.explicit_or_inferred === 'explicit').length;
    const sceneEvidence = persisted.scene_costume_evidence;
    return {
      profiles: persisted.profiles.length,
      totalStates,
      explicitStates,
      inferredStates: totalStates - explicitStates,
      sceneFactCount: sceneEvidence?.facts.length ?? 0,
      charactersWithSceneEvidence: sceneEvidence?.summary.characters_with_scene_evidence ?? [],
      scenesScanned: sceneEvidence?.summary.scenes_scanned ?? 0,
      version: persisted.extraction_version,
      extracted_at: persisted.extracted_at,
    };
  }, [persisted]);

  return {
    extraction: persisted,
    coverage,
    loading: canonQuery.isLoading,
    hasCanon: !!canonJson,
    extract: (options?: { silent?: boolean; requireTemporal?: boolean }) => extractMutation.mutate(options),
    extractAsync: (options?: { silent?: boolean; requireTemporal?: boolean }) => extractMutation.mutateAsync(options),
    extracting: extractMutation.isPending,
    // Staleness metadata
    isPersisted: !!persisted,
    extractionVersion: persisted?.extraction_version ?? null,
    extractedAt: persisted?.extracted_at ?? null,
    isStalePersisted: staleness.isStalePersisted,
    staleReasons: staleness.staleReasons,
    sourceDocTypes: persisted?.source_doc_types ?? [],
    // Seam helpers
    getProfile: (name: string): CharacterWardrobeProfile | null =>
      persisted ? getCharacterWardrobeProfile(persisted, name) : null,
    getStates: (name: string): WardrobeStateDefinition[] =>
      persisted ? getCharacterWardrobeStates(persisted, name) : [],
    getGarmentNouns: (name: string): string[] =>
      persisted ? getSignatureGarmentNouns(persisted, name) : [],
    getAdjustments: (name: string, stateKey: string): WardrobeStateDefinition | null =>
      persisted ? getWardrobeAdjustments(persisted, name, stateKey) : null,
  };
}
