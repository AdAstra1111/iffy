# IFFY Canonical Evaluation Specification

**Status:** Design spec complete — ChatGPT review integrated
**Review:** May 19 — Feedback incorporated: evidence-bound blockers, Intent Preservation Layer, ambiguity tolerance modes, classical vs internal coherence split, production draft anti-exposition rule confirmed
**Next Phase:** Evaluation Contract Registry (Phase 1 — Architect)
**Version:** 1.0
**Date:** 2026-05-19

---

## 1. Purpose

Define a deterministic, stage-aware evaluation system for all 16 document types in the IFFY development ladder. Every document type has explicit:
- What to evaluate (scope-bound dimensions)
- What **NOT** to evaluate (firewall rules preventing cross-stage contamination)
- Valid blockers (concrete failure conditions)
- Convergence rules (when to stop rewriting)
- Evidence requirements (what constitutes a valid note)

---

## 2. Architecture: Canonical Evaluation Contract

Every document type maps to a formal contract entry:

```
doc_type → 
  allowed_dimensions[]       # What dimensions to evaluate
  forbidden_dimensions[]     # Firewall — never evaluate these
  permitted_blockers[]       # Valid conditions that block promotion
  convergence_rules          # When does evaluation stop
  blocker_format             # Evidence-bound structure
  confidence_threshold       # Minimum confidence for a note to surface
```

This contract is stored as a deterministic registry (`evaluationContractRegistry.ts`), not as prompt text alone. Prompts derive from contracts — they don't define them.

---

## 3. Document Type Registry

### 3.1 Structural Documents

| Document | Allowed Dimensions | Forbidden Dimensions | Valid Blockers |
|----------|-------------------|---------------------|----------------|
| **Idea** | Clarity of premise, hook strength, market differentiation, emotional core clarity | Structure, character depth, dialogue, scene construction | Premise is incoherent; No identifiable hook; No target audience implied |
| **Concept Brief** | Narrative clarity, genre positioning, tone lock, comp titles, central conflict definition | Script mechanics, scene construction, character arc details | Conflict undefined; Tone ambiguous; Genre mismatch with format |
| **Market Sheet** | Target audience, comparable titles, commercial viability, distribution channels, demographic fit | Narrative execution quality, character depth, plot specifics | No identifiable audience; Comparables missing or inaccurate; Commercial case unconvincing |

### 3.2 Narrative Documents

| Document | Allowed Dimensions | Forbidden Dimensions | Valid Blockers |
|----------|-------------------|---------------------|----------------|
| **Treatment** | Narrative arc, act structure (classical), 3-act or 5-act coherence, dramatic tension, pacing, key scene beats | Dialogue quality, action line formatting, scene slugline aesthetics | Acts don't form coherent arc; Tension curve missing; Pacing unbalanced |
| **Feature Script** | Structural integrity (classical + internal coherence), character motivation clarity, scene progression logic, dialogue naturalism | Production formatting, budget implications, market analysis | Scenes don't advance plot; Character motivation breaks at key juncture; Dialogue uniformly flat across 3+ scenes |
| **Episode Script** | Same as Feature Script, plus: episodic structure, cold open/hook, act break cliffhangers, season arc integration | Same as Feature Script | Same as Feature Script, plus: Episode lacks standalone identity; Act breaks don't function as hooks |

### 3.3 Character Documents

| Document | Allowed Dimensions | Forbidden Dimensions | Valid Blockers |
|----------|-------------------|---------------------|----------------|
| **Character Bible** | Character consistency, motivation clarity, arc trajectory, backstory-to-present logic, relationship dynamics | Plot specifics, dialogue style, scene mechanics, market positioning | Character motivation contradicts backstory; Arc trajectory absent; Relationship dynamics insufficiently defined |
| **Series Bible** | World logic, tonal consistency, season arc viability, character ensemble coherence, long-form narrative tension | Episode-specific plotting, market analysis, production feasibility | World logic has contradictions; Ensemble character types don't contrast meaningfully; Long-form tension absent |

### 3.4 Arc/Structure Documents

| Document | Allowed Dimensions | Forbidden Dimensions | Valid Blockers |
|----------|-------------------|---------------------|----------------|
| **Season Arc** | Episode-to-episode progression, arc climax placement, subplot interleaving, emotional escalation | Dialogue quality, scene-level execution, production constraints | Episodes lack cumulative tension; Climax placement feels arbitrary; Subplots don't intersect main arc |
| **Episode Outline** | Scene-by-scene intent clarity, narrative function of each scene, transition logic, act structure compliance | Dialogue, action line writing quality, character voice distinctions | Scene intent unclear for 2+ consecutive scenes; Transitions break momentum; Outline contradicts season arc |

### 3.5 Production Documents

| Document | Allowed Dimensions | Forbidden Dimensions | Valid Blockers |
|----------|-------------------|---------------------|----------------|
| **Production Draft** | Scene numbering, slugline completeness, action line clarity (for department heads), continuity, format compliance (industry standard) | "Too much exposition" — **EVER BLOCKED**; artistic quality; narrative originality; dialogue literary quality; market comparison | Scene numbering gaps; Sluglines missing location or time of day; Continuity breaks between scenes; Format violates industry standard |
| **Storyboard Notes** | Visual intent clarity, shot sequence logic, camera movement feasibility, scene coverage | Narrative quality, dialogue, performance direction, market positioning | Shot sequence illogical; Camera movement physically impossible; Missing coverage for key story beats |

### 3.6 Market Documents

| Document | Allowed Dimensions | Forbidden Dimensions | Valid Blockers |
|----------|-------------------|---------------------|----------------|
| **Pitch Deck** | Presentation clarity, narrative sellability, audience hook, visual appeal of comps, uniqueness of angle | Script mechanics, production budget, distribution specifics (at pitch stage) | No clear sellable angle; Comps don't position the project; Narrative summary fails to hook |
| **Coverage** | Script quality dimension, market potential, comparability, recommendation clarity | Personal taste statements, speculative rewrites, aspirational casting | Recommendation contradicts evidence; Market comparison inaccurate; Script analysis factually wrong |

### 3.7 Research Documents

| Document | Allowed Dimensions | Forbidden Dimensions | Valid Blockers |
|----------|-------------------|---------------------|----------------|
| **Research Dossier** | Source credibility, topic coverage breadth, thematic relevance, factual accuracy | Narrative application, market positioning, creative interpretation | Sources not credible; Coverage missing central topic; Facts contradict established knowledge |
| **Narrative Structure** | Thematic coherence, structural framework viability, narrative logic, audience comprehension curve | Source citation completeness, market viability, individual scene construction | Framework doesn't support themes; Structure confuses rather than clarifies; Audience comprehension curve broken |

---

## 4. Evaluation Contract Format

```typescript
interface EvaluationContract {
  docType: string;
  allowedDimensions: DimensionDef[];
  forbiddenDimensions: string[];    // Firewall — never prompt these
  validBlockers: BlockerDef[];
  convergenceRules: ConvergenceRule[];
  evidenceRequirements: EvidenceReq;
  confidenceThreshold: number;       // 0.0–1.0 — below this, suppress note
}

interface DimensionDef {
  name: string;
  weight: number;                    // Relative importance
  criteria: string[];                // Specific questions to answer
  minConfidence: number;             // Per-dimension floor
}

interface BlockerDef {
  condition: string;                 // Human-readable
  requiredEvidence: string[];        // What evidence must support this
  maxInstances: number;              // Max times this blocker fires per pass
}

interface ConvergenceRule {
  type: "exhaustion" | "threshold" | "manual";
  condition: string;
  maxIterations: number;
}

interface EvidenceReq {
  format: "inline" | "spans" | "confidence";
  minEvidenceSpans: number;
  evidenceFormat: {
    type: string;                    // Type of evidence
    claim: string;                   // What the note claims
    evidence: string;                // Exact quote or structural reference
    confidence: number;              // 0.0–1.0
  };
}
```

---

## 5. Evidence-Bound Blocker Format

Every blocker MUST include:

```json
{
  "type": "blocker",
  "claim": "Scene numbering has gaps",
  "evidence": "Slugline sequence: SCENE 4 → SCENE 6 (SCENE 5 missing)",
  "evidence_spans": [
    { "start": "project_document_versions:content[0]", "text": "SCENE 4 - INT. OFFICE - DAY" },
    { "start": "project_document_versions:content[2]", "text": "SCENE 6 - INT. KITCHEN - DAY" }
  ],
  "confidence": 0.95,
  "remediation": "Insert SCENE 5 or renumber sequentially",
  "dimension": "format_compliance"
}
```

**Rules:**
- `confidence < 0.5` → **suppressed** (never surfaces as a note)
- `evidence_spans` minimum: 2 per blocker
- `claim` must be falsifiable — no subjective language
- `remediation` is optional but strongly preferred

---

## 6. Convergence Rules

### 6.1 Standard Convergence: Notes Exhaustion

```
converged WHEN (
  iteration >= MIN_ITERATIONS (3) 
  AND all blocker counts are decreasing or flat 
  AND no new blocker types introduced in last 2 iterations
  AND (all notes resolved FROM previous iteration) 
  OR (remaining notes deemed "stale" — same blocker firing 3+ times)
)
```

### 6.2 Stale Blocker Detection

A blocker is **stale** when:
1. Same `claim` and `evidence_spans` fired 3+ consecutive iterations
2. Content hasn't changed in the relevant spans
3. Confidence has not increased above threshold

→ Suppress stale blockers, do NOT force another rewrite.

### 6.3 Promotion Path

```
promotion_blocked IF (
  any active blockers with confidence >= BLOCKER_CONFIDENCE_THRESHOLD (0.7)
  AND blocker type is in permitted_blockers[]
)
promotion_allowed IF (
  no active blockers
  OR (remaining blockers all stale OR confidence < threshold)
)
```

### 6.4 Forced Convergence (Creative Asymptote)

After `MAX_ITERATIONS (10)`:
- Remaining active blockers are downgraded to "advisory notes"
- Document is promotable with advisory flags
- Flagged in job log: `convergence_forced: true | reason: iterations_exhausted`
- Does NOT block promotion

---

## 7. Note Generation Pipeline

```
Trigger: document_version created/updated
  ↓
Contract lookup: evaluationContractRegistry[docType]
  ↓
If not found → ALERT: UNCONFIGURED_DOC_TYPE (do NOT evaluate)
  ↓
Build evaluation prompt FROM contract (deterministic, no ad-hoc text)
  ↓
LLM evaluation call (structured output, JSON schema enforced)
  ↓
Parse response → evidence-bound blockers[]
  ↓
Filter:
  1. Remove suppressed (confidence < threshold)
  2. Remove stale (identical blockers from previous pass)
  3. Apply permitted_blockers filter (remove ontology-violating blockers)
  ↓
Deduplicate:
  - Same claim + same evidence → keep earliest (highest confidence)
  - Same dimension, similar claim → keep strongest (most evidence spans)
  - Remaining: merge evidence spans
  ↓
Store: job_notes table (NOT ephemeral — persistent across iterations)
  ↓
Emit IEL event: notes_generated { docType, count, blockers[], converged }
```

---

## 8. Deduplication Rules

| Match Criteria | Dedup Action |
|----------------|-------------|
| Same `claim` AND overlapping `evidence_spans` | Keep earliest with highest confidence |
| Same `dimension` AND same root claim | Merge evidence spans, keep max confidence |
| Different `claim` but same specific error location | Both kept (different perspectives) |
| Identical blocker from previous iteration | Mark stale — do not re-notify |
| Blocker with no evidence | **Discard** — must have evidence to surface |

---

## 9. Intent Preservation Layer (Future)

Current evaluation favors **structural validity**. Future architecture should separately track:

```
structural_coherence_score: number
intended_effect_score: number       # Does this achieve its artistic intent?
audience_impact_prediction: string   # Predicted audience response
```

**Rationale:** Projects may intentionally violate classical structure while still succeeding artistically. Current system would flag these as blockers. The Intent Preservation Layer allows evaluation to distinguish between:
- Structural failure (accidental)
- Structural subversion (intentional)

**Implementation:** Optional metadata on the document_version:
```json
{
  "intent": {
    "type": "classical" | "deconstructive" | "atmospheric" | "nonlinear",
    "allows_ambiguity": boolean,
    "allows_unreliable_narrator": boolean,
    "tolerates_anti_classical": boolean
  }
}
```

When present, evaluation adjusts:
- Forbidden dimensions remain forbidden
- But structural blocker thresholds are conditionally relaxed
- Ambiguity tolerance: passages are checked for intentionality, not penalized for opacity

---

## 10. Feature Script: Structural Integrity Split

Current: `structural_integrity` (single dimension)

Future split:
| Sub-Dimension | What It Evaluates | Example Failure |
|--------------|-------------------|-----------------|
| **classical_structure_integrity** | Is this a proper 3-act structure? Are act breaks in the right place? Does it follow expected beats? | "Act 2 has no midpoint. Plot doesn't escalate." |
| **internal_coherence_integrity** | Does the story logic hold? Do characters' choices flow from their motivations? Does cause-and-effect track? | "Character forgives in Scene 40 after swearing revenge in Scene 12 with no intervening event." |

**Why they are not equivalent:** A story can be classically broken but internally coherent (e.g., Tarantino's nonlinear structure). A story can be classically perfect but internally incoherent (characters act without motivation).

**Implementation:** Split the single dimension into two, with separate blockers and separate evidence requirements. Classical structure blockers are relaxable with intent metadata. Internal coherence blockers are NEVER relaxable.

---

## 11. Production Draft: The Anti-Exposition Rule

**HARD RULE:** Production drafts MUST NEVER be flagged for "too much exposition" or similar narrative-quality notes.

**Rationale:** Production drafts are written for department heads (set decoration, costumes, SFX, camera). Extended action lines describe physical details — these are not "exposition" but operational instructions. Flagging them as exposition destroys their utility.

**Enforcement:**
- `forbidden_dimensions` MUST include: "narrative quality", "dialogue literary quality", "artistic originality", "market comparison"
- Any evaluation pass that returns a note claiming "too much exposition" or variant MUST be:
  1. Discarded
  2. Logged as a **rubric violation** (evaluation failed to follow contract)
  3. Retried with explicit instruction: "DO NOT evaluate for exposition"

---

## 12. Ambiguity Tolerance Modes (Future)

For projects explicitly flagged as:
- **Atmospheric** (e.g., slow cinema, contemplative)
- **Nonlinear** (e.g., time-jumping, multi-perspective)
- **Anti-classical** (e.g., no act structure, no traditional arc)

The evaluation contract adjusts:
- `allowed_dimensions` narrowed (remove structural dimensions)
- `permitted_blockers` reduced (fewer structural failure conditions)
- Ambiguity is not penalized
- "Unreliable narrator" passages checked for intentional framing

**NOT applied automatically** — must be explicitly set in project metadata. Default is classical evaluation.

---

## 13. IEL Events

Every evaluation pass emits:

| Event | When | Payload |
|-------|------|---------|
| `evaluation_started` | Before LLM call | docType, versionId, contractHash |
| `evaluation_completed` | After parse | blocker count, evidenceStats, converged |
| `blocker_suppressed` | Below confidence threshold | blockerType, confidence, threshold |
| `blocker_stale` | Identical 3+ iterations | blockerType, claim, iterationCount |
| `rubric_violation` | LLM returned disallowed dimension | dimension, note text, action |
| `convergence_forced` | Hit MAX_ITERATIONS | iterationCount, remaining blockers |

---

## 14. Deploy Plan

### Phase 1: Contract Registry (Architect)
1. Create `src/lib/evaluationContractRegistry.ts` — all contracts in registry
2. Each contract as typed object matching `EvaluationContract` interface above
3. Add validation: every doc_type in `formatToLane()` must have a contract
4. Missing contracts throw `UNCONFIGURED_DOC_TYPE` error

### Phase 2: Evaluation Pipeline (Trinity)
1. Update `auto-run/index.ts` evaluation prompts to DERIVE from contract
2. No ad-hoc prompt text — always `buildEvalPrompt(contract)`
3. Add JSON schema enforcement on LLM output
4. Add evidence-bound blocker parsing

### Phase 3: Convergence (Trinity)
1. Implement stale detection in `auto-run` evaluation loop
2. Add MAX_ITERATIONS hard cap with advisory downgrade
3. Implement notes exhaustion convergence rule
4. Persist blockers to `job_notes` table

### Phase 4: Production Draft Fix (Trinity, immediate)
1. Remove "Also evaluate script quality" from production_draft rubric `DELIVERABLE_RUBRICS` in `auto-run/index.ts`
2. Add explicit: "DO NOT evaluate for exposition, narrative quality, dialogue literary quality"
3. Add forbidden_dimensions check post-parse: discard + log any violations

### Phase 5: Intent Layer (Future)
1. Add `intent` metadata to project documents table
2. Add `evaluationMode` to evaluation contract lookup
3. Implement classical vs. atmospheric/nonlinear mode switching

---

## 15. Definition of Done

- [ ] `evaluationContractRegistry.ts` exists with contracts for all 16 document types
- [ ] Every contract has: allowed_dimensions, forbidden_dimensions, permitted_blockers, convergence_rules
- [ ] Evaluation prompts derive from contracts — no ad-hoc text in pipeline
- [ ] Evidence-bound blockers enforced (confidence + evidence_spans required)
- [ ] Stale blocker detection implemented (3+ identical passes suppress)
- [ ] MAX_ITERATIONS hard cap at 10 with convergence_force flag
- [ ] Production draft forbidden_dimensions preventing exposition notes
- [ ] Rubric violation logging and retry mechanism
- [ ] All IEL events firing for evaluation lifecycle
- [ ] Missing contract raises UNCONFIGURED_DOC_TYPE error (fail closed)
