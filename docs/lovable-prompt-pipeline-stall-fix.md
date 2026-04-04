# Lovable Prompt — Fix Auto-Run Pipeline Stall (Two Bugs)

## CONTEXT

The auto-run pipeline is stalling at treatment prep (Step 0/100) due to two bugs.
These must be fixed together. Do NOT touch anything outside the scope listed.

---

## BUG 1 — `regen_insufficient_character_bible` false positive (missing_current_version)

### What's happening
In `dev-engine-v2`, the `regenerate_seed_docs` action runs a `classifyInsufficiency` check
on each foundation doc before deciding whether to regenerate. The check is:

```ts
const classifyInsufficiency = (docType, docId, ver) => {
  if (!docId || !ver) return { reason: "missing_current_version", charBefore: 0 };
  ...
};
```

`ver` is loaded via `latest_version_id` on `project_documents`. If `latest_version_id` is null
(not yet set, or set after an async write), the check incorrectly fires `missing_current_version`
even though the document HAS content in `project_document_versions`.

This causes the Character Bible to be logged as `regen_insufficient_character_bible` and
re-generated with a stub, overwriting good content.

### The fix (dev-engine-v2)

In `classifyInsufficiency`, when `ver` is null but `docId` is valid, fall back to querying
`project_document_versions` directly for the most recent version of that document:

```ts
const classifyInsufficiency = async (docType, docId, ver) => {
  if (!docId) return { reason: "missing_current_version", charBefore: 0 };
  if (!ver) {
    // Fallback: try to find most recent version for this document
    const { data: fallbackVer } = await supabase
      .from("project_document_versions")
      .select("plaintext")
      .eq("document_id", docId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fallbackVer?.plaintext?.trim()) return { reason: "missing_current_version", charBefore: 0 };
    ver = fallbackVer;
  }
  const plaintext = (ver?.plaintext || "").trim();
  const charBefore = plaintext.length;
  if (containsStubMarker(plaintext)) return { reason: "stub_marker", charBefore };
  const minChars = MIN_CHARS[docType] ?? DEFAULT_MIN;
  if (charBefore < minChars) return { reason: "too_short", charBefore };
  return { reason: null, charBefore };
};
```

Make `classifyInsufficiency` async wherever it is called. Update all call sites accordingly.

---

## BUG 2 — Stale canon hash blocks auto-run in Full Autopilot mode

### What's happening
The auto-run prep_setup step checks if the current document version was generated with the
current canon hash (`qr-1-iqwdu0`). If it was generated with an older hash (`auto_4m2pnt`),
it shows a "Stale" warning and **stops the pipeline**, requiring a manual click on
"Regenerate character bible to match canonical format".

This should auto-resolve in Full Autopilot mode (when `allow_defaults = true` on the job),
but instead it halts the run and returns `run-next` without advancing.

### The fix (auto-run)

In the canon hash stale check inside `prep_setup`, when `allow_defaults === true` or when
the job has Full Autopilot enabled, auto-trigger the regeneration instead of stopping:

Find the stale doc check (look for the warning that compares `document.canon_input_hash`
or similar to the current canon hash). When the stale condition is detected:

```ts
// BEFORE (blocks pipeline):
if (isStale) {
  await logStep(..., "stale canon hash detected, manual regen required");
  return respondWithJob(supabase, jobId, "run-next");
}

// AFTER (auto-resolves in autopilot):
if (isStale) {
  const isAutopilot = _jobRow?.allow_defaults === true;
  if (isAutopilot) {
    // Auto-trigger canon sync regen — call dev-engine-v2 regenerate_seed_docs
    // or mark the doc for regen and continue
    await logStep(..., "stale canon hash — auto-regenerating in autopilot mode");
    // trigger regen inline, then continue past the gate
  } else {
    // Manual mode: pause and surface to user as before
    await logStep(..., "stale canon hash detected, manual regen required");
    return respondWithJob(supabase, jobId, "run-next");
  }
}
```

The exact implementation may differ based on how the regen is triggered. The goal:
**Full Autopilot should never stall waiting for a human to click a "Regenerate stale doc" button.**

---

## SCOPE — FILES TO TOUCH

- `supabase/functions/dev-engine-v2/index.ts` — Bug 1 fix only
- `supabase/functions/auto-run/index.ts` — Bug 2 fix only

## DO NOT TOUCH

- Any frontend/UI files
- Any other edge functions
- Chunk assembly, generation pipeline, scoring logic
- Schema / database tables
- `SectionedDocProgress`, `SectionedDocViewer`, `ProjectDevelopmentEngine`

---

## DEFINITION OF DONE

1. Foundation doc regen no longer falsely fires `regen_insufficient_character_bible`
   when the document has content but `latest_version_id` is temporarily null
2. In Full Autopilot mode, stale canon hash warnings auto-resolve without requiring
   a manual user click — the pipeline continues unblocked
3. The Last Cartographer auto-run pipeline advances past treatment Step 0 without stalling
