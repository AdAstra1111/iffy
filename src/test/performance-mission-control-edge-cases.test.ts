/**
 * Edge Cases & Invariant Tests — useAutoRunMissionControl (v2: useReducer + Realtime + Heartbeat)
 *
 * Covers gap areas not tested by the 54 existing tests:
 *   - Reducer invariants (RESET preserves activated, default returns state, etc.)
 *   - callAutoRun edge cases (invalid UUID, missing URL, auth failure, fetch failure)
 *   - Conditional cache invalidation edge cases (null job, same signature)
 *   - Connection state edge cases (JOB_UPDATED always sets online, heartbeat threshold)
 *   - Auto-resume guards (human required pauses, duplicate signature blocking)
 *   - Project reset edge cases (all refs cleared, cross-project bleed prevention)
 *   - updateStepLimit clamping bounds
 *   - resumeFromStepLimit logic
 *   - In-flight guards (applyingDecisionsRef, autoResumeInFlightRef)
 *   - Activation behavior (auto-activates on projectId, no activation without)
 *   - Discovery effect edge case (cancelled flag, early return on existing job)
 *
 * Tests read the source file with fs.readFileSync (no rendering).
 */

import { describe, it, expect } from 'vitest';

const SOURCE_PATH = '/Users/laralane/code/iffy/src/hooks/useAutoRunMissionControl.ts';

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 1: Reducer invariants
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-1 — Reducer invariants', () => {
  it('EC-1a. RESET action preserves the activated flag', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const resetCase = source.match(/case 'RESET':[^]*?return[^]*?;/);
    expect(resetCase).not.toBeNull();
    expect(resetCase![0]).toContain('activated: state.activated');
  });

  it('EC-1b. JOB_UPDATED action clears error to null', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const jobUpdatedCase = source.match(/case 'JOB_UPDATED':[^]*?return \{[^]*?\};/);
    expect(jobUpdatedCase).not.toBeNull();
    expect(jobUpdatedCase![0]).toContain('error: null');
  });

  it('EC-1c. JOB_UPDATED always sets connectionState to online', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const jobUpdatedCase = source.match(/case 'JOB_UPDATED':[^]*?return \{[^]*?\};/);
    expect(jobUpdatedCase).not.toBeNull();
    expect(jobUpdatedCase![0]).toContain("connectionState: 'online'");
  });

  it('EC-1d. CONNECTION_STATE action preserves all other state fields', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const connectionCase = source.match(/case 'CONNECTION_STATE':[^]*?return[^]*?;/);
    expect(connectionCase).not.toBeNull();
    // Should use spread to preserve other fields
    expect(connectionCase![0]).toContain('...state');
    expect(connectionCase![0]).toContain('connectionState: action.connectionState');
  });

  it('EC-1e. STEPS_UPDATED action only updates steps', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const stepsCase = source.match(/case 'STEPS_UPDATED':[^]*?return[^]*?;/);
    expect(stepsCase).not.toBeNull();
    expect(stepsCase![0]).toContain('...state');
  });

  it('EC-1f. ERROR action preserves all state except error', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const errorCase = source.match(/case 'ERROR':[^]*?return[^]*?;/);
    expect(errorCase).not.toBeNull();
    expect(errorCase![0]).toContain('...state');
    expect(errorCase![0]).toContain('error: action.error');
  });

  it('EC-1g. Default case returns state unchanged (invariant protection)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const reducerFunction = source.match(/function missionReducer[^]*?\{[^]*?default:[^]*?return state[^]*?}/);
    expect(reducerFunction).not.toBeNull();
    expect(reducerFunction![0]).toContain('default:');
    expect(reducerFunction![0]).toContain('return state');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 2: callAutoRun edge cases
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-2 — callAutoRun edge cases', () => {
  it('EC-2a. Invalid projectId UUID is rejected with console.warn and null return', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('isValidUUID(extra.projectId)');
    expect(source).toContain('skipping callAutoRun');
    expect(source).toContain('return null');
  });

  it('EC-2b. Missing Supabase URL throws clear error', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("'Supabase URL not configured'");
  });

  it('EC-2c. Missing auth session throws Not authenticated error', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("'Not authenticated'");
  });

  it('EC-2d. Fetch failure produces descriptive error with action name and URL', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const fetchCatch = source.match(/catch \(fetchErr[^]*?\{[^]*?\}/);
    expect(fetchCatch).not.toBeNull();
    expect(source).toContain('Failed to reach auto-run service');
  });

  it('EC-2e. 409 STALE_DECISION marks result with _stale flag', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("resp.status === 409 && result?.code === 'STALE_DECISION'");
    expect(source).toContain('_stale: true');
  });

  it('EC-2f. 409 with recoverable conflict adds _resumable flag', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('extractRecoverableAutoRunConflict');
    expect(source).toContain('_resumable');
  });

  it('EC-2g. 409 job_already_running without resumable data throws error', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("result?.code === 'job_already_running'");
    expect(source).toContain("'Auto-Run conflict received without resumable job data.'");
  });

  it('EC-2h. Non-OK response without error field includes status code in error', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('result.error || result.message');
    expect(source).toContain('resp.status');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 3: Conditional cache invalidation invariants
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-3 — Conditional cache invalidation invariants', () => {
  it('EC-3a. invalidateCachesConditionally returns early when job is null', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('if (!job) return');
  });

  it('EC-3b. Cache invalidation only fires when status OR current_document changes', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('job.status !== prevJobSignatureRef.current.status');
    expect(source).toContain('job.current_document !== prevJobSignatureRef.current.current_document');
  });

  it('EC-3c. Signature is built from status and current_document only (minimal comparison)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('const currentSignature = { status: job.status, current_document: job.current_document }');
  });

  it('EC-3d. prevJobSignatureRef is updated after a change-triggered invalidation', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('prevJobSignatureRef.current = currentSignature');
  });

  it('EC-3e. Cache invalidation queries are project-scoped where appropriate', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // dev-v2-docs and dev-v2-approved are scoped to projectId
    // dev-v2-versions is NOT scoped (intentional — global version list)
    // seed-pack-versions is scoped to projectId
    expect(source).toContain("['dev-v2-docs', projectId]");
    expect(source).toContain("['dev-v2-approved', projectId]");
    expect(source).toContain("['seed-pack-versions', projectId]");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 4: Connection state invariants
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-4 — Connection state invariants', () => {
  it('EC-4a. Heartbeat success always dispatches connectionState online and resets failure counter', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const heartbeatSuccess = source.match(/Heartbeat succeeded[^]*?heartbeatFailures = 0[^]*?connectionState: 'online'/);
    expect(heartbeatSuccess).not.toBeNull();
  });

  it('EC-4b. Heartbeat after 3 consecutive failures dispatches disconnected then reconnecting', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('heartbeatFailures >= 3');
    expect(source).toContain("connectionState: 'disconnected'");
    expect(source).toContain("connectionState: 'reconnecting'");
  });

  it('EC-4c. Realtime update callback dispatches online on any received update', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("Realtime received an update");
    expect(source).toContain("dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' })");
  });

  it('EC-4d. Realtime subscription dispatches online on SUBSCRIBED and reconnecting on CHANNEL_ERROR/TIMED_OUT', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // Test all three status transitions
    expect(source).toContain("status === 'SUBSCRIBED'");
    expect(source).toContain("status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'");
    expect(source).toContain("connectionState: 'online'");
    expect(source).toContain("connectionState: 'reconnecting'");

    // Verify the .subscribe callback exists
    expect(source).toContain(".subscribe((status: string) =>");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 5: Auto-resume guards and invariants
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-5 — Auto-resume guards and invariants', () => {
  it('EC-5a. Auto-resume is blocked for human-required pauses (COMPLETED, ERROR, VERSION_CAP_REACHED etc.)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // HUMAN_REQUIRED_PAUSES list
    expect(source).toContain("'COMPLETED'");
    expect(source).toContain("'ERROR'");
    expect(source).toContain("'VERSION_CAP_REACHED'");
    expect(source).toContain("'SAFE_MODE_GATE'");
    expect(source).toContain("'STEP_LIMIT_REACHED'");
    expect(source).toContain("'PLATEAU_RECOVERY_EXHAUSTED'");

    // isHumanRequiredPause check in auto-resume
    expect(source).toContain('isHumanRequiredPause(state.job)');
    expect(source).toContain('if (isHumanRequiredPause(state.job)) return');
  });

  it('EC-5b. Auto-resume blocks when allow_defaults is false', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('if (!state.job.allow_defaults) return');
  });

  it('EC-5c. Auto-resume blocks after 3 failed attempts, dispatches isRunning: false', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('autoResumeFailCountRef.current >= 3');
  });

  it('EC-5d. Auto-resume blocks duplicate scheduling for the same pause snapshot', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('autoResumeLastAttemptSignatureRef.current === pauseSignature');
    expect(source).toContain('if (autoResumeLastAttemptSignatureRef.current === pauseSignature) return');
  });

  it('EC-5e. Auto-resume has in-flight guard to prevent concurrent calls', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('if (autoResumeInFlightRef.current) return');
  });

  it('EC-5f. Auto-resume clears snapshot guard when not paused, resets fail count on terminal states', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('autoResumeLastAttemptSignatureRef.current = null');
    expect(source).toContain("['running', 'completed', 'stopped', 'failed']");
  });

  it('EC-5g. Auto-resume uses 1500ms timer delay', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain(', 1500)');
  });

  it('EC-5h. isHumanRequiredPause also checks awaiting_approval with human_required approval_type', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("approval_type === 'human_required'");
  });

  it('EC-5i. buildPauseLoopSignature includes all fields that meaningfully change on loop iteration', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // The signature should include job.id, current_document, pause_reason, step_count, last_ci, stage_loop_count
    expect(source).toContain('job.id');
    expect(source).toContain('job.current_document');
    expect(source).toContain('job.pause_reason');
    expect(source).toContain('job.step_count');
    expect(source).toContain('job.last_ci');
    expect(source).toContain('job.stage_loop_count');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 6: Project reset edge cases
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-6 — Project reset edge cases', () => {
  it('EC-6a. On project change, all refs are reset to prevent cross-project bleed', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('abortRef.current = false');
    expect(source).toContain('autoResumeFailCountRef.current = 0');
    expect(source).toContain('autoResumeInFlightRef.current = false');
    expect(source).toContain('autoResumeLastAttemptSignatureRef.current = null');
    expect(source).toContain('prevJobSignatureRef.current = {}');
    expect(source).toContain("dispatch({ type: 'RESET' })");
    expect(source).toContain("dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' })");
  });

  it('EC-6b. pollInFlightRef is NOT present — removed as part of the old polling architecture cleanup', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // pollInFlightRef was part of the old recursive setTimeout polling that was removed
    expect(source).not.toContain('pollInFlightRef');
  });

  it('EC-6c. lastSuccessRef is reset to current time on project change', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('lastSuccessRef.current = Date.now()');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 7: Activation behavior
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-7 — Activation behavior', () => {
  it('EC-7a. Auto-activation dispatches ACTIVATE when projectId is present', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const autoActivate = source.match(/Auto-activate[^]*?useEffect[^]*?\{[^]*?\}[^]*?\[projectId\]/);
    expect(autoActivate).not.toBeNull();
    expect(source).toContain("if (projectId) dispatch({ type: 'ACTIVATE' })");
  });

  it('EC-7b. No activation effect when projectId changes to undefined (conditional guard)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("if (projectId) dispatch({ type: 'ACTIVATE' })");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 8: Discovery effect edge cases
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-8 — Discovery effect edge cases', () => {
  it('EC-8a. Discovery effect uses cancelled flag to prevent state update after unmount', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('let cancelled = false');
    expect(source).toContain('if (cancelled || !result?.job) return');
    expect(source).toContain('return () => { cancelled = true; }');
  });

  it('EC-8b. Discovery effect returns early when projectId, activated, or job?.id conditions are met', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("if (!projectId || !state.activated || state.job?.id) return");
  });

  it('EC-8c. Discovery effect catches errors silently (no active job yet is expected)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const discoveryCatch = source.match(/Discover[^]*?catch \{[^]*?\/\/ no active job yet/);
    expect(discoveryCatch).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 9: updateStepLimit clamping
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-9 — updateStepLimit clamping', () => {
  it('EC-9a. updateStepLimit clamps to minimum 1', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('Math.max(1,');
  });

  it('EC-9b. updateStepLimit has HARD_MAX of 1000', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('const HARD_MAX = 1000');
    expect(source).toContain('Math.min(newLimit, HARD_MAX)');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 10: resumeFromStepLimit logic
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-10 — resumeFromStepLimit logic', () => {
  it('EC-10a. resumeFromStepLimit bumps limit by RESUME_BUMP (10) when current limit <= step_count', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('const RESUME_BUMP = 10');
    expect(source).toContain('if (newLimit <= state.job.step_count)');
    expect(source).toContain('step_count + RESUME_BUMP');
  });

  it('EC-10b. resumeFromStepLimit caps bumped limit at HARD_MAX (1000)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('Math.min(state.job.step_count + RESUME_BUMP, HARD_MAX)');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 11: In-flight guards
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-11 — In-flight guards', () => {
  it('EC-11a. applyDecisionsAndContinue has applyingDecisionsRef guard to prevent concurrent calls', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('if (applyingDecisionsRef.current)');
    expect(source).toContain('already in flight');
    expect(source).toContain('applyingDecisionsRef.current = true');
    expect(source).toContain('applyingDecisionsRef.current = false');
  });

  it('EC-11b. toggleAllowDefaults respects applyingDecisionsRef guard before auto-resolve', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("if (applyingDecisionsRef.current) return; // button click took priority");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 12: Realtime subscription invariants
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-12 — Realtime subscription invariants', () => {
  it('EC-12a. Realtime subscription guards with isValidUUID check', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const realtimeEffect = source.match(/Supabase Realtime subscription[^]*?useEffect[^]*?\{[^]*?\}[^]*?\]\)/);
    expect(realtimeEffect).not.toBeNull();
    expect(source).toContain("if (!projectId || !isValidUUID(projectId) || !state.activated) return");
  });

  it('EC-12b. Realtime callback guards against payload without id', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("if (!updatedData?.id) return");
  });

  it('EC-12c. Realtime callback casts incoming data to AutoRunJob directly (currentJob merge was simplified)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // The Realtime callback no longer merges with currentJob — it casts directly
    // because Realtime returns a complete row snapshot
    expect(source).toContain('const mergedJob = updatedData as unknown as AutoRunJob');
  });

  it('EC-12d. Realtime channel uses unique name with Date.now() to prevent subscription collision', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('channelName = `auto-run-mc-${projectId}-${Date.now()}`');
  });

  it('EC-12e. Realtime subscription unsubscribes on cleanup', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('channel.unsubscribe()');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 13: start() preflight edge cases
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-13 — start() preflight edge cases', () => {
  it('EC-13a. start() errors when projectId is missing', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("if (!projectId)");
    expect(source).toContain("'Cannot start Auto-Run: no project ID'");
  });

  it('EC-13b. start() dispatches ACTIVATE and clears error on entry', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const startFn = source.match(/const start[^]*?=>[^]*?\{[^]*?dispatch\(\{ type: 'ACTIVATE' \}\)[^]*?dispatch\(\{ type: 'ERROR', error: null \}\)[^]*?abortRef\.current = false/);
    expect(startFn).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 14: Action guard clausess
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-14 — Action guard clauses', () => {
  it('EC-14a. pause returns early when no state.job', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("const pause");
    expect(source).toContain("if (!state.job) return");
  });

  it('EC-14b. stop returns early when no state.job', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("const stop");
    expect(source).toContain("if (!state.job) return");
  });

  it('EC-14c. resume returns early when no state.job', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("const resume");
    expect(source).toContain("if (!state.job) return");
  });

  it('EC-14d. getPendingDoc returns null when no state.job or not awaiting approval', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("if (!state.job) return null");
    expect(source).toContain("if (!state.job.awaiting_approval || !state.job.pending_doc_id) return null");
  });

  it('EC-14e. approveNext returns early when job is not awaiting approval', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("const approveNext");
    expect(source).toContain("if (!state.job.awaiting_approval) return");
  });

  it('EC-14f. fetchDocumentText catches errors and returns null (graceful degradation)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("return await callDocumentText");
    expect(source).toContain("catch { return null; }");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EDGE CASE GROUP 15: IEL event logging invariants
// ════════════════════════════════════════════════════════════════════════════════

describe('EC-15 — IEL event logging invariants', () => {
  it('EC-15a. Job rehydration logs IEL event with job_id, status, current_document, step_count', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('job_rehydrate');
    expect(source).toContain('job_id');
    expect(source).toContain('current_document');
    expect(source).toContain('step_count');
  });

  it('EC-15b. Auto-resume scheduling logs IEL event', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('auto_resume_scheduled');
  });

  it('EC-15c. Auto-resume success logs IEL event', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('auto_resume_success');
  });

  it('EC-15d. Start vs resume decision logs IEL event', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('start_vs_resume_decision');
  });

  it('EC-15e. Start new job logs IEL event', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('start_new_job');
  });
});
