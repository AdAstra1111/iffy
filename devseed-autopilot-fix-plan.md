# Fix: Regen Foundation Race Condition

## Problem
`executeRegenFoundation` dispatches regen polling to background via `waitUntil()` and returns immediately. The tick handler marks the stage as "done" before the regen actually completes. If the regen fails, the error is written after the autopilot is already marked "complete" — the frontend never sees it.

## Fix: Multi-tick stage support in devseed-autopilot

Instead of running regen polling in the background, integrate it into the main tick loop so the stage status accurately reflects completion.

### Changes to `supabase/functions/devseed-autopilot/index.ts`

**1. At tick handler (~line 310), add running-stage check:**
```typescript
if (s.status === "running") {
    // Check if it's regen_foundation in progress
    if (stage === "regen_foundation" && s.job_id) {
        // Poll regen job status
        const pollResp = await fetch(`${supabaseUrl}/functions/v1/dev-engine-v2`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authHeader}` },
            body: JSON.stringify({ action: "regen-insufficient-tick", jobId: s.job_id, maxItemsPerTick: 3, userId }),
        });
        const pollData = await pollResp.json();
        if (pollData.done === true) {
            // Job complete — fetch final status
            const statusResp = await fetch(...);
            const items = statusResp?.items || [];
            const errorItems = items.filter((i: any) => i.status === "error");
            if (errorItems.length > 0) {
                s.status = "error";
                s.error = `${errorItems.length} items errored`;
            } else {
                s.status = "done";
                s.notes = `regenerated ${items.filter(i => i.status === "regenerated").length} docs`;
            }
        }
        // If not done, skip processing this tick — next tick will poll again
        break;  // or continue to check other stages
    }
    // For non-regen running stages, treat normally
    nextStage = stage;
    break;
}
```

**2. In `executeRegenFoundation`, store job_id in stage state instead of background dispatching:**
```typescript
// DON'T dispatch to background
// waitUntil(pollRegenJobAndUpdateCanon(...));
// return;

// INSTEAD: Store job_id in stage state and return
// The tick loop will pick it up on next iteration
autopilot.stages.regen_foundation.status = "running";
autopilot.stages.regen_foundation.job_id = jobId;
autopilot.stages.regen_foundation.total_items = total;
autopilot.stages.regen_foundation.updated_at = nowISO();
```

**3. Remove `waitUntil` import if no longer needed.**

## Alternative Quick Fix (minimal change)

If multi-tick stages are too risky before June 1, a simpler fix:

Keep the background dispatch but ADD a polling loop in the frontend tick handler after autopilot completes. After the devseed-autopilot tick loop exits, poll the regen job status directly before proceeding to auto-run:

```typescript
// In ApplyDevSeedDialog.tsx, after tick loop exits (line 935):
// Poll regen job directly to ensure it completed
let regenDone = false;
let regenTries = 0;
while (!regenDone && regenTries < 60) {
    const { data: statusData } = await supabase.functions.invoke('dev-engine-v2', {
        body: { action: 'regen-insufficient-status', jobId: /* need job_id */ }
    });
    regenDone = statusData?.done === true;
    if (!regenDone) await new Promise(r => setTimeout(r, 1000));
    regenTries++;
}
```

But we don't have the job_id in the frontend context after the tick loop. We'd need to store it or re-derive it.

**Recommended approach:** Fix #1 (multi-tick stages). It's cleaner, eliminates the race condition, and the autopilot status accurately reflects reality.