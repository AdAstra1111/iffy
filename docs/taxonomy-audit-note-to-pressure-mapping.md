# IFFY Development Notes → Pressure Type Taxonomy Mapping

**Purpose:** Map every REAL IFFY development note (from production code, Oscar tests, YETI data, and the Failure Archive) to the 8 pressure types for the taxonomy audit.

**Date:** May 27, 2026 | **Sources:** Failure Archive (FC-001–010), Phase 1A Regression Report, codebase note generators, API schema

---

## The 8 Pressure Types (from task context)

| # | Pressure Type | What It Does |
|---|---------------|-------------|
| 1 | **Clarity pressure** | Demands explicitness; flags ambiguity, opacity, or withheld information as defects |
| 2 | **Contradiction pressure** | Flags internal inconsistency; demands coherence between elements that may intentionally conflict |
| 3 | **Propulsion pressure** | Demands forward momentum; flags stillness, repetition, or slow passages as pacing defects |
| 4 | **Tonal normalization pressure** | Demands single-register consistency; flags tonal modulation/shifts as inconsistency |
| 5 | **Structural pressure** | Demands recognizable structure; flags structural experimentation or absence as underdevelopment |
| 6 | **Atmosphere pressure** | Demands sensory/setting specificity; flags genre-conforming atmosphere; can flatten unconventional mood |
| 7 | **Completeness pressure** | Demands all elements be "filled in"; flags intentional absence/negative space as missingness |
| 8 | **Flattening / optimization pressure** | Universal notes that demand "more" of anything — infinite optimization generator, never converges |

---

## REAL NOTE EXAMPLES MAPPED TO PRESSURE TYPES

### 1. CLARITY PRESSURE (Demands explicitness, flags ambiguity as defect)

| Note Key | Category | Severity | Description | Source |
|----------|----------|----------|-------------|--------|
| `clarify_rose_character_arc` | character | high | "Rose's transformation and motivations could be more clearly signposted to enhance emotional payoff." | FC-001 / Get Out (Oscar test) |
| `unclear_character_motivation_for_ivan` | character | blocker | "Ivan's motivations and internal conflicts are underexplored, making his actions sometimes feel inconsistent or underdeveloped." | FC-003 / Anora (Oscar test) |
| `clarify_character_motivation` | character | polish | "Could be clarified" — universal pattern on weak script | Phase 1A weak-script test |
| `clarify_russian_dialogue_usage` | dialogue | high | "Specific, actionable, production-aware" (legitimate — not mode-blind) | Phase 1A / Anora |
| `scene_clarity_in_complex_interactions` | structural | blocker | Flagged scene clarity in Parasite's complex ensemble interactions (eliminated post-Phase 1A) | Phase 1A / Parasite (before) |
| `confusing_character_introductions` | character | high | "Legitimate note about character accessibility" | Phase 1A / Anora |

**Pressure signature:** These notes all treat *intentional* ambiguity, opacity, or withheld information as defects requiring clarification. The reviewer expects explicitness as a universal good.

**What they kill:** Structural ambiguity, audience participation, dramatic withholding, character opacity as dramatic engine.

---

### 2. CONTRADICTION PRESSURE (Flags intentional internal conflict as inconsistency)

| Note Key | Category | Severity | Description | Source |
|----------|----------|----------|-------------|--------|
| `unclear_character_motivation_for_ivan` | character | blocker | "Ivan's actions sometimes feel inconsistent" — treats character opacity as contradiction | FC-003 / Anora |
| `class_a_spine_story_engine` | structural | blocker | Spine drift detection — legitimate *or* contradiction pressure depending on whether the spine is intentionally subverted | narrative-spine-v1.md |
| `class_a_spine_protagonist_arc` | structural | blocker | Spine drift on protagonist arc — same ambiguity as above | narrative-spine-v1.md |
| `backstory_consistency` | character | — | Character bible rubric: "Flag inconsistencies in backstory across documents" | notes.ts docTypeNoteScopes |

**Pressure signature:** These notes flag contradictions between elements that may be in intentional tension. The reviewer expects all story elements to cohere into a single reading.

**What they kill:** Character complexity that comes from internal contradiction, narrative ambiguity, intentional tension between story elements.

---

### 3. PROPULSION PRESSURE (Demands forward momentum; flags stillness/repetition as pacing defects)

| Note Key | Category | Severity | Description | Source |
|----------|----------|----------|-------------|--------|
| `middle_act_pacing_lull` (Anora) | pacing | blocker | "Extended party and drug-use montages in the middle act slow down the narrative momentum and reduce dramatic urgency." | FC-004 / Anora (survived Phase 1A) |
| `middle_act_pacing_lull` (Get Out) | pacing | blocker | The hypnosis sequence flagged as pacing problem (eliminated post-Phase 1A) | Phase 1A / Get Out (before) |
| `pacing_dip_in_mid_act_two` | pacing | blocker | Parasite's intentionally modulated pacing flagged as defect (eliminated post-Phase 1A) | Phase 1A / Parasite (before) |
| `third_act_escalation_redundancy` | escalation | blocker | Anora third act escalation flagged as redundant (eliminated post-Phase 1A) | Phase 1A / Anora (before) |
| `weak_act2_midpoint` | structural | blocker | "Example given in notes prompt for stable keys" | notes.ts prompt |
| `escalation_curve` | escalation | — | Episode grid rubric: "Evaluate escalation curve quality" — legitimate craft note but can become propulsion pressure | notes.ts docTypeNoteScopes |

**Pressure signature:** These notes treat scenes that don't advance external plot as "lulls" or pacing defects. They demand every scene push the story forward.

**What they kill:** Repetition as dramatic pressure, mood as meaning, character-pressure drama where nothing external happens but internal pressure accumulates.

---

### 4. TONAL NORMALIZATION PRESSURE (Demands single-register consistency; flags tonal modulation)

| Note Key | Category | Severity | Description | Source |
|----------|----------|----------|-------------|--------|
| `character_voice_consistency_ki_tek` | character | blocker | "Ki-Tek's dialogue occasionally shifts between overly sentimental and awkwardly comedic, which can undermine her character." | FC-002 / Parasite |
| `character_voice_consistency` (Get Out) | character | blocker | Character voice consistency flagged as blocker (eliminated post-Phase 1A) | Phase 1A / Get Out (before) |
| `refine_bill_blackstone_voice_consistency` | character | blocker / polish | YETI: Bill Blackstone voice consistency appeared at BOTH blocker and polish severity (duplicate severity) | FC-008 / YETI |
| `tonal_modulation` | character | high | "While tonal shifts between humor and drama are a strength, some transitions..." — LEGITIMATE note that recognizes modulation as strength first | Phase 1A / Parasite (after) |
| `increase_tonal_balance_with_dark_humor` | character | blocker / polish | YETI: "Insufficient dark humor integration" — same note at two severity levels | FC-008 / YETI |
| `voice_distinctiveness` | character | — | Character bible rubric: "Evaluate voice distinctiveness" — can become tonal normalization | notes.ts docTypeNoteScopes |

**Pressure signature:** These notes treat tonal range within a single character as "inconsistency" rather than intentional modulation. The reviewer expects characters to stay in one register.

**What they kill:** Tonal modulation as performance, character complexity (being able to shift registers), genre-hybrid storytelling.

---

### 5. STRUCTURAL PRESSURE (Demands recognizable structure; flags unconventional forms)

| Note Key | Category | Severity | Description | Source |
|----------|----------|----------|-------------|--------|
| `insufficient_dark_humor_integration` | character/tonal | blocker | YETI: Demands more genre-conforming structural element — dark humor integration | Task description + FC-008 |
| `screenplay_format_violation` | format | blocker | Atmosphere pair: flagged prose format as non-screenplay (correct for deliverable-type check, but structural pressure if applied to intentionally hybrid form) | FC-010 |
| `no_character_presence` | format | blocker | Atmosphere pair: flagged literary prose for lacking characters — correct for screenplay evaluation, but structural flattening | FC-010 |
| `no_dramatic_action` | format | blocker | Atmosphere pair: flagged atmospheric prose for lacking dramatic action | FC-010 |
| `weak_structural_progression` | structural | blocker | Weak-script test: correctly identified weak structure (legitimate) | Phase 1A / weak-script |
| `ineffective_scene_dynamics` | scene | blocker | Weak-script test: correctly identified ineffective scenes (legitimate) | Phase 1A / weak-script |
| `clarify_russian_dialogue_usage` | dialogue | high | Anora: "Specific, actionable, production-aware" — legitimate structural note | Phase 1A / Anora |
| `arc_structure` | structural | — | Season arc rubric: "Evaluate arc architecture" — legitimate but can become structural conformity pressure | notes.ts docTypeNoteScopes |

**Pressure signature:** These notes demand works conform to recognizable structural patterns — screenplay format, genre conventions, act structures. When applied to works that intentionally deviate, they flatten.

**What they kill:** Structural experimentation, genre subversion, format hybridity, structural absence as dramatic choice.

---

### 6. ATMOSPHERE PRESSURE (Demands sensory specificity; can flatten unconventional mood)

| Note Key | Category | Severity | Description | Source |
|----------|----------|----------|-------------|--------|
| `enhance_visual_motifs` | structural | polish | "Enhance visual motifs" — universal note pattern, could apply to any work | FC-007 / Phase 1B universal note |
| `enhance_visual_subtext` | visual | high | Get Out: "Could be further leveraged" — universal pattern, eliminated post-Phase 1A | Phase 1A / Get Out (before) |
| `phone_battery_plot_device` | structural | high | Get Out: "Positive recognition of a working motif with a specific suggestion" — legitimate atmosphere/visual note | Phase 1A / Get Out (after) |
| `rose_character_shift_clarity` | character | high | Get Out: "Rose's transition... is abrupt and could be visually foreshadowed" — legitimate craft note about visual execution | Phase 1A / Get Out (after) |
| `andre_logan_voice_shift` | character | high | Get Out: "Specific performance note" — legitimate | Phase 1A / Get Out (after) |
| `auction_scene_tension` | scene | high | Get Out: "Specific, actionable, non-flattening" — legitimate atmosphere note | Phase 1A / Get Out (after) |
| `lack_of_visual_showing` | visual | high | Weak-script test: "Lack of visual showing" — legitimate craft note | Phase 1A / weak-script |

**Pressure signature:** Universal "enhance" notes that demand more sensory/vivid writing regardless of whether the work's atmosphere is already intentional. Also, notes about visual motifs that can be applied infinitely.

**What they kill:** Restrained atmosphere, intentionally sparse visual language, atmosphere that derives from absence rather than presence.

---

### 7. COMPLETENESS PRESSURE (Demands all elements be "filled in"; flags absence)

| Note Key | Category | Severity | Description | Source |
|----------|----------|----------|-------------|--------|
| `missing_character_depth` (Daughter) | character | blocker/high | "Missing character depth" — 19 notes persisted across 15 versions for the intentionally absent Daughter | FC-006 / The Last Lightkeeper |
| `character_needs_emotional_articulation` (Daughter) | character | blocker/high | "Character needs emotional articulation" — treating designed absence as underdevelopment | FC-006 / The Last Lightkeeper |
| `relationship_with_daughter_not_mapped` | character | blocker/high | "Relationship with daughter not mapped" — demanding mapping of an intentionally absent relationship | FC-006 / The Last Lightkeeper |
| `underdeveloped_character_voice` | character | blocker | Weak-script test: correctly identified genuinely underdeveloped character voice (legitimate) | Phase 1A / weak-script |
| `missing_character` | character | blocker | Character bible rubric: "Flag missing characters as blockers" — can become completeness pressure | notes.ts docTypeNoteScopes |
| `deepen_sophia_holmes_emotional_dimension` | character | blocker / high | YETI: Sophia Holmes emotional dimension — same note at two severity levels | FC-008 / YETI |
| `cast_balance` | character | — | Character bible rubric: "Evaluate cast balance" — can become completeness pressure if demanding more characters | notes.ts docTypeNoteScopes |

**Pressure signature:** These notes treat absence (intentional or not) as a defect that must be "filled in." The reviewer expects every named element to have full articulation.

**What they kill:** Designed absence, negative space, character silence, emergent restraint, stories about absence rather than presence.

---

### 8. FLATTENING / OPTIMIZATION PRESSURE (Universal "could be more" notes — infinite generator)

| Note Key | Category | Severity | Description | Source |
|----------|----------|----------|-------------|--------|
| "Could be further developed" | (varies) | various | "Could be further developed" — universal, applies to any work | FC-007 / Phase 1B |
| "Could be more distinctive" | (varies) | various | "Could be more distinctive" — no completion condition | FC-007 / Phase 1B |
| "Could be clarified" | (varies) | various | "Could be clarified" — infinite, never resolves | FC-007 / Phase 1B |
| `enhance_visual_motifs` | structural | polish | "Enhance visual motifs" — universal, could apply to any work at any stage | FC-007 / Phase 1B |
| "Deepen thematic integration" | (varies) | various | "Deepen thematic integration" — no threshold for "deep enough" | FC-007 / Phase 1B |
| `ambiguous_thematic_intent` | theme | high | Weak-script test: "Ambiguous thematic intent" — legitimate for weak script, but pattern is universal | Phase 1A / weak-script |
| `strengthen_opening_hook` | hook | polish | Get Out: Universal "could be stronger" — eliminated | Phase 1A / Get Out (before) |
| `ghost_iteration` (system behavior) | pipeline | N/A | YETI: 6 ghost versions generated after authoritative version set — optimization without improvement | FC-005 / YETI |

**Pressure signature:** These are structurally infinite notes. They can be generated for any work regardless of quality, have no completion threshold, and create convergence pressure without actionable direction.

**What they kill:** Convergence integrity, pipeline efficiency, note quality (they displace specific/actionable notes).

---

## PHASE 1A MODE-SENSITIVE GUIDANCE: WHICH PRESSURES IT ADDRESSES

The Phase 1A mode-sensitive guidance (~50 lines injected into `buildAnalyzeSystem`) tells the reviewer to CONSIDER intentionality before flagging:

| Pressure Target | Guidance Type | Effectiveness |
|-----------------|---------------|---------------|
| **Clarity pressure** (Rose, Ivan) | "Consider whether ambiguity may be intentional" | ✅ Eliminated — Rose note replaced with craft note; Ivan blocker gone |
| **Tonal normalization pressure** (Ki-Tek) | "Consider whether tonal modulation is a feature" | ✅ Eliminated — Ki-Tek blocker gone; replaced with `tonal_modulation` |
| **Propulsion pressure** (pacing lulls) | "Consider whether slow passages carry dramatic weight" | ⚠️ Partial — Get Out/Parasite pacing notes eliminated; Anora party montage survived |
| **Completeness pressure** (Daughter) | "Consider whether unresolved elements may be productive" | ✅ Addressed — inferred from Oscar results |
| **Contradiction pressure** | Covered by ambiguity/opacity guidance | ✅ Partial |
| **Atmosphere pressure** | Not explicitly addressed | ⚠️ Gap — universal "enhance visual" notes still possible |
| **Flattening/optimization** | Not addressed by mode guidance | ⚠️ Requires Phase 1B universal note detection |
| **Structural pressure** | Not explicitly addressed | ⚠️ Gap (but less damaging — structural notes are more often legitimate) |

---

## SUMMARY TABLE: ALL REAL NOTES BY PRESSURE TYPE

### Pressure 1: CLARITY — 6 notes
- `clarify_rose_character_arc` (character, high) — FC-001
- `unclear_character_motivation_for_ivan` (character, blocker) — FC-003
- `clarify_character_motivation` (character, polish) — Phase 1A
- `scene_clarity_in_complex_interactions` (structural, blocker) — Phase 1A/Parasite
- `clarify_russian_dialogue_usage` (dialogue, high) — Phase 1A/Anora (legitimate)
- `confusing_character_introductions` (character, high) — Phase 1A/Anora (legitimate)

### Pressure 2: CONTRADICTION — 4 notes
- `unclear_character_motivation_for_ivan` (character, blocker) — FC-003 (spanning type)
- `class_a_spine_story_engine` (structural, blocker) — narrative-spine
- `class_a_spine_protagonist_arc` (structural, blocker) — narrative-spine
- `backstory_consistency` (character) — notes.ts

### Pressure 3: PROPULSION — 7 notes
- `middle_act_pacing_lull` (pacing, blocker) — FC-004 / Anora
- `middle_act_pacing_lull` (pacing, blocker) — Get Out (before)
- `pacing_dip_in_mid_act_two` (pacing, blocker) — Parasite (before)
- `third_act_escalation_redundancy` (escalation, blocker) — Anora (before)
- `weak_act2_midpoint` (structural, blocker) — notes.ts example
- `escalation_curve` (escalation) — notes.ts rubric
- `hook_quality` / `cliffhanger_strength` — episode grid rubric

### Pressure 4: TONAL NORMALIZATION — 6 notes
- `character_voice_consistency_ki_tek` (character, blocker) — FC-002
- `character_voice_consistency` (character, blocker) — Get Out (before)
- `refine_bill_blackstone_voice_consistency` (character, blocker/polish) — FC-008 / YETI
- `tonal_modulation` (character, high) — Parasite (after, legitimate)
- `increase_tonal_balance_with_dark_humor` (character, blocker/polish) — FC-008 / YETI
- `voice_distinctiveness` (character) — notes.ts rubric

### Pressure 5: STRUCTURAL — 9 notes
- `insufficient_dark_humor_integration` (character, blocker) — FC-008 / YETI
- `screenplay_format_violation` (format, blocker) — FC-010
- `no_character_presence` (format, blocker) — FC-010
- `no_dramatic_action` (format, blocker) — FC-010
- `weak_structural_progression` (structural, blocker) — Phase 1A (legitimate)
- `ineffective_scene_dynamics` (scene, blocker) — Phase 1A (legitimate)
- `arc_structure` (structural) — notes.ts rubric
- `turning_points` (structural) — season arc rubric
- `season_resolution` (structural) — season arc rubric

### Pressure 6: ATMOSPHERE — 6 notes
- `enhance_visual_motifs` (structural, polish) — FC-007
- `enhance_visual_subtext` (visual, high) — Get Out (before)
- `phone_battery_plot_device` (structural, high) — Get Out (after, legitimate)
- `rose_character_shift_clarity` (character, high) — Get Out (after, legitimate)
- `andre_logan_voice_shift` (character, high) — Get Out (after, legitimate)
- `auction_scene_tension` (scene, high) — Get Out (after, legitimate)

### Pressure 7: COMPLETENESS — 7 notes
- `missing_character_depth` (character, blocker) — FC-006 / Daughter
- `character_needs_emotional_articulation` (character, blocker) — FC-006 / Daughter
- `relationship_with_daughter_not_mapped` (character, blocker) — FC-006 / Daughter
- `underdeveloped_character_voice` (character, blocker) — Phase 1A (legitimate)
- `missing_character` (character, blocker) — notes.ts rubric
- `deepen_sophia_holmes_emotional_dimension` (character, blocker/high) — FC-008 / YETI
- `cast_balance` (character) — notes.ts rubric

### Pressure 8: FLATTENING / OPTIMIZATION — 8 notes/system behaviors
- "Could be further developed" (various) — FC-007
- "Could be more distinctive" (various) — FC-007
- "Could be clarified" (various) — FC-007
- `enhance_visual_motifs` (structural, polish) — FC-007 (spanning)
- "Deepen thematic integration" (various) — FC-007
- `strengthen_opening_hook` (hook, polish) — Get Out (before)
- `ambiguous_thematic_intent` (theme, high) — Phase 1A
- `ghost_iteration` (system behavior) — FC-005

---

## NOTE CATEGORIES (from IFFY codebase)

```
blocking_issues / high_impact_notes / polish_notes
```

**Categories:** `structural | character | escalation | lane | packaging | risk | pacing | hook | cliffhanger`

**Per-document-type subcategories:**
- **Character Bible:** `character_depth | arc_clarity | voice_distinctiveness | relationship_dynamics | backstory_consistency | thematic_integration | missing_character | cast_balance`
- **Season Arc:** `arc_structure | escalation | turning_points | character_arc_integration | thematic_spine | series_engine | season_resolution`
- **Episode Grid:** `hook_quality | cliffhanger_strength | escalation_curve | arc_position | episode_count_alignment | core_move_clarity | episode_progress`

**Severities:** `blocker` (gate convergence) | `high` (significant, non-blocking) | `polish` (optional, never block)

---

## KEY INSIGHTS FOR TAXONOMY AUDIT

1. **Most notes span multiple pressure types.** `clarify_rose_character_arc` is clarity pressure AND flattening pressure. `unclear_character_motivation_for_ivan` is clarity AND contradiction pressure.

2. **The most damaging notes cluster in Clarity (6) and Propulsion (7).** These are the two pressure types that killed the most structural sophistication in the Oscar test.

3. **Phase 1A eliminated Clarity and Tonal Normalization pressures almost entirely** (Rose, Ki-Tek, Ivan → gone). Propulsion pressure proved harder to fix (Anora party montage survived).

4. **Completeness pressure is the quietest killer.** The Daughter case proves the system can generate 19 notes across 15 versions for a character who is intentionally absent. The `do_not_resolve` flag was the fix.

5. **Flattening/Optimization pressure affects all other types.** A universal "enhance" note can masquerade as atmosphere, structural, or character pressure. Phase 1B's regex demotion (blocker→high→polish→discard) correctly identifies these as a distinct class.

6. **Structural pressure is the least damaging and most often legitimate.** Most structural notes in the weak-script test were correct. The real risk is when structural conformity is enforced on intentionally unconventional works.

7. **Atmosphere pressure is underexplored.** The FC-010 deliverable-type mismatch contaminated the one atmosphere-focused test. Future pairs must control for format before testing atmosphere pressure.

8. **Contradiction pressure has a legitimate form alongside a flattening form.** The spine check is a legitimate architectural guard (detecting genuine drift). But contradiction pressure becomes flattening when it treats intentional character contradictions (like Ivan) as defects.

---

*End of taxonomy mapping. 53 real note examples across 8 pressure types, sourced from the Failure Archive, Phase 1A Regression Report, codebase note generators, and YETI development data.*