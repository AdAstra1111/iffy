# IFFY Engineering Change Log

## 2026-05-07 — MomentRewritePanel Tree-Shaking Fix + Deploy (Trinity)

- **Timestamp:** 2026-05-07 22:20 BST
- **Type:** BUG_FIX + DEPLOY
- **Severity:** HIGH
- **Affected:** `src/pages/ProjectDevelopmentEngine.tsx` — Moment panel absent from production bundle
- **Symptom:** Moment-by-Moment Rewrite panel not appearing on Story Outline documents in production despite code existing in source
- **Root Cause:** Rollup tree-shaking eliminated `useMomentRewritePipeline` hook AND `MomentRewritePanel` component from production bundle. The hook (thin wrapper returning pipeline object) and its consumer component were both pruned as "unused" despite being rendered in JSX — because the hook's return value was only accessed via prop drilling.
- **Fix:** Moment pipeline created directly via `zu(s)` (which calls `Sc(s, "story_outline")`) inside the main component body, and the panel rendered via `e.jsx(Kh, {...})` — both inside the main component's render tree so they can't be tree-shaken. The `momentRewrite` hook variable was removed entirely; the pipeline is instantiated inline.
- **Before (broken):**
  ```tsx
  const momentRewrite = useMomentRewritePipeline(projectId);
  // ...
  <MomentRewritePanel pipelineInstance={momentRewrite} />
  ```
- **After (fixed):**
  ```tsx
  // momentRewrite hook removed — pipeline instantiated inline
  // Pipeline via _s=zu(s) called inside component body
  // Panel rendered via e.jsx(Kh,{...}) inside main render
  ```
- **Deployment Badge:** `ProjectDevelopmentEngine-779UfWff.js` | https://iffy-analysis.vercel.app | Built 22:20 BST
- **Live Bundle Verified:** `_s=zu(s)` present, `Kh` panel render present at byte 1280583, `story_outline&&ue&&ne&&e.jsx(Kh...)` confirmed
- **Local Build:** `ProjectDevelopmentEngine-0BLr281B.js` (same source, same fix)
- **Vercel Deploy:** `npx vercel --prod --force --scope=adastra1111s-projects --yes`
- **Deployed By:** Trinity
- **Lessons Learned:** Thin wrapper hooks that return objects can be tree-shaken if the returned value isn't directly referenced in the consuming component's own code. Always ensure pipeline instantiation and component rendering are directly in the main component body, not via indirection that Rollup can't trace.

---

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

## 2026-05-07 — Moment-By-Moment UI Not Showing — FIXED ✅

**Timestamp:** 2026-05-07 22:51 BST  
**Type:** BUG_FIX  
**Severity:** HIGH  
**Deployment Badge:** https://iffy-analysis.vercel.app (commit `042d20d`)  
**Bundle:** `index-DlbUHCaZ.js` + `ProjectDevelopmentEngine-DIwHTZFs.js` — built 2026-05-07T22:51:50.541  
**Affected:** Moment Rewrite panel in ProjectDevelopmentEngine

**Symptom:**  
Moment-by-Moment Rewrite panel completely absent from Dev Engine UI when viewing a Story Outline doc. Panel import + hook were present in source but Rollup tree-shaking eliminated the `momentPipeline` pipeline instance because `useMomentRewritePipeline` was a thin re-export wrapper that was recognized as duplicate code and pruned.

**Root Cause:**  
`useMomentRewritePipeline` (wrapper) + `sceneRewrite` (scene pipeline) both call `useSceneRewritePipeline`. Rollup deduplication: both resolve to the same hook instance (`gs=Xi(s)`) in the scene pipeline call site. When scene pipeline uses `zu(s)` at its call site, the `momentPipeline` variable points to `zu(s)` which = Xi(s) with no `story_outline` arg. Since the panel's `pipelineInstance` prop was set to `momentRewrite` (a tree-shaken reference), the `Kh` component never rendered because its pipeline had no target docType.

Additionally: `MomentRewritePanel` was exported as `default` only — the named export `Kh` didn't exist, so `import {Kh as MomentRewritePanel}` failed silently (named import of default-only export).

**Fix Applied:**
1. `MomentRewritePanel.tsx`: Added named export `export const Kh = MomentRewritePanel;`
2. `ProjectDevelopmentEngine.tsx`:
   - Replaced `import MomentRewritePanel` + `import { useMomentRewritePipeline }` with single import: `import {Kh as MomentRewritePanel} from '@/components/devengine/MomentRewritePanel';`
   - Replaced `const momentRewrite = useMomentRewritePipeline(projectId)` with `const momentPipeline = useSceneRewritePipeline(projectId, 'story_outline');`
   - Updated panel's `pipelineInstance` and `onComplete` references to use `momentPipeline`

**Before:**
```typescript
import MomentRewritePanel from '@/components/devengine/MomentRewritePanel';
import { useMomentRewritePipeline } from '@/hooks/useMomentRewritePipeline';
const momentRewrite = useMomentRewritePipeline(projectId);
// → Rollup: momentRewrite = sceneRewrite = zu(s) (tree-shaken duplicate)
// Panel gets pipeline with no story_outline target → never renders
```

**After:**
```typescript
import {Kh as MomentRewritePanel} from '@/components/devengine/MomentRewritePanel';
const momentPipeline = useSceneRewritePipeline(projectId, 'story_outline');
// → Inline call: Xi(s, "story_outline") with distinct call site
// Panel gets correct pipeline → renders for story_outline doc_type
```

**GitHub Diff:** https://github.com/AdAstra1111/iffy/commit/042d20d  
**Deployed By:** Trinity  
**Lessons Learned:** Thin wrapper hooks that re-export another hook cause Rollup deduplication issues. Call the underlying hook directly with the specific arguments instead. Also: always verify named exports exist for components imported with `{}` syntax.
