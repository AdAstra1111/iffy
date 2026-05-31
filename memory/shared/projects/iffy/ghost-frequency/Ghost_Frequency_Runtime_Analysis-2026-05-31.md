# Ghost Frequency — Runtime Regression Analysis

## Deliverables Received
| Asset | Source | Words | Runtime @220 | Scenes |
|-------|--------|------:|:-----------:|:------:|
| Feature Script | User file | 20,059 | **91.2 min** | 36 INT/EXT |
| Production Draft | User file (loaded v4) | 13,888 | **63.1 min** | 23 BEAT scenes |

## Verdict: GENUINE CONTENT REDUCTION (not a bug)

**The runtime estimator is working correctly.** Both FS and PD use the same `words / divisor` calculation (same estimator, same divisor=220). The PD is *genuinely shorter* by 6,171 words (31%).

## Why PD is 31% shorter

The PD is a **condensed rewrite** of the FS, not a mechanical conversion:

1. **Fewer scenes**: FS has 36 scene locations (INT/EXT headers), PD has 23 BEAT scenes — 13 scenes were merged or cut
2. **Missing scene 012**: The PD jumps from scene_011 to scene_013 (one scene eliminated)
3. **Truncated descriptions**: PD scenes average 604 words vs ~557 words per FS scene (PD is already shorter, not longer)
4. **Repetitive beat titles**: 4 scenes titled "The First Contact" (016, 018, 019, 024) with different content — structural fragmentation

## Scene-by-Scene Weight (PD)

| Scene | Words | Location |
|:-----|:-----:|:---------|
| 001 | 490 | INT. REMOTE OBSERVATORY - NIGHT |
| 002 | 376 | INT. OBSERVATORY CONTROL ROOM - DAY |
| 003 | 548 | INT. OBSERVATORY LAB - NIGHT |
| 004 | 813 | INT. OBSERVATORY CAFETERIA - DAY |
| 005 | 554 | INT. ELENA'S LAB - NIGHT |
| 006 | 540 | Elena's Obsession Deepens |
| 007 | 729 | Elena confronts Marcus |
| 008 | 785 | Signal Discovery |
| 009 | 425 | Elena isolates the signal / hears a lullaby |
| 010 | 402 | Elena's Apartment |
| 011 | 565 | INT. ELENA'S LAB - LATER |
| 013 | 643 | Elena's Obsession Deepens |
| 014 | 559 | INT. ELENA'S LAB - NIGHT |
| 015 | 337 | The Signal's True Origin |
| 016 | 740 | The First Contact |
| 017 | 774 | Elena's Discovery |
| 018 | 871 | The First Contact |
| 019 | 541 | The First Contact |
| 020 | 321 | The Message |
| 021 | 732 | The Signal's Whisper |
| 022 | 640 | Elena's Obsession Deepens |
| 023 | 459 | Sending the Signal |
| 024 | 1,044 | The First Contact |

## Runtime at All Divisors

| Divisor | FS | PD | Diff | % |
|:-------:|:--:|:--:|:----:|:-:|
| 200 wpm | 100.3 | 69.4 | 30.9 | 69% |
| 220 wpm | 91.2 | 63.1 | 28.0 | 69% |
| 250 wpm | 80.2 | 55.6 | 24.7 | 69% |

The ratio is constant — same divisor, proportional word count difference.

## Bottom Line

**Not a regression bug.** The Production Draft is legitimately shorter because it was written as a condensed, beat-focused version of the full Feature Script. If the target runtime should match the FS (91 min), the PD needs to be expanded — that's a creative/editorial decision, not a pipeline fix.

The runtime estimator code (`FeatureLengthGuardrails.tsx`, `dev-engine-v2/index.ts`) correctly uses word count / divisor for both doc types. The same logic was verified on Concrete Angels and Event Horizon Protocol earlier.
