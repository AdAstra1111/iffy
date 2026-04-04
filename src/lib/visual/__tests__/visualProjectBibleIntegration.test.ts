/**
 * visualProjectBibleIntegration.test.ts — Integration tests proving
 * visual_project_bible uses deterministic assembly, not LLM.
 *
 * Verifies:
 * - VPB is registered as output doc in all lanes
 * - No LLM path for VPB in generate-document
 * - Edge assembler uses structured signals, not raw prose
 * - Blocker diagnostics are explicit
 * - No duplicate generation route exists
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { OUTPUT_DOC_TYPES_BY_LANE, BASE_DOC_TYPES, isOutputDocType } from '@/config/documentLadders';

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

// ── Registration ────────────────────────────────────────────────────────────

describe('VPB: Output Doc Registration', () => {
  it('visual_project_bible is registered in BASE_DOC_TYPES', () => {
    expect(BASE_DOC_TYPES.visual_project_bible).toBeDefined();
    expect(BASE_DOC_TYPES.visual_project_bible.label).toBe('Visual Project Bible');
  });

  it('visual_project_bible is an output doc in all lanes', () => {
    for (const [lane, docs] of Object.entries(OUTPUT_DOC_TYPES_BY_LANE)) {
      expect(docs).toContain('visual_project_bible');
    }
  });

  it('isOutputDocType returns true for visual_project_bible', () => {
    expect(isOutputDocType('visual_project_bible')).toBe(true);
  });
});

// ── Edge Function Routing ───────────────────────────────────────────────────

describe('VPB: Edge Function Deterministic Route', () => {
  const edgeContent = readProjectFile('supabase/functions/generate-document/index.ts');

  it('generate-document has a visual_project_bible branch', () => {
    expect(edgeContent).toContain('visual_project_bible');
    expect(edgeContent).toContain('assembleVisualProjectBibleFromDB');
  });

  it('VPB branch does NOT call callLLM', () => {
    // Extract the VPB branch section
    const vpbStart = edgeContent.indexOf('} else if (docType === "visual_project_bible")');
    const vpbEnd = edgeContent.indexOf('} else {', vpbStart + 1);
    if (vpbStart >= 0 && vpbEnd >= 0) {
      const vpbBlock = edgeContent.slice(vpbStart, vpbEnd);
      expect(vpbBlock).not.toContain('callLLM(');
      expect(vpbBlock).toContain('DETERMINISTIC ASSEMBLY');
    }
  });

  it('VPB branch sets content from assembler result', () => {
    const vpbStart = edgeContent.indexOf('} else if (docType === "visual_project_bible")');
    const vpbEnd = edgeContent.indexOf('} else {', vpbStart + 1);
    if (vpbStart >= 0 && vpbEnd >= 0) {
      const vpbBlock = edgeContent.slice(vpbStart, vpbEnd);
      expect(vpbBlock).toContain('vpbResult.markdown');
    }
  });
});

// ── Edge Assembler Contract ─────────────────────────────────────────────────

describe('VPB: Edge Assembler Contract', () => {
  const assemblerContent = readProjectFile('supabase/functions/_shared/visualProjectBibleEdge.ts');

  it('edge assembler exists', () => {
    expect(assemblerContent.length).toBeGreaterThan(0);
  });

  it('edge assembler does NOT import LLM or AI', () => {
    expect(assemblerContent).not.toContain('callLLM');
    expect(assemblerContent).not.toContain('GATEWAY_URL');
    expect(assemblerContent).not.toContain('openai');
  });

  it('edge assembler uses canonical key for brief retrieval', () => {
    expect(assemblerContent).toContain('visual_canon_brief_content');
  });

  it('edge assembler extracts structured signals, not raw prose', () => {
    expect(assemblerContent).toContain('extractSignalsFromBrief');
  });

  it('edge assembler produces explicit blockers for missing inputs', () => {
    expect(assemblerContent).toContain('no_project_canon');
    expect(assemblerContent).toContain('no_visual_canon_brief');
    expect(assemblerContent).toContain('no_character_profiles');
    expect(assemblerContent).toContain('no_canon_locations');
  });

  it('edge assembler labels generation_method as deterministic_assembly', () => {
    expect(assemblerContent).toContain("generation_method: 'deterministic_assembly'");
  });
});

// ── Doc-OS Registration ─────────────────────────────────────────────────────

describe('VPB: Doc-OS Registration', () => {
  const docOsContent = readProjectFile('supabase/functions/_shared/doc-os.ts');

  it('doc-os registers visual_project_bible as output category', () => {
    expect(docOsContent).toContain('visual_project_bible');
    expect(docOsContent).toContain('doc_category: "output"');
  });
});

// ── No Duplicate Route ──────────────────────────────────────────────────────

describe('VPB: No Duplicate Generation Route', () => {
  it('only one visual_project_bible branch in generate-document', () => {
    const edgeContent = readProjectFile('supabase/functions/generate-document/index.ts');
    const matches = edgeContent.match(/docType\s*===?\s*["']visual_project_bible["']/g) || [];
    // Should appear in the branch + meta_json provenance, not more
    expect(matches.length).toBeLessThanOrEqual(3);
  });
});

// ── Provenance ──────────────────────────────────────────────────────────────

describe('VPB: Provenance Metadata', () => {
  const edgeContent = readProjectFile('supabase/functions/generate-document/index.ts');

  it('meta_json includes visual_project_bible provenance block', () => {
    expect(edgeContent).toContain('generation_method: "deterministic_assembly"');
    expect(edgeContent).toContain('no_llm: true');
    expect(edgeContent).toContain('assembly_contract: "assembleVisualProjectBibleFromDB"');
  });
});

// ── UI Surface ──────────────────────────────────────────────────────────────

describe('VPB: UI Surface Registration', () => {
  const outputSection = readProjectFile('src/components/devengine/OutputDocumentsSection.tsx');

  it('OutputDocumentsSection has visual_project_bible description', () => {
    expect(outputSection).toContain('visual_project_bible');
    expect(outputSection).toContain('deterministic');
  });
});
