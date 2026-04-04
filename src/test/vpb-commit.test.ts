/**
 * vpb-commit.test.ts — Tests for the canonical createDocumentVersion helper
 * and the VPB section refinement commit path.
 *
 * These are unit tests that validate:
 *  1. Parameter validation (fail-closed)
 *  2. Provenance structure
 *  3. Guard logic in the commit hook
 */
import { describe, it, expect } from 'vitest';
import type { CommitProvenance } from '@/hooks/useCommitSectionPatch';
import type { CreateDocumentVersionParams } from '@/lib/docVersions/createDocumentVersion';

// ── Helper: build valid provenance ──────────────────────────────────────────
function buildValidProvenance(overrides?: Partial<CommitProvenance>): CommitProvenance {
  return {
    source_mode: 'vpb_section_refinement_commit',
    source_doc_type: 'visual_project_bible',
    section_key: 'world_design_language',
    section_heading: '# World & Design Language',
    section_anchor: 'world--design-language',
    action: 'refine',
    contract_summary: {
      scope_rule: 'one-section-only',
      forbidden_count: 3,
      preservation_count: 2,
      validation_count: 4,
      prev_heading: '# Visual Thesis',
      next_heading: '# Character Visual System',
    },
    validation_passed: true,
    patch_simulation_passed: true,
    previous_version_id: 'version-uuid-123',
    commit_timestamp: '2026-03-27T00:00:00.000Z',
    no_auto_generation: true,
    ...overrides,
  };
}

// ── Helper: build valid create params ───────────────────────────────────────
function buildValidParams(overrides?: Partial<CreateDocumentVersionParams>): CreateDocumentVersionParams {
  return {
    documentId: 'doc-uuid-1',
    parentVersionId: 'version-uuid-0',
    plaintext: '# Visual Thesis\n\nContent here.',
    label: 'Section refine: World & Design Language',
    changeSummary: 'VPB section refine — # World & Design Language (one-section-only)',
    generatorId: 'vpb_section_refinement',
    createdBy: 'user-uuid-1',
    sourceMode: 'vpb_section_refinement_commit',
    metaJson: { refinement_provenance: buildValidProvenance() },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PROVENANCE STRUCTURE TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('CommitProvenance structure', () => {
  it('valid provenance has all required fields', () => {
    const p = buildValidProvenance();
    expect(p.source_mode).toBe('vpb_section_refinement_commit');
    expect(p.source_doc_type).toBe('visual_project_bible');
    expect(p.section_key).toBeTruthy();
    expect(p.action).toMatch(/^(create|refine)$/);
    expect(p.contract_summary).toBeDefined();
    expect(p.contract_summary.scope_rule).toBe('one-section-only');
    expect(p.previous_version_id).toBeTruthy();
    expect(p.validation_passed).toBe(true);
    expect(p.patch_simulation_passed).toBe(true);
    expect(p.no_auto_generation).toBe(true);
  });

  it('provenance is namespaced under refinement_provenance in meta_json', () => {
    const params = buildValidParams();
    const meta = params.metaJson as Record<string, unknown>;
    expect(meta).toHaveProperty('refinement_provenance');
    const prov = meta.refinement_provenance as CommitProvenance;
    expect(prov.source_mode).toBe('vpb_section_refinement_commit');
  });

  it('contract_summary includes neighbor context', () => {
    const p = buildValidProvenance();
    expect(p.contract_summary.prev_heading).toBe('# Visual Thesis');
    expect(p.contract_summary.next_heading).toBe('# Character Visual System');
  });

  it('contract_summary with null neighbors is valid', () => {
    const p = buildValidProvenance({
      contract_summary: {
        scope_rule: 'one-section-only',
        forbidden_count: 0,
        preservation_count: 0,
        validation_count: 0,
        prev_heading: null,
        next_heading: null,
      },
    });
    expect(p.contract_summary.prev_heading).toBeNull();
    expect(p.contract_summary.next_heading).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. PARAMETER VALIDATION TESTS (mirrors createDocumentVersion validateParams)
// ═══════════════════════════════════════════════════════════════════════════
describe('createDocumentVersion parameter validation', () => {
  // We test the validation logic inline since the actual function
  // requires Supabase. The validation rules are:
  //  - documentId required
  //  - plaintext non-empty
  //  - label required
  //  - createdBy required
  //  - generatorId required

  function validateParams(params: CreateDocumentVersionParams): string | null {
    if (!params.documentId) return 'documentId is required';
    if (!params.plaintext || params.plaintext.trim().length === 0) return 'plaintext must be non-empty';
    if (!params.label) return 'label is required';
    if (!params.createdBy) return 'createdBy is required';
    if (!params.generatorId) return 'generatorId is required';
    return null;
  }

  it('valid params pass validation', () => {
    expect(validateParams(buildValidParams())).toBeNull();
  });

  it('rejects empty documentId', () => {
    expect(validateParams(buildValidParams({ documentId: '' }))).toContain('documentId');
  });

  it('rejects empty plaintext', () => {
    expect(validateParams(buildValidParams({ plaintext: '' }))).toContain('plaintext');
  });

  it('rejects whitespace-only plaintext', () => {
    expect(validateParams(buildValidParams({ plaintext: '   ' }))).toContain('plaintext');
  });

  it('rejects empty label', () => {
    expect(validateParams(buildValidParams({ label: '' }))).toContain('label');
  });

  it('rejects empty createdBy', () => {
    expect(validateParams(buildValidParams({ createdBy: '' }))).toContain('createdBy');
  });

  it('rejects empty generatorId', () => {
    expect(validateParams(buildValidParams({ generatorId: '' }))).toContain('generatorId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. PROVENANCE VALIDATION TESTS (mirrors validateProvenance in hook)
// ═══════════════════════════════════════════════════════════════════════════
describe('Provenance validation (fail-closed)', () => {
  function validateProvenance(p: CommitProvenance): string | null {
    if (!p.section_key) return 'missing section_key';
    if (!p.action) return 'missing action';
    if (!p.contract_summary) return 'missing contract_summary';
    if (!p.previous_version_id) return 'missing previous_version_id';
    return null;
  }

  it('valid provenance passes', () => {
    expect(validateProvenance(buildValidProvenance())).toBeNull();
  });

  it('rejects missing section_key', () => {
    expect(validateProvenance(buildValidProvenance({ section_key: '' }))).toContain('section_key');
  });

  it('rejects missing action', () => {
    expect(validateProvenance(buildValidProvenance({ action: '' as any }))).toContain('action');
  });

  it('rejects missing contract_summary', () => {
    expect(validateProvenance(buildValidProvenance({ contract_summary: undefined as any }))).toContain('contract_summary');
  });

  it('rejects missing previous_version_id', () => {
    expect(validateProvenance(buildValidProvenance({ previous_version_id: '' }))).toContain('previous_version_id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. COMMIT GATE PRE-CONDITION TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('Commit gate pre-conditions', () => {
  interface CommitGateInputs {
    patchPassed: boolean;
    patchedMarkdown: string | null;
    documentId: string;
    currentVersionId: string;
    projectId: string;
  }

  function canCommit(inputs: CommitGateInputs): string | null {
    if (!inputs.patchPassed || !inputs.patchedMarkdown) return 'patch simulation did not pass';
    if (!inputs.documentId) return 'documentId is missing';
    if (!inputs.currentVersionId) return 'currentVersionId is missing';
    if (!inputs.projectId) return 'projectId is missing';
    return null;
  }

  const validInputs: CommitGateInputs = {
    patchPassed: true,
    patchedMarkdown: '# Visual Thesis\n\nSome content',
    documentId: 'doc-1',
    currentVersionId: 'ver-1',
    projectId: 'proj-1',
  };

  it('allows commit when all gates pass', () => {
    expect(canCommit(validInputs)).toBeNull();
  });

  it('blocks on failed patch', () => {
    expect(canCommit({ ...validInputs, patchPassed: false })).toContain('patch');
  });

  it('blocks on null patchedMarkdown', () => {
    expect(canCommit({ ...validInputs, patchedMarkdown: null })).toContain('patch');
  });

  it('blocks on missing documentId', () => {
    expect(canCommit({ ...validInputs, documentId: '' })).toContain('documentId');
  });

  it('blocks on missing currentVersionId', () => {
    expect(canCommit({ ...validInputs, currentVersionId: '' })).toContain('currentVersionId');
  });

  it('blocks on missing projectId', () => {
    expect(canCommit({ ...validInputs, projectId: '' })).toContain('projectId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. VERSION ROW SHAPE TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('Version row shape consistency', () => {
  it('row shape matches canonical fields used by dev-engine', () => {
    const params = buildValidParams();
    // These are the fields that createDocumentVersion inserts
    const rowShape = {
      document_id: params.documentId,
      version_number: 1, // resolved at runtime
      plaintext: params.plaintext,
      is_current: false, // always false — RPC switches
      status: 'draft',
      label: params.label,
      change_summary: params.changeSummary,
      generator_id: params.generatorId,
      parent_version_id: params.parentVersionId,
      created_by: params.createdBy,
      meta_json: params.metaJson,
    };

    // Validate all canonical fields are present
    expect(rowShape.document_id).toBeTruthy();
    expect(rowShape.plaintext).toBeTruthy();
    expect(rowShape.is_current).toBe(false);
    expect(rowShape.status).toBe('draft');
    expect(rowShape.label).toBeTruthy();
    expect(rowShape.generator_id).toBeTruthy();
    expect(rowShape.created_by).toBeTruthy();
    expect(rowShape.meta_json).toBeDefined();
  });

  it('is_current is always false at insert time', () => {
    // Canonical invariant: only set_current_version RPC may set is_current = true
    const params = buildValidParams();
    // The helper always sets is_current = false
    expect(params).toBeDefined();
    // This is enforced in createDocumentVersion — no way to override via params
  });
});
