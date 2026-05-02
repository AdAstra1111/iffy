# IFFY Engineering Change Log

## 2026-05-02 — Audio Export Layer Built (Trinity)

- **Timestamp:** 2026-05-02 21:30 BST
- **Type:** FEATURE_BUILD
- **Severity:** HIGH
- **Affected:** New service at `~/code/iffy-audio/` — standalone Audio Export Layer
- **What:** Built 4-layer audio pipeline scaffolding (Dialogue/ElevenLabs, Sound/Freesound, Music/AIVA-blocked, Mix/ffmpeg)
- **Details:**
  - Layer 1 (ElevenLabs): ✅ Built — voice consistency engine for 60-episode series, confirmed key: `sk_1bd650b...`
  - Layer 2 (Freesound): ✅ Built — scene classification engine + crossfade presets
  - Layer 3 (AIVA): ⚠️ BLOCKED — API key pending from Sebastian
  - Layer 4 (ffmpeg): ✅ Built — M4B assembly with chapter markers
  - Project discovery: ✅ Project-agnostic — auto-selects first project with beat_sheet + character_bible
  - Voice consistency: 14-episode cache blocks, 3-strategy approach (find/clone/map)
- **Git:** New repo `~/code/iffy-audio/` — not deployed (standalone service)
- **Deploy Badge:** N/A — standalone service, not IFFY main app
- **Lessons Learned:** npm install failed on Mac mini (ECONNRESET). Can symlink @supabase/supabase-js from IFFY project. Pre-copy node_modules from IFFY if network unavailable.

---

## 2026-05-02 — Two-Fix Deploy (Trinity)

**Error 1: "Assignment to constant variable" (CONST REASSIGNMENT — ROOT CAUSE FOUND)**

- **Timestamp:** 2026-05-02 13:45 BST
- **Type:** BUG_FIX
- **Severity:** CRITICAL
- **Affected:** `supabase/functions/dev-engine-v2/index.ts` — rewrite action handler, line 7555
- **Symptom:** "Assignment to constant variable" thrown by Deno runtime when rewrite action processes concept_brief or idea documents
- **Root Cause:** `const effectiveDocType = deliverableType || targetDocType` declared at function scope (line 7555), then reassigned inside a nested block (line 7558). JavaScript/Deno throws when a `const` is reassigned in any scope.
- **Before:**
  ```typescript
  const effectiveDocType = deliverableType || targetDocType;
  {
    effectiveDocType = deliverableType || targetDocType;  // ← Assignment to constant variable
  ```
- **After:**
  ```typescript
  let effectiveDocType = deliverableType || targetDocType;
  {
    effectiveDocType = deliverableType || targetDocType;  // ← valid reassignment to let
  ```
- **Git Diff:** commit `edfe787` — "fix: effectiveDocType reassignment — const→let in rewrite handler"
- **Deployed By:** Trinity
- **Deploy Badge:** `ProjectDevelopmentEngine-CGazDUMJ.js` built 12:45 BST
- **Edge Function:** `dev-engine-v2` deployed via `supabase functions deploy` — live at ~13:40 BST
- **Lessons Learned:** Const reassignments in nested blocks compile fine in TypeScript but throw at Deno runtime. Always use `let` for variables that are reassigned in a later block, even if declared with a starting value at the outer scope.

---

**Error 2: 400 from blocker gate (BLOCKER GATE IMPROVEMENT)**

- **Timestamp:** 2026-05-02 ~11:50 BST
- **Type:** BUG_FIX
- **Severity:** HIGH
- **Affected:** `supabase/functions/dev-engine-v2/index.ts` — rewrite action blocker gate
- **Symptom:** 400 with generic "Blockers require decisions before rewrite" — not descriptive
- **Root Cause:** Blocker gate returned `status: 400` with a terse error message
- **After:**
  ```typescript
  status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" }
  // error: "unresolved_blockers"
  // message: "This rewrite has N unresolved blocking issue(s) that must be addressed..."
  ```
- **Git Diff:** commit `c0c316e` — "fix: blocker gate returns 422 with descriptive message (was 400)"
- **Deployed By:** Trinity
- **Deploy Badge:** `ProjectDevelopmentEngine-CKZd1NxH.js` built 10:46 BST (first deploy of the day)
- **Edge Function:** `dev-engine-v2` blocker gate fix deployed ~11:50 BST
- **Lessons Learned:** Always use 422 for precondition failures, 400 for malformed requests. Error messages must be descriptive enough for Sebastian to understand what to fix.
