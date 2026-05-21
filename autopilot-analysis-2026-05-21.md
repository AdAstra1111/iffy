# Autopilot Pipeline Analysis — May 21

## The "Create + Autopilot" Flow

1. User clicks "Create + Autopilot" in ApplyDevSeedDialog
2. Project is created in Supabase
3. Seed documents are created (idea, concept_brief, format_rules, treatment, character_bible, market_sheet)
4. Canon is planted in project_canon
5. **devseed-autopilot** starts → runs stages (apply_seed_intel_pack, regen_foundation, etc.)
6. Tick loop runs (up to 60 iterations @ 1s intervals)
7. Seed state is validated — checks for errors + missing docs
8. **auto-run** starts → creates auto_run_jobs record with ladder
9. auto-run ticks through ladder stages (idea → production_draft)

## All Critical Edge Functions Are DEPLOYED & ACTIVE

| Function | Version | Status |
|----------|---------|--------|
| auto-run | v126 | ACTIVE |
| dev-engine-v2 | v397 | ACTIVE |
| devseed-autopilot | v94 | ACTIVE |
| devseed-orchestrator | v62 | ACTIVE |

## Most Likely Bug: Race Condition in devseed-autopilot

**`executeRegenFoundation`** dispatches the regen job to background via `waitUntil()` and returns immediately. The tick handler then marks `regen_foundation` stage as **"done"** prematurely at line 398-399.

If the background regen later fails, it calls `updateAutopilotStage()` to set the stage to "error" — but by then the autopilot has already been marked "complete" and the frontend tick loop has exited. The seed validation never sees the error.

**However**, this doesn't explain why auto-run *never fires* — it would explain why regen *silently fails*.

## Second Potential Issue: Tick Loop Timing

The devseed-autopilot's `executeRegenFoundation` sets stage to "running" before dispatching to background. The tick handler then immediately marks it "done". This means the frontend tick loop exits in 3 ticks (~3 seconds). But:

- Stage "regen_foundation" → dispatched to background → marked "done" immediately
- Next tick: all stages look "done" → autopilot.status = "complete" → returns done:true
- Frontend tick loop exits → validates seed state → calls auto-run start

**The auto-run might actually be starting**, but the regen foundation documents might not be ready yet — they're still being generated in the background when auto-run starts. The auto-run might then fail because it can't find documents it expects.

## What to Test First

1. Check if auto_run_jobs table has entries for Yeti project
2. Check Supabase function logs for devseed-autopilot or auto-run errors
3. Try creating a test project manually and watch the console logs
4. Fix the race condition: move `executeRegenFoundation`'s polling logic into the main tick loop instead of using background `waitUntil`