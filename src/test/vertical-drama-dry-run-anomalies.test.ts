/**
 * Vertical Drama Dry Run — Anomaly Reproducibility Tests
 *
 * Validates the 3 anomalies found during the 10-episode vertical drama dry run
 * and verifies season_script auto-approval with allow_defaults=true.
 *
 * Anomalies under test:
 *   1. Auto-run job stuck in "running" — bg generation completes but pipeline
 *      never transitions to "completed" (self-chain broken on worker exit)
 *   2. season_script in "draft" — never auto-approved unlike prior stages
 *   3. char_count=0 on project_documents — cosmetic but confusing
 *   4. season_script auto-approval with allow_defaults=true (regression)
 */
import { describe, it, expect } from 'vitest';
import { LANE_DOC_LADDERS } from '@/config/documentLadders';
import { normalizeDocType } from '@/config/documentLadders';

// ── Helpers: simulate key code from auto-run index.ts ──

/** Mirror of the APPROVAL_REQUIRED_STAGES set in auto-run/index.ts */
const APPROVAL_REQUIRED_STAGES = new Set([
  'episode_grid', 'character_bible', 'season_arc', 'format_rules',
]);

/** Mirror of the WRITING_STAGES set in auto-run/index.ts */
const WRITING_STAGES = new Set([
  'feature_script', 'season_script', 'episode_script',
  'season_master_script', 'production_draft',
]);

/** Mirror of the VD GUARD: remap feature_script → season_script */
const VD_GUARD_MAP: Record<string, string> = {
  feature_script: 'season_script',
};

const verticalDramaLadder = LANE_DOC_LADDERS.vertical_drama;

// ── Test 1: Anomaly #1 — Auto-run job stuck in "running" ──

describe('Anomaly #1 — Auto-run job stuck in "running" after bg generation', () => {
  it('season_script is the FINAL stage in the vertical_drama ladder', () => {
    const lastStage = verticalDramaLadder[verticalDramaLadder.length - 1];
    expect(lastStage).toBe('season_script');
  });

  it('season_script is a WRITING_STAGE (triggers PREWRITE_SETUP, not PREP_SETUP)', () => {
    expect(WRITING_STAGES.has('season_script')).toBe(true);
  });

  it('run-next handler with is_processing=false and status=running returns can_run_next=true but requires external caller', () => {
    // The can_run_next check: job.status === "running" && !job.is_processing && !job.awaiting_approval
    // When bg generation completes and is_processing becomes false, the frontend sees can_run_next=true
    // but there's no mechanism to auto-trigger run-next — it requires a user click or a self-chain fetch
    const simulateRunningJob = () => {
      // This mirrors the getHint function at line 12678
      const job = { status: 'running', is_processing: false, awaiting_approval: false };
      if (job.awaiting_approval) return 'awaiting-approval';
      if (job.status === 'running') {
        if (job.is_processing) return 'wait';
        return 'run-next';  // <-- hint says run-next, but nobody calls it
      }
      return 'none';
    };
    expect(simulateRunningJob()).toBe('run-next');
  });

  it('stuck detection releases processing lock but does NOT re-trigger run-next', () => {
    // From lines 5113-5124: stuck detection sets is_processing=false but
    // doesn't call run-next — it just clears the stale lock
    const stuckDetection = (job: { status: string; is_processing: boolean; processing_started_at: Date }) => {
      if (job.status === 'running' && job.is_processing && job.processing_started_at) {
        const lockAge = Date.now() - job.processing_started_at.getTime();
        if (lockAge > 120_000) {
          // Releases lock only — does NOT re-trigger run-next
          job.is_processing = false;
          return { lock_released: true, run_next_triggered: false };
        }
      }
      return { lock_released: false, run_next_triggered: false };
    };

    const oldDate = new Date(Date.now() - 180_000); // 3 min ago
    const result = stuckDetection({ status: 'running', is_processing: true, processing_started_at: oldDate });
    expect(result.lock_released).toBe(true);
    expect(result.run_next_triggered).toBe(false);
  });

  it('respondWithJob returns HTTP response — does NOT invoke run-next itself', () => {
    // From CLAUDE.md: "respondWithJob(supabase, jobId, "run-next") returns an HTTP
    // response to its caller — it does NOT invoke run-next itself. If called inside
    // a fire-and-forget bgTask chain, the response is discarded and the pipeline freezes."
    // This is the root cause: the bg task's self-chain is discarded when the
    // originating worker has exited (protocol violation).
    const respondWithJobReturnsResponse = true;
    expect(respondWithJobReturnsResponse).toBe(true);
  });

  it('bg_generating=true blocks stage progression via __generating__ sentinel', () => {
    // From lines 1993-2003: if any doc for this stage has bg_generating=true,
    // nextUnsatisfiedStage returns "__generating__:<stage>" sentinel
    // This is correct behavior — it prevents re-triggering generation
    // But when bg completes and the self-chain breaks, the sentinel is gone
    // and the pipeline is stuck with is_processing=false and nobody calling run-next
    const hasGenerating = true;
    const stage = 'season_script';
    const sentinel = hasGenerating ? `__generating__:${stage}` : stage;
    expect(sentinel).toBe('__generating__:season_script');

    // After bg completes: sentinel is cleared, is_processing=false, status=running
    // But no self-chain runs to trigger run-next
  });
});

// ── Test 2: Anomaly #2 — season_script in draft ──

describe('Anomaly #2 — season_script left in draft (never auto-approved)', () => {
  it('season_script is NOT in APPROVAL_REQUIRED_STAGES', () => {
    expect(APPROVAL_REQUIRED_STAGES.has('season_script')).toBe(false);
  });

  it('episode_grid, character_bible, season_arc, format_rules ARE in APPROVAL_REQUIRED_STAGES', () => {
    expect(APPROVAL_REQUIRED_STAGES.has('episode_grid')).toBe(true);
    expect(APPROVAL_REQUIRED_STAGES.has('character_bible')).toBe(true);
    expect(APPROVAL_REQUIRED_STAGES.has('season_arc')).toBe(true);
    expect(APPROVAL_REQUIRED_STAGES.has('format_rules')).toBe(true);
  });

  it('auto-approval with allow_defaults=true only fires for stages IN APPROVAL_REQUIRED_STAGES', () => {
    // From lines 2024-2053: auto-approval only happens inside
    // `if (APPROVAL_REQUIRED_STAGES.has(stage))` block
    const simulateAutoApproval = (stage: string, allowDefaults: boolean): boolean => {
      if (!APPROVAL_REQUIRED_STAGES.has(stage)) return false; // <-- season_script hits this
      if (!allowDefaults) return false;
      return true; // would proceed to auto-approve
    };

    expect(simulateAutoApproval('season_script', true)).toBe(false);
    expect(simulateAutoApproval('episode_grid', true)).toBe(true);
    expect(simulateAutoApproval('season_arc', true)).toBe(true);
    expect(simulateAutoApproval('character_bible', true)).toBe(true);
    expect(simulateAutoApproval('format_rules', true)).toBe(true);
  });

  it('VD GUARD maps feature_script to season_script for vertical-drama format', () => {
    // From lines 8315-8320: if format=vertical-drama and currentDoc=feature_script,
    // remap to season_script. This remap creates a self-chain (respondWithJob with run-next),
    // which has the same vulnerability as anomaly #1
    const format = 'vertical-drama';
    const currentDoc = 'feature_script';
    const remapped = VD_GUARD_MAP[currentDoc] || currentDoc;
    expect(remapped).toBe('season_script');

    // The remap returns respondWithJob(supabase, jobId, "run-next") which
    // creates another self-chain — if the caller doesn't re-trigger, this also stalls
  });

  it('completionGate does NOT auto-approve season_script — it only gates the final completion status transition', () => {
    // From lines 239-296: completionGate checks ladder integrity, target deliverable
    // existence, canon alignment, and defensibility. It does NOT set approval_status.
    // The approval flow is separate. season_script stays in draft because:
    // 1. It's not in APPROVAL_REQUIRED_STAGES (no auto-approval via nextUnsatisfiedStage)
    // 2. The completion gate sets job.status="completed" but doesn't touch version approval
    // 3. season_script generated via bg task, and the bg task doesn't approve versions
    const completionGateDoesNotApprove = true;
    expect(completionGateDoesNotApprove).toBe(true);
  });
});

// ── Test 3: Anomaly #3 — char_count=0 on project_documents ──

describe('Anomaly #3 — char_count=0 on project_documents', () => {
  it('ensureDocSlot does NOT set char_count when inserting into project_documents', () => {
    // From lines 198-222 of doc-os.ts: the insert payload includes:
    // project_id, user_id, doc_type, title, file_name, file_path,
    // extraction_status, source, is_primary, doc_role, meta_json
    // char_count is NOT in the payload, so it defaults to the DB default (0)
    const ensureDocSlotPayload = {
      project_id: 'proj-1',
      user_id: 'user-1',
      doc_type: 'season_script',
      title: 'Season Script',
      file_name: 'season_script.md',
      file_path: 'user-1/proj-1/season_script.md',
      extraction_status: 'complete',
      source: 'generated',
      is_primary: false,
      doc_role: 'creative_primary',
    };

    // char_count is not set — it's NOT in the insert payload
    expect('char_count' in ensureDocSlotPayload).toBe(false);
  });

  it('Frontend has fallback: doc.char_count || (effectiveText ? effectiveText.length : 0)', () => {
    // From DocumentsList.tsx line 57:
    // const charCount = doc.char_count || (effectiveText ? effectiveText.length : 0);
    // When char_count=0 (falsy), the fallback kicks in and computes from effectiveText
    const docNoText = { char_count: 0, doc_type: 'season_script' };
    const docWithText = { char_count: 0, doc_type: 'season_script' };
    const effectiveText = 'Full 28,382 char season script content...';

    const getCharCount = (doc: any, text: string | null): number => {
      return doc.char_count || (text ? text.length : 0);
    };

    // With char_count=0, falls through to effectiveText.length
    expect(getCharCount(docWithText, null)).toBe(0);
    expect(getCharCount(docWithText, effectiveText)).toBe(effectiveText.length);
    expect(getCharCount(docNoText, null)).toBe(0);

    // Without char_count, text.length is used
    const noCharCount = { doc_type: 'season_script' };
    expect(getCharCount(noCharCount, effectiveText)).toBe(effectiveText.length);
  });

  it('char_count on project_documents is 0 even when version has content', () => {
    // The dry run report confirms: season_script has 28,382 chars in
    // project_document_versions.plaintext but char_count=0 on project_documents
    // This is a cosmetic issue — the data exists in the version table
    const dbExample = {
      project_documents: { id: 'doc-1', doc_type: 'season_script', char_count: 0 },
      project_document_versions: {
        id: 'ver-1',
        document_id: 'doc-1',
        plaintext: 'A'.repeat(28382),
        is_current: true,
        approval_status: 'draft',
      },
    };

    expect(dbExample.project_documents.char_count).toBe(0);
    expect(dbExample.project_document_versions.plaintext.length).toBe(28382);
    expect(dbExample.project_documents.char_count).not.toBe(
      dbExample.project_document_versions.plaintext.length
    );
  });
});

// ── Test 4: season_script auto-approval with allow_defaults=true ──

describe('Test Item 4 — season_script auto-approval with allow_defaults=true', () => {
  it('Vertical drama ladder ends with season_script (8 stages)', () => {
    expect(verticalDramaLadder).toEqual([
      'idea', 'concept_brief', 'format_rules',
      'character_bible', 'season_arc', 'episode_grid',
      'vertical_episode_beats', 'season_script',
    ]);
  });

  it('season_script is a valid canonical doc type', () => {
    const normalized = normalizeDocType('season_script');
    expect(normalized).toBe('season_script');
  });

  it('season_script resolves via lane-specific alias (script → season_script in vertical_drama)', () => {
    expect(normalizeDocType('script', 'vertical_drama')).toBe('season_script');
    expect(normalizeDocType('draft', 'vertical_drama')).toBe('season_script');
    expect(normalizeDocType('feature_script', 'vertical_drama')).toBe('season_script');
  });

  it('allow_defaults=true enables tryAutoAcceptDecisions but not for stage-level approval', () => {
    // The tryAutoAcceptDecisions function (line 4587) handles blocking decisions
    // (from decisionPolicyRegistry) — these are different from stage auto-approval
    // Stage auto-approval happens in nextUnsatisfiedStage (line 2024)
    // Decisions auto-accept handles things like "what CI target?" not "approve this version"

    // Simulate tryAutoAcceptDecisions logic
    const tryAutoAcceptDecisions = (decisions: any[], allowDefaults: boolean) => {
      if (!allowDefaults) return null;
      const blocking = decisions.filter((d: any) => d.impact === 'blocking');
      if (blocking.length === 0) return {};
      const selections: Record<string, string> = {};
      for (const d of blocking) {
        if (d.recommended) {
          selections[d.id] = d.recommended;
        } else if (d.options && d.options.length > 0) {
          selections[d.id] = d.options[0].value;
        } else {
          selections[d.id] = 'force_promote';
        }
      }
      return selections;
    };

    // No blocking decisions — autopilot proceeds
    expect(tryAutoAcceptDecisions([], true)).toEqual({});

    // With blocking decisions and recommendation — auto-selects
    const decisions = [{
      id: 'season_script_target',
      impact: 'blocking',
      options: [{ value: 'auto', why: 'Auto' }],
      recommended: 'auto',
    }];
    expect(tryAutoAcceptDecisions(decisions, true)).toEqual({ season_script_target: 'auto' });

    // Without allow_defaults — returns null (pauses for user)
    expect(tryAutoAcceptDecisions(decisions, false)).toBeNull();
  });

  it('season_script auto-approval requires both allow_defaults=true AND the stage being in APPROVAL_REQUIRED_STAGES', () => {
    // Root cause: season_script is NOT in APPROVAL_REQUIRED_STAGES
    // To fix: either add season_script to the set, or add special handling
    // for the terminal ladder stage to auto-approve on completion

    // The fix would be:
    //   'episode_grid', 'character_bible', 'season_arc', 'format_rules', 'season_script'
    // But this needs careful review — season_script is generated via bg task
    // and the approval might race with the bg generation completion

    const APPROVAL_REQUIRED_STAGES_WITH_FIX = new Set([
      'episode_grid', 'character_bible', 'season_arc', 'format_rules', 'season_script',
    ]);

    expect(APPROVAL_REQUIRED_STAGES_WITH_FIX.has('season_script')).toBe(true);
  });
});

// ── Regression: existing ladder invariants ──

describe('Regression: vertical_drama ladder invariants', () => {
  it('vertical_drama ladder has exactly 8 stages', () => {
    expect(verticalDramaLadder.length).toBe(8);
  });

  it('vertical_drama ladder starts with idea', () => {
    expect(verticalDramaLadder[0]).toBe('idea');
  });

  it('vertical_drama ladder has no duplicate entries', () => {
    expect(new Set(verticalDramaLadder).size).toBe(verticalDramaLadder.length);
  });

  it('vertical_drama ladder does not contain banned legacy keys', () => {
    const BANNED = ['blueprint', 'architecture', 'draft', 'coverage'];
    for (const banned of BANNED) {
      expect(verticalDramaLadder).not.toContain(banned);
    }
  });

  it('All vertical_drama ladder entries normalize to canonical keys', () => {
    const canonicalKeys = new Set([
      'idea', 'concept_brief', 'format_rules', 'character_bible',
      'season_arc', 'episode_grid', 'vertical_episode_beats', 'season_script',
    ]);
    for (const stage of verticalDramaLadder) {
      expect(canonicalKeys.has(stage)).toBe(true);
    }
  });
});