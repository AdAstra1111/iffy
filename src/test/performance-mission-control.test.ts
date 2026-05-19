/**
 * Architecture Tests — useAutoRunMissionControl (v2: useReducer + Realtime + Heartbeat)
 *
 * The hook was rewritten from a recursive setTimeout-based polling loop to:
 *   - useReducer (MissionState + missionReducer) replacing 6 useState calls
 *   - Supabase Realtime subscription on auto_run_jobs for live updates
 *   - 30s fallback heartbeat (setTimeout-based) during Realtime downtime
 *   - Conditional cache invalidation (prevJobSignatureRef)
 *   - Connection state managed by Realtime subscription status + heartbeat failures
 *   - Run-next nudge moved from poll loop into fallback heartbeat
 *
 * Tests read the source file with fs.readFileSync (no rendering).
 */

import { describe, it, expect } from 'vitest';

const SOURCE_PATH = '/Users/laralane/code/iffy/src/hooks/useAutoRunMissionControl.ts';

// ════════════════════════════════════════════════════════════════════════════════
// TEST 1: useReducer replaces individual useState
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 1 — useReducer replaces individual useState', () => {
  it('1a. useReducer is imported from react', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const importLine = source.match(/import \{[\s\S]*\} from 'react'/);
    expect(importLine).not.toBeNull();
    expect(importLine![0]).toContain('useReducer');
  });

  it('1b. useReducer is called with missionReducer and initialState', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('const [state, dispatch] = useReducer(missionReducer, initialState)');
  });

  it('1c. No individual useState calls remain for state fields that moved to the reducer', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // These were individual useState calls in the old architecture
    expect(source).not.toContain('setConnectionState(');
    expect(source).not.toContain("useState<ConnectionState>('online')");
    expect(source).not.toContain("useState<AutoRunJob | null>");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 2: MissionState interface exists with all fields
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 2 — MissionState interface', () => {
  it('2a. MissionState interface is defined with all required fields', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('interface MissionState');
    expect(source).toContain('job: AutoRunJob | null');
    expect(source).toContain('steps: AutoRunStep[]');
    expect(source).toContain('isRunning: boolean');
    expect(source).toContain('error: string | null');
    expect(source).toContain('activated: boolean');
    expect(source).toContain('connectionState: ConnectionState');
    expect(source).toContain('backendDiagnostic: DebugWhyBlockedResult | null');
  });

  it('2b. initialState matches the MissionState interface', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('const initialState: MissionState');
    expect(source).toContain('job: null');
    expect(source).toContain('steps: []');
    expect(source).toContain('isRunning: false');
    expect(source).toContain('error: null');
    expect(source).toContain('activated: false');
    expect(source).toContain("connectionState: 'online'");
    expect(source).toContain('backendDiagnostic: null');
  });

  it('2c. MissionAction union type exists with all action types', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("type MissionAction");
    expect(source).toContain("type: 'JOB_UPDATED'");
    expect(source).toContain("type: 'ERROR'");
    expect(source).toContain("type: 'CONNECTION_STATE'");
    expect(source).toContain("type: 'RESET'");
    expect(source).toContain("type: 'ACTIVATE'");
    expect(source).toContain("type: 'STEPS_UPDATED'");
  });

  it('2d. missionReducer function handles all action types including default', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const reducerMatch = source.match(/function missionReducer[\s\S]*?default:[\s\S]*?return state/);
    expect(reducerMatch).not.toBeNull();
  });

  it('2e. ConnectionState type is exported', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("export type ConnectionState = 'online' | 'reconnecting' | 'disconnected'");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 3: Realtime subscription on auto_run_jobs with project_id filter
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 3 — Realtime subscription on auto_run_jobs', () => {
  it('3a. Realtime subscription effect creates a channel with a project-specific name', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("const channelName = `auto-run-mc-${projectId}-${Date.now()}`");
    expect(source).toContain('const channel = supabase.channel(channelName)');
  });

  it('3b. Channel subscribes to postgres_changes UPDATE events on auto_run_jobs filtered by project_id', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("'postgres_changes'");
    expect(source).toContain("event: 'UPDATE'");
    expect(source).toContain("schema: 'public'");
    expect(source).toContain("table: 'auto_run_jobs'");
    expect(source).toContain("filter: `project_id=eq.${projectId}`");
  });

  it('3c. Realtime callback merges partial payload with existing state and dispatches JOB_UPDATED', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('const mergedJob = currentJob');
    expect(source).toContain('{ ...currentJob, ...updatedData }');
    expect(source).toContain("type: 'JOB_UPDATED'");
  });

  it('3d. Subscription callback handles SUBSCRIBED and CHANNEL_ERROR status for connection state', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain(".subscribe((status: string) => {");
    expect(source).toContain("status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'");
    expect(source).toContain("dispatch({ type: 'CONNECTION_STATE', connectionState: 'reconnecting' })");
    expect(source).toContain("status === 'SUBSCRIBED'");
    expect(source).toContain("dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' })");
  });

  it('3e. Realtime effect cleanup calls channel.unsubscribe()', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const cleanupMatch = source.match(/return\s*\(\)\s*=>\s*\{[\s\S]*?channel\.unsubscribe\(\)[\s\S]*?\}/);
    expect(cleanupMatch).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 4: 30s fallback heartbeat exists
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 4 — 30s fallback heartbeat', () => {
  it('4a. Fallback heartbeat effect uses setTimeout with 30_000ms interval', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('heartbeatTimer = setTimeout(async () => {');
    expect(source).toContain(', 30_000);');
    expect(source).toContain('scheduleHeartbeat');
  });

  it('4b. Heartbeat effect has proper cleanup with clearTimeout', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const cleanupMatch = source.match(/return\s*\(\)\s*=>\s*\{[\s\S]*?clearTimeout\(heartbeatTimer\)[\s\S]*?\}/);
    expect(cleanupMatch).not.toBeNull();
  });

  it("4c. Heartbeat calls callAutoRun('status') and updates state on success", async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("const result = await callAutoRun('status', { projectId })");
    expect(source).toContain("dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' })");
    expect(source).toContain('heartbeatFailures = 0');
  });

  it('4d. Heartbeat includes run-next nudge for running jobs that are not processing', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const nudgeSection = source.match(/Run-next nudge[\s\S]{0,100}if \(running && !result\.job\.is_processing\)[\s\S]{0,200}callAutoRun\('run-next'/);
    expect(nudgeSection).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 5: Conditional cache invalidation
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 5 — Conditional cache invalidation', () => {
  it('5a. prevJobSignatureRef is declared to track previous job state for conditional invalidation', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('const prevJobSignatureRef = useRef<{ status?: string; current_document?: string }>({})');
  });

  it('5b. invalidateCachesConditionally function compares current signature against previous', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const fnMatch = source.match(/const invalidateCachesConditionally[\s\S]*?\{[\s\S]*?\}[\s\S]*?\},/);
    expect(fnMatch).not.toBeNull();

    expect(source).toContain('const currentSignature = { status: job.status, current_document: job.current_document }');
    expect(source).toContain('job.status !== prevJobSignatureRef.current.status || job.current_document !== prevJobSignatureRef.current.current_document');
  });

  it('5c. Cache invalidation is wrapped in startTransition', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const transitionBlock = source.match(/startTransition\(\(\) => \{[\s\S]*?invalidateQueries[\s\S]*?dev-v2-docs[\s\S]*?dev-v2-versions[\s\S]*?dev-v2-approved[\s\S]*?seed-pack-versions[\s\S]*?\}\)/);
    expect(transitionBlock).not.toBeNull();
  });

  it('5d. All 4 query keys are invalidated: dev-v2-docs, dev-v2-versions, dev-v2-approved, seed-pack-versions', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const invalidateCalls = source.match(/invalidateQueries/g);
    expect(invalidateCalls).not.toBeNull();
    expect(invalidateCalls!.length).toBeGreaterThanOrEqual(4);

    expect(source).toContain("'dev-v2-docs'");
    expect(source).toContain("'dev-v2-versions'");
    expect(source).toContain("'dev-v2-approved'");
    expect(source).toContain("'seed-pack-versions'");
  });

  it('5e. prevJobSignatureRef is updated after successful invalidation', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('prevJobSignatureRef.current = currentSignature');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 6: Connection state via Realtime subscription status
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 6 — Connection state via Realtime subscription status', () => {
  it('6a. SUBSCRIBED status dispatches online connection state', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("status === 'SUBSCRIBED'");
    expect(source).toContain("dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' })");
  });

  it('6b. CHANNEL_ERROR/TIMED_OUT status dispatches reconnecting connection state', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const reconnectingMatch = source.match(/status === 'CHANNEL_ERROR' \|\| status === 'TIMED_OUT'[\s\S]*?connectionState: 'reconnecting'/);
    expect(reconnectingMatch).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 7: No recursive setTimeout polling loop
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 7 — No recursive setTimeout polling loop', () => {
  it('7a. schedulePoll function is removed — no schedulePoll declaration exists', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).not.toContain('const schedulePoll');
    expect(source).not.toContain('function schedulePoll');
  });

  it('7b. doPoll function is removed — no doPoll declaration exists', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).not.toContain('const doPoll');
    expect(source).not.toContain('function doPoll');
  });

  it('7c. pollRef is removed — no pollRef declaration exists', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).not.toContain('const pollRef');
  });

  it('7d. idlePollCountRef is removed — no idle detection guard exists', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).not.toContain('idlePollCountRef');
  });

  it('7e. Old polling comment headers are removed', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).not.toContain('Resilient Polling with backoff');
    expect(source).not.toContain('Slow heartbeat');
  });

  it('7f. No doPollRef exists', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).not.toContain('doPollRef');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 8: No setInterval in discovery effect
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 8 — Discovery effect is one-shot', () => {
  it('8a. Discovery effect uses one-shot async IIFE, NOT setInterval', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const discoveryEffect = source.match(
      /Discover jobs started from other panels[\s\S]*?useEffect\(\s*\(\)\s*=>[\s\S]*?return\s*\(\s*\)\s*=>[\s\S]*?},\s*\[[^\]]+\]\s*\);/
    );

    expect(discoveryEffect).not.toBeNull();
    expect(discoveryEffect![0]).not.toContain('setInterval');
    expect(discoveryEffect![0]).not.toContain('clearInterval');
  });

  it('8b. Discovery calls discover() directly without setTimeout or setInterval', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const discoveryCall = source.match(/Discover[\s\S]*?discover\(\);/);
    expect(discoveryCall).not.toBeNull();
  });

  it('8c. Discovery effect has early return guard when projectId or activated is falsy or job already exists', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const discoveryGuard = source.match(/Discover jobs started from other panels[\s\S]{0,200}if \(!projectId \|\| !state\.activated \|\| state\.job\?\.id\) return/);
    expect(discoveryGuard).not.toBeNull();
  });

  it('8d. No setInterval calls exist anywhere in the file', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const setIntervalCalls = source.match(/setInterval\s*\(/g);
    expect(setIntervalCalls).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 9: All exported actions preserved
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 9 — All exported actions preserved', () => {
  it('9a. Return object destructures all state fields', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('job: state.job, steps: state.steps, isRunning: state.isRunning, error: state.error, activated: state.activated, connectionState: state.connectionState, backendDiagnostic: state.backendDiagnostic');
  });

  it('9b. Return object contains all core action functions', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('start, pause, resume, stop, runNext, clear, refreshStatus, activate');
  });

  it('9c. Return object contains all approval functions', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('getPendingDoc, approveNext, approveDecision, approveSeedCore');
  });

  it('9d. Return object contains applyDecisionsAndContinue', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('applyDecisionsAndContinue');
  });

  it('9e. Return object contains stage control functions', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('setStage, forcePromote, restartFromStage');
  });

  it('9f. Return object contains setResumeSource', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('setResumeSource');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 10: Auto-resume effect intact
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 10 — Auto-resume effect intact', () => {
  it('10a. Auto-resume effect references auto_resume_scheduled', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('auto_resume_scheduled');
  });

  it('10b. Auto-resume effect handles stalled resume attempts', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('auto-resume stalled');
    expect(source).toContain('autoResumeFailCountRef.current >= 3');
  });

  it('10c. Auto-resume uses buildPauseLoopSignature for duplicate detection', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('const pauseSignature = buildPauseLoopSignature(state.job)');
    expect(source).toContain('autoResumeLastAttemptSignatureRef.current === pauseSignature');
  });

  it('10d. Auto-resume dispatches isRunning: false after 3 failed attempts', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('autoResumeFailCountRef.current >= 3');
    expect(source).toContain('isRunning: false');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 11: toggleAllowDefaults auto-resolve
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 11 — toggleAllowDefaults auto-resolve', () => {
  it('11a. toggleAllowDefaults triggers auto-resolve of pending decisions', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('auto-resolve pending decisions');
  });

  it('11b. toggleAllowDefaults calls apply-decisions-and-continue when appropriate', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('apply-decisions-and-continue');
    expect(source).toContain('pending_decisions');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 12: Stale decision handling
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 12 — Stale decision handling', () => {
  it('12a. Hook handles STALE_DECISION error code', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("code === 'STALE_DECISION'");
    expect(source).toContain('STALE_DECISION');
  });

  it('12b. STALE_DECISION checked in callAutoRun after 409 status', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain("resp.status === 409 && result?.code === 'STALE_DECISION'");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 13: Stack trace safety — no removed exports or broken signatures
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 13 — Stack trace safety', () => {
  it('13a. Hook still exports all original functions by name in the return statement', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('start, pause, resume, stop, runNext, clear, refreshStatus, activate');
    expect(source).toContain('getPendingDoc, approveNext, approveDecision, approveSeedCore');
    expect(source).toContain('applyDecisionsAndContinue');
    expect(source).toContain('setStage, forcePromote, restartFromStage');
    expect(source).toContain('setResumeSource');
    expect(source).toContain('saveStorySetup, saveQualifications, saveLaneBudget, saveGuardrails');
    expect(source).toContain('fetchDocumentText');
    expect(source).toContain('updateStepLimit, resumeFromStepLimit');
    expect(source).toContain('updateVersionCap');
    expect(source).toContain('toggleAllowDefaults');
    expect(source).toContain('updateTarget');
    expect(source).toContain('repairBaseline');
  });

  it('13b. All original action functions still use the same callAutoRun action strings', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    // Core actions
    expect(source).toContain("callAutoRun('pause'");
    expect(source).toContain("callAutoRun('resume'");
    expect(source).toContain("callAutoRun('stop'");
    expect(source).toContain("callAutoRun('run-next'");
    expect(source).toContain("callAutoRun('status'");

    // Approval
    expect(source).toContain("callAutoRun('get-pending-doc'");
    expect(source).toContain("callAutoRun('approve-next'");
    expect(source).toContain("callAutoRun('approve-decision'");
    expect(source).toContain("callAutoRun('approve-seed-core'");

    // Decisions
    expect(source).toContain("callAutoRun('apply-decisions-and-continue'");

    // Stage control
    expect(source).toContain("callAutoRun('set-stage'");
    expect(source).toContain("callAutoRun('force-promote'");
    expect(source).toContain("callAutoRun('restart-from-stage'");

    // Resume source
    expect(source).toContain("callAutoRun('set-resume-source'");

    // Interventions
    expect(source).toContain("callAutoRun('update-step-limit'");
    expect(source).toContain("callAutoRun('update-target'");
    expect(source).toContain("callAutoRun('update-version-cap'");
    expect(source).toContain("callAutoRun('repair-baseline'");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TEST 14: Connection state transitions via heartbeat failures
// ════════════════════════════════════════════════════════════════════════════════

describe('TEST 14 — Connection state transitions via heartbeat failures', () => {
  it('14a. Heartbeat failure counter increments on error', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('heartbeatFailures += 1');
  });

  it('14b. After 3 consecutive heartbeat failures, dispatches disconnected then reconnecting', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const failTransition = source.match(/heartbeatFailures >= 3[\s\S]*?disconnected[\s\S]*?reconnecting/);
    expect(failTransition).not.toBeNull();
  });

  it('14c. Heartbeat resets failure counter back to 0 on success', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    expect(source).toContain('heartbeatFailures = 0');
  });

  it('14d. Realtime received an update also dispatches online connection state', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

    const realtimeOnline = source.match(/Realtime received an update[\s\S]*?connectionState: 'online'/);
    expect(realtimeOnline).not.toBeNull();
  });
});