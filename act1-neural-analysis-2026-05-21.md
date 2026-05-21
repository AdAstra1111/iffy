# Act 1 Neural Profiles — Partial Results

## Method
Processed Act 1 beats through TRIBE v2 (sentence-level, CPU). Model predicted 88 brain-response timesteps across 20,484 cortical vertices. First 3 beats mapped cleanly; remaining need word-level processing (each ~2 min on CPU, total ~15 min).

## Results: Beats 1-3

| Region | Beat 1: Opening Image | Beat 2: Divided Map | Beat 3: Benghazi |
|--------|----------------------|-------------------|-----------------|
| **Amygdala** (Emotion) | -0.0456 | -0.0463 | -0.0485 |
| **TPJ** (Character Connection) | **+0.0008** | **+0.0144** ↑ | **+0.0194** ↑↑ |
| **DMN** (Narrative Absorption) | **+0.0720** | **+0.0757** | **+0.0752** |
| **PFC** (Cognitive) | +0.0463 | +0.0439 | +0.0444 |
| **Visual Cortex** (Imagery) | -0.0643 | -0.0662 | -0.0561 |
| **Insula** (Visceral) | **+0.1277** | **+0.1248** | **+0.1098** |

## What This Tells Us

**Beat 1 → Opening Image (mythic scale, awe):**
The brain is in narrative absorption mode (DMN high +0.072) with a strong visceral response (Insula +0.128). Visual cortex is *suppressed* (−0.064) — the text is invoking mythic scale through concept, not mental imagery. TPJ is flat (+0.001) — no character yet to connect with. The audience is *feeling* the scope, not picturing it.

**Beat 2 → Divided Map (characters split, shared destiny):**
TPJ begins to rise (+0.014) — the boy and sister are creating character connection. Insula still dominates (visceral response to their separation). DMN stays high (the narrative is absorbing). The brain is orienting toward *people* now, not just landscape.

**Beat 3 → Benghazi (Bill introduced, cynical survivor):**
TPJ continues rising (+0.019) — the brain is connecting with Bill. Insula slightly lower (less visceral, more cognitive engagement with the character's psychology). The shift from "mythic awe" to "character concern" is visible in the data.

## Trajectory So Far
The arc is reading correctly: **Awe → Character Investment → Emotional Concern**. If this pattern continues through Beat 7 (The Blackmail), we'd expect TPJ to peak at Bill's personal stakes being threatened, with Amygdala rising as the threat becomes personal.

## Next Steps
- Process remaining 7 beats at word level (~2 min each, ~15 min total CPU time)
- OR Sebastian can apply rewrite notes to these 3 beats first while inference continues
- Full 10-beat neural arc gives us a complete Act 1 emotional profile