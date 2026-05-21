# ChatGPT Response — Beat Sequential Architecture Expansion

*Received May 19, 2026 — Design consultation on beat_sequential strategy*

## Core Assessment
The proposal is directionally correct. The system correctly identifies the granularity inversion (acts are coarser than beats at the very moment where screenplay detail should be finest). But the proposal still frames beats too textually — they should be **state transitions**, not text chunks.

## Key Recommendations

### 1. Beats as Structured Dramatic Contracts
Not prose, not text — structured `{preconditions → dramatic_pressure → interaction → state_mutation → postcondition}`:

```json
{
  "beat_id": "B12",
  "dramatic_function": "reversal",
  "preconditions": { "sarah_trusts_marcus": true, "letter_unopened": true },
  "required_characters": ["Sarah", "Marcus"],
  "state_mutations": { "sarah_trusts_marcus": false, "coverup_exists": true },
  "tension_delta": +2,
  "scene_targets": [{ "purpose": "discovery", "required_outcome": "Sarah confirms deception" }]
}
```

This makes rewrite propagation deterministic, contradiction detection possible, localized regeneration possible, convergence scoring stronger.

### 2. Parallel Rollout (Don't Replace Sectioned)
Add `feature_script_v2 → beat_sequential` as a new experimental pathway. Run both in parallel to compare: SR scores, convergence quality, canon stability, pacing consistency, rewrite resilience, token economics, latency, continuity integrity.

### 3. Four-Layer Canon System
| Layer | Name | Contents | Behavior |
|-------|------|----------|---------|
| 1 | Immutable Canon | Ages, histories, world rules, geography, permanent relationships, setting laws | Never changes. Always loaded. Small. |
| 2 | Active Narrative State | Emotional states, active objectives, unresolved lies, current location, tension, alliances | Rolling window. Frequently updated. Small. |
| 3 | Historical Compression | Compressed long-term trajectory memory ("Sarah has gradually become distrustful of Marcus since Beat 12") | Preserves narrative continuity without full history. |
| 4 | Episodic Recall | Retrieval-only memory (gun introduced in Beat 4, old photograph from Beat 18) | NOT always loaded. Retrieved only when relevant. Essential for scaling 40-70 beats without context collapse. |

### 4. Dramatic Intent Tracking (Most Important Missing System)
Track what each character is trying to do — not just emotional state:
```json
"active_intents": {
  "Sarah": {
    "visible_goal": "discover truth",
    "hidden_goal": "avoid abandonment",
    "strategy": "pressure Marcus",
    "confidence": 0.7
  }
}
```
Drama emerges from CONFLICTING INTENT, not merely plot facts.

### 5. Multi-Dimensional Tension
Replace single `7/10` with multiple vectors: suspense, emotional intimacy, aggression, mystery, dread, hope, romance, chaos, vulnerability.

### 6. Formalized Character Taxonomy
- **Dramatic**: canonical, recurring, drives story
- **Functional**: temporary utility, occupation-defined, no recurrence, max 3 lines, no major decisions
- **Environmental**: crowd/background only

### 7. Strict Sequential — Never Parallelize
You are generating TIME ITSELF. Parallelization causes emotional desync, pacing divergence, tension incoherence, contradictory causality.

### 8. Structured Canon Only Between Beats
Never pass raw prose. Raw prose causes hallucinated implications, accidental continuity drift, style entropy, hidden contradictions. The old "skip ahead" bug happened because prose continuation encouraged narrative jumping.

### 9. Hybrid Canon Updates
- Programmatic extraction for easy fields (location, time, characters present, objects)
- AI structured output for complex fields (emotional shifts, dramatic reversals, trust changes, plot thread resolution, hidden revelations)

### 10. Scene Generation = Resolve Dramatic State Transition
Not "write pages." Focus prompting on: what must change, what emotional shift must occur, what tension must escalate, what truth must become known, what relationship must mutate.

### 11. Localized Rewrite Propagation (Future)
When Beat 18 changes: regenerate Beat 18, recompute canon, replay downstream beats, preserve unaffected beats. No full-script regeneration.

## Implementation Phases

| Phase | Scope |
|-------|-------|
| **Phase 1** | beat_sequential strategy, sequential chunk execution, beat parsing, structured canon state, hybrid canon updates, beat-level persistence |
| **Phase 2** | Structured beat contracts, intent tracking, canon stratification, dynamic scene-count analysis, beat-level validation |
| **Phase 3** | Narrative dependency graph, localized rewrite replay, contradiction engine, dramatic convergence scoring, state mutation validation |
| **Phase 4** | Production intelligence layer, AI actor integration, scene energy vector analysis, predictive rewrite simulation, narrative risk forecasting |

## Final Assessment
The proposal is already strong but the real future hidden inside it is **Narrative State Machines**, not "AI script chunks." That distinction changes the entire trajectory of the system.
