# devseed-autopilot Race Condition Fix

## Status: ASSIGNED to Oracle

## The Bug
In `supabase/functions/devseed-autopilot/index.ts`, lines 661-718:

```
executeRegenFoundation():
  1. Start regen job via dev-engine-v2 (regen-insufficient-start)
  2. Dispatch pollRegenJobAndUpdateCanon() to background via waitUntil()
  3. Return immediately (line 717)

back in tick handler (line 398-400):
  4. Mark regen_foundation stage as "done" ← REGEN HASN'T FINISHED YET
  5. Check if all stages done → yes → autopilot.status = "complete"
  6. Return done:true
```

Result: The frontend sees "complete", validates seed state (passes because autopilot says complete), and starts Auto-Run. But the regen foundation docs aren't done yet. If they fail, the error is written after the fact to a stage that's already "done".

## The Fix

### Change 1: Running-stage handler in tick loop

Around line 298-314, add handling for running stages with job_id:

```typescript
// When checking next stage:
if (s.status === "running") {
  // Regen foundation needs multi-tick polling
  if (stage === "regen_foundation" && s.job_id) {
    const tickResp = await fetch(`${supabaseUrl}/functions/v1/dev-engine-v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authHeader}` },
      body: JSON.stringify({ action: "regen-insufficient-tick", jobId: s.job_id, maxItemsPerTick: 3, userId }),
    });
    const tickData = await tickResp.json();
    if (tickResp.ok && tickData.done === true) {
      // Get final status
      const statusResp = await fetch(`${supabaseUrl}/functions/v1/dev-engine-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authHeader}` },
        body: JSON.stringify({ action: "regen-insufficient-status", jobId: s.job_id, userId }),
      });
      const sd = await statusResp.json();
      const items = sd?.items || [];
      const errors = items.filter((i: any) => i.status === "error");
      if (errors.length > 0) {
        s.status = "error";
        s.error = `${errors.length} items errored`;
      } else {
        s.status = "done";
        s.notes = `regened ${items.filter((i: any) => i.status === "regenerated").length} docs`;
      }
    }
    // Not done yet → exit tick, wait for next polling cycle
    break;
  }
  // For non-regen running stages, treat normally
  nextStage = stage;
  break;
}
```

### Change 2: Modify executeRegenFoundation

Instead of dispatching to background, store the job_id in stage state and let the tick loop poll:

```typescript
async function executeRegenFoundation(...) {
  // ... existing code to start regen job ...

  autopilot.stages.regen_foundation.status = "running";
  autopilot.stages.regen_foundation.job_id = jobId;
  autopilot.stages.regen_foundation.total_items = total;
  autopilot.stages.regen_foundation.updated_at = nowISO();
  autopilot.updated_at = nowISO();
  
  // Persist running state
  await sb.from("project_canon").upsert({
    project_id: projectId,
    canon_json: { ...canonJson, autopilot },
    updated_by: userId,
  }, { onConflict: "project_id" });
  
  // NOT marked done — tick loop will poll on next iteration
  // Remove: waitUntil(pollRegenJobAndUpdateCanon(...));
  // Remove: the background polling function entirely if no other caller
}
```

### Change 3: Remove dead code
If `pollRegenJobAndUpdateCanon` is only called from `executeRegenFoundation`, remove the entire function (~50 lines).

If called from elsewhere (check with grep), leave it but it won't affect regen_foundation anymore.

## Testing Steps

1. Create a test project via ApplyDevSeed with "Create + Autopilot" enabled
2. Watch the devseed-autopilot tick loop in Supabase function logs
3. Verify regen_foundation stage progresses from "running" → "done" (not immediate jump)
4. Verify Auto-Run starts after regen completes
5. Try the negative case: inject a failing doc to verify stage goes to "error"

## Reference
- `~/code/iffy/devseed-autopilot-fix-plan.md` — fuller analysis
- `supabase/functions/devseed-autopilot/index.ts` — the file to change
- `ApplyDevSeedDialog.tsx` lines 893-1033 — the frontend side of the auto-run handoff