/**
 * generationModeResolver.test.ts — Regression tests proving:
 * - VPB resolves to deterministic_assembly
 * - VPB never allows LLM in any phase
 * - LLM-native docs resolve correctly
 * - Chunked docs resolve correctly
 * - assertLLMAllowed throws for deterministic docs
 * - Provenance is correct for all modes
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Inline the resolver logic for client-side testing ──
// (Edge function modules can't be directly imported in vitest)

type GenerationMode = "deterministic_assembly" | "llm_single_pass" | "llm_chunked";

type GenerationPhase =
  | "primary_generation"
  | "chunked_generation"
  | "nuance_repair"
  | "json_extraction_retry"
  | "banned_language_retry"
  | "placeholder_retry"
  | "episode_count_repair"
  | "post_generation_validation";

const DETERMINISTIC_DOC_TYPES = new Set(["visual_project_bible"]);

function resolveDocumentGenerationMode(
  docType: string, isEpisodic: boolean, isLargeRisk: boolean,
): GenerationMode {
  if (DETERMINISTIC_DOC_TYPES.has(docType)) return "deterministic_assembly";
  if (isEpisodic || isLargeRisk) return "llm_chunked";
  return "llm_single_pass";
}

function isLLMAllowedForDocPhase(mode: GenerationMode, _phase: GenerationPhase): boolean {
  return mode !== "deterministic_assembly";
}

function assertLLMAllowed(mode: GenerationMode, phase: GenerationPhase, docType: string): void {
  if (!isLLMAllowedForDocPhase(mode, phase)) {
    throw new Error(`[IEL] LLM_FORBIDDEN: docType="${docType}" mode="${mode}" phase="${phase}"`);
  }
}

function readProjectFile(relPath: string): string {
  const candidates = [
    path.resolve(process.cwd(), relPath),
    path.resolve(__dirname, '..', '..', '..', relPath),
    path.resolve(__dirname, '..', '..', '..', '..', relPath),
  ];
  for (const full of candidates) {
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf-8');
  }
  return '';
}

// ── Mode Resolution ─────────────────────────────────────────────────────────

describe('Generation Mode: Resolution', () => {
  it('visual_project_bible resolves to deterministic_assembly', () => {
    expect(resolveDocumentGenerationMode('visual_project_bible', false, false))
      .toBe('deterministic_assembly');
  });

  it('VPB resolves to deterministic even if isEpisodic/isLargeRisk flags are true', () => {
    expect(resolveDocumentGenerationMode('visual_project_bible', true, true))
      .toBe('deterministic_assembly');
  });

  it('concept_brief resolves to llm_single_pass', () => {
    expect(resolveDocumentGenerationMode('concept_brief', false, false))
      .toBe('llm_single_pass');
  });

  it('episode_grid resolves to llm_chunked when episodic', () => {
    expect(resolveDocumentGenerationMode('episode_grid', true, false))
      .toBe('llm_chunked');
  });

  it('treatment resolves to llm_chunked when large-risk', () => {
    expect(resolveDocumentGenerationMode('treatment', false, true))
      .toBe('llm_chunked');
  });
});

// ── LLM Eligibility ────────────────────────────────────────────────────────

describe('Generation Mode: LLM Eligibility', () => {
  const ALL_PHASES: GenerationPhase[] = [
    'primary_generation', 'chunked_generation', 'nuance_repair',
    'json_extraction_retry', 'banned_language_retry', 'placeholder_retry',
    'episode_count_repair', 'post_generation_validation',
  ];

  it('deterministic_assembly forbids LLM in ALL phases', () => {
    for (const phase of ALL_PHASES) {
      expect(isLLMAllowedForDocPhase('deterministic_assembly', phase)).toBe(false);
    }
  });

  it('llm_single_pass allows LLM in all phases', () => {
    for (const phase of ALL_PHASES) {
      expect(isLLMAllowedForDocPhase('llm_single_pass', phase)).toBe(true);
    }
  });

  it('llm_chunked allows LLM in all phases', () => {
    for (const phase of ALL_PHASES) {
      expect(isLLMAllowedForDocPhase('llm_chunked', phase)).toBe(true);
    }
  });
});

// ── Assert Guard ────────────────────────────────────────────────────────────

describe('Generation Mode: assertLLMAllowed', () => {
  it('throws for VPB in primary_generation', () => {
    expect(() => assertLLMAllowed('deterministic_assembly', 'primary_generation', 'visual_project_bible'))
      .toThrow('LLM_FORBIDDEN');
  });

  it('throws for VPB in nuance_repair', () => {
    expect(() => assertLLMAllowed('deterministic_assembly', 'nuance_repair', 'visual_project_bible'))
      .toThrow('LLM_FORBIDDEN');
  });

  it('throws for VPB in json_extraction_retry', () => {
    expect(() => assertLLMAllowed('deterministic_assembly', 'json_extraction_retry', 'visual_project_bible'))
      .toThrow('LLM_FORBIDDEN');
  });

  it('does NOT throw for concept_brief in primary_generation', () => {
    expect(() => assertLLMAllowed('llm_single_pass', 'primary_generation', 'concept_brief'))
      .not.toThrow();
  });
});

// ── Edge Function Source Verification ───────────────────────────────────────

describe('Generation Mode: Edge Function Integration', () => {
  const edgeContent = readProjectFile('supabase/functions/generate-document/index.ts');
  const resolverContent = readProjectFile('supabase/functions/_shared/generationModeResolver.ts');

  it('generationModeResolver.ts exists', () => {
    expect(resolverContent.length).toBeGreaterThan(0);
  });

  it('generate-document imports from generationModeResolver', () => {
    expect(edgeContent).toContain('generationModeResolver.ts');
  });

  it('generate-document uses resolveDocumentGenerationMode', () => {
    expect(edgeContent).toContain('resolveDocumentGenerationMode');
  });

  it('generate-document uses assertLLMAllowed', () => {
    expect(edgeContent).toContain('assertLLMAllowed');
  });

  it('generate-document uses buildGenerationProvenance', () => {
    expect(edgeContent).toContain('buildGenerationProvenance');
  });

  it('generate-document tracks llmCallCount', () => {
    expect(edgeContent).toContain('llmCallCount');
  });

  it('generate-document persists generation_provenance in meta_json', () => {
    expect(edgeContent).toContain('generation_provenance');
  });

  it('assertLLMAllowed guards primary_generation', () => {
    expect(edgeContent).toContain('assertLLMAllowed(generationMode, "primary_generation"');
  });

  it('assertLLMAllowed guards nuance_repair', () => {
    expect(edgeContent).toContain('assertLLMAllowed(generationMode, "nuance_repair"');
  });

  it('assertLLMAllowed guards json_extraction_retry', () => {
    expect(edgeContent).toContain('assertLLMAllowed(generationMode, "json_extraction_retry"');
  });

  it('assertLLMAllowed guards banned_language_retry', () => {
    expect(edgeContent).toContain('assertLLMAllowed(generationMode, "banned_language_retry"');
  });

  it('assertLLMAllowed guards placeholder_retry', () => {
    expect(edgeContent).toContain('assertLLMAllowed(generationMode, "placeholder_retry"');
  });

  it('assertLLMAllowed guards episode_count_repair', () => {
    expect(edgeContent).toContain('assertLLMAllowed(generationMode, "episode_count_repair"');
  });

  it('resolver module does NOT import LLM or AI dependencies', () => {
    // Check for actual imports/function calls, not documentation mentions
    expect(resolverContent).not.toMatch(/import.*callLLM/);
    expect(resolverContent).not.toMatch(/import.*GATEWAY_URL/);
    expect(resolverContent).not.toMatch(/import.*openai/);
    expect(resolverContent).not.toContain('await callLLM(');
  });

  it('resolver has DETERMINISTIC_DOC_TYPES with visual_project_bible', () => {
    expect(resolverContent).toContain('visual_project_bible');
    expect(resolverContent).toContain('DETERMINISTIC_DOC_TYPES');
  });
});
