/**
 * Deterministic Deferral Policy Registry
 *
 * Single source of truth for classifying workflow decisions as
 * BLOCKING_NOW, DEFERRABLE, or NEVER_BLOCKING.
 *
 * NON-NEGOTIABLE INVARIANTS:
 *   1. No LLM-based classification — all rules are deterministic.
 *   2. Format = product discriminator (maps to canonical stage ladders).
 *   3. Decision keys are stable: `${format}:${doc_type}:${semantic_key}`.
 *   4. Canon decisions (decision_ledger) are NOT managed here.
 *   5. This registry is imported by auto-run and dev-engine-v2.
 */ import { getCanonicalNextStage } from "./ladder-invariant.ts";
// ── classifyByAutonomy ──────────────────────────────────────────────────────
// Determines decision classification based on autonomy level and decision mode.
// This is the canonical helper used for ALL decisions (quality, blocking, advisory).
//
// Rules:
// 1. "informational" → NEVER_BLOCKING (silent, no pause)
// 2. "blocking" + "strict"  → BLOCKING_NOW (pauses pipeline for human review)
// 3. "blocking" + "autonomous" → NEVER_BLOCKING (auto-resolved, never blocks)
// 4. "advisory" + "strict"  → BLOCKING_NOW (pauses pipeline for human review)
// 5. "advisory" + "autonomous" → DEFERRABLE (noted, never blocks)
// 6. undefined (no autonomy set) → BLOCKING_NOW in strict, DEFERRABLE in autonomous
export function classifyByAutonomy(autonomy, decisionMode = "strict") {
  if (autonomy === "informational") return "NEVER_BLOCKING";
  if (autonomy === "blocking") {
    return decisionMode === "autonomous" ? "NEVER_BLOCKING" : "BLOCKING_NOW";
  }
  if (autonomy === "advisory") {
    return decisionMode === "autonomous" ? "DEFERRABLE" : "BLOCKING_NOW";
  }
  // No autonomy set — fall back to mode-sensitive default
  return decisionMode === "autonomous" ? "DEFERRABLE" : "BLOCKING_NOW";
}
// ── Quality Decision Autonomy ───────────────────────────────────────────────
// Quality decisions (plateau + ceiling) are NEVER_BLOCKING in all modes.
// This helper reads autonomy from DECISION_DEFS for forward compatibility
// with any future mode-specific quality rules.
export function classifyQualityDecision(decisionMode) {
  // Quality decisions are non-blocking regardless of mode.
  // In strict mode, we silently log the condition but never block the pipeline.
  // In autonomous mode, quality signals are purely informational.
  return "NEVER_BLOCKING";
}
// ── Semantic Keys ──────────────────────────────────────────────────────────
export const SEMANTIC_KEYS = {
  EPISODE_COUNT: "EPISODE_COUNT",
  CAST_LOCK: "CAST_LOCK",
  TONE_POLARITY: "TONE_POLARITY",
  WORLD_RULE_ANCHOR: "WORLD_RULE_ANCHOR",
  FORMAT_RUNTIME: "FORMAT_RUNTIME",
  CONTRACT_LOGIC: "CONTRACT_LOGIC",
  TENTPOLE_MAPPING: "TENTPOLE_MAPPING",
  QUALITY_PLATEAU: "QUALITY_PLATEAU",
  QUALITY_CEILING: "QUALITY_CEILING"
};
// ── Decision Key Builder ───────────────────────────────────────────────────
export function buildDecisionKey(format, docType, semanticKey) {
  return `${format}:${docType}:${semanticKey}`;
}
// ── Decision Definitions ───────────────────────────────────────────────────
export const DECISION_DEFS = {
  EPISODE_COUNT: {
    question: "How many episodes should this season contain?",
    autonomy: "advisory",
    options: [
      {
        value: "8",
        label: "8 episodes"
      },
      {
        value: "10",
        label: "10 episodes"
      },
      {
        value: "12",
        label: "12 episodes"
      },
      {
        value: "24",
        label: "24 episodes"
      },
      {
        value: "35",
        label: "35 episodes"
      }
    ],
    required_evidence_template: [
      {
        doc_type: "concept_brief",
        requires_approval: false
      }
    ],
    default_revisit_stage: "season_arc"
  },
  CAST_LOCK: {
    question: "Should the character roster be locked for script generation?",
    autonomy: "blocking",
    required_evidence_template: [
      {
        doc_type: "character_bible",
        requires_approval: true
      }
    ],
    default_revisit_stage: null
  },
  TONE_POLARITY: {
    question: "What is the dominant tonal register for this project?",
    autonomy: "advisory",
    options: [
      {
        value: "dark",
        label: "Dark / Gritty"
      },
      {
        value: "warm",
        label: "Warm / Hopeful"
      },
      {
        value: "satirical",
        label: "Satirical / Ironic"
      },
      {
        value: "tense",
        label: "Tense / Thriller"
      }
    ],
    required_evidence_template: [
      {
        doc_type: "treatment",
        requires_approval: false
      }
    ],
    default_revisit_stage: "beat_sheet"
  },
  WORLD_RULE_ANCHOR: {
    question: "Are the foundational world rules established and locked?",
    autonomy: "blocking",
    required_evidence_template: [
      {
        doc_type: "treatment",
        requires_approval: true
      }
    ],
    default_revisit_stage: "character_bible"
  },
  FORMAT_RUNTIME: {
    question: "What is the target runtime per episode?",
    autonomy: "advisory",
    options: [
      {
        value: "60",
        label: "~1 minute (vertical)"
      },
      {
        value: "180",
        label: "~3 minutes (short-form)"
      },
      {
        value: "1800",
        label: "~30 minutes (half-hour)"
      },
      {
        value: "3600",
        label: "~60 minutes (hour-long)"
      }
    ],
    required_evidence_template: [
      {
        doc_type: "format_rules",
        requires_approval: false
      }
    ],
    default_revisit_stage: null
  },
  CONTRACT_LOGIC: {
    question: "Is the central narrative contract/premise logically grounded?",
    autonomy: "advisory",
    options: [
      {
        value: "accept",
        label: "Accept — contract is logically grounded"
      },
      {
        value: "reject",
        label: "Reject — contract needs revision"
      }
    ],
    required_evidence_template: [
      {
        doc_type: "story_outline",
        requires_approval: true
      }
    ],
    default_revisit_stage: "beat_sheet"
  },
  TENTPOLE_MAPPING: {
    question: "Are the tentpole/anchor episodes confirmed?",
    autonomy: "advisory",
    required_evidence_template: [
      {
        doc_type: "episode_grid",
        requires_approval: true
      }
    ],
    default_revisit_stage: "season_script"
  },
  QUALITY_PLATEAU: {
    question: "Quality scores have plateaued. Should we proceed to the next stage or continue refining?",
    autonomy: "informational",
    default_value: "proceed",
    options: [
      {
        value: "proceed",
        label: "Proceed to next stage"
      },
      {
        value: "continue",
        label: "Continue refining"
      }
    ],
    required_evidence_template: [],
    default_revisit_stage: null
  },
  QUALITY_CEILING: {
    question: "Content has reached its structural CI ceiling. Current CI is within 8% of the estimated maximum for this format/budget profile.",
    autonomy: "informational",
    default_value: "promote_anyway",
    options: [
      {
        value: "promote_anyway",
        label: "Promote at current CI"
      },
      {
        value: "abandon",
        label: "Abandon"
      },
      {
        value: "adjust_target",
        label: "Adjust target CI"
      }
    ],
    required_evidence_template: [],
    default_revisit_stage: null
  }
};
const VERTICAL_DRAMA_DECISIONS = {
  format_rules: {
    blocking: [
      "FORMAT_RUNTIME"
    ],
    deferrable: []
  },
  character_bible: {
    blocking: [
      "CAST_LOCK"
    ],
    deferrable: [
      "TONE_POLARITY"
    ]
  },
  season_arc: {
    blocking: [
      "EPISODE_COUNT"
    ],
    deferrable: [
      "TENTPOLE_MAPPING"
    ]
  },
  episode_grid: {
    blocking: [],
    deferrable: [
      "TENTPOLE_MAPPING"
    ]
  },
  season_script: {
    blocking: [
      "EPISODE_COUNT",
      "CAST_LOCK"
    ],
    deferrable: []
  }
};
const FILM_DECISIONS = {
  treatment: {
    blocking: [],
    deferrable: [
      "TONE_POLARITY",
      "WORLD_RULE_ANCHOR"
    ]
  },
  character_bible: {
    blocking: [
      "CAST_LOCK"
    ],
    deferrable: []
  },
  beat_sheet: {
    blocking: [],
    deferrable: [
      "CONTRACT_LOGIC"
    ]
  },
  feature_script: {
    blocking: [
      "CAST_LOCK",
      "TONE_POLARITY"
    ],
    deferrable: []
  }
};
const TV_SERIES_DECISIONS = {
  treatment: {
    blocking: [],
    deferrable: [
      "TONE_POLARITY",
      "WORLD_RULE_ANCHOR"
    ]
  },
  character_bible: {
    blocking: [
      "CAST_LOCK"
    ],
    deferrable: []
  },
  beat_sheet: {
    blocking: [],
    deferrable: [
      "CONTRACT_LOGIC"
    ]
  },
  episode_script: {
    blocking: [
      "EPISODE_COUNT",
      "CAST_LOCK"
    ],
    deferrable: []
  },
  season_master_script: {
    blocking: [
      "EPISODE_COUNT"
    ],
    deferrable: []
  }
};
export const REQUIRED_DECISIONS_BY_STAGE = {
  "vertical-drama": VERTICAL_DRAMA_DECISIONS,
  "film": FILM_DECISIONS,
  "feature": FILM_DECISIONS,
  "tv-series": TV_SERIES_DECISIONS,
  "limited-series": TV_SERIES_DECISIONS,
  "digital-series": TV_SERIES_DECISIONS,
  "anim-series": TV_SERIES_DECISIONS
};
// ── Classification Logic ───────────────────────────────────────────────────
/**
 * Classify a decision deterministically with autonomy-level and decision-mode awareness.
 *
 * RULES (fail-closed, in order):
 * 1. If semantic_key is not in DECISION_DEFS → NEVER_BLOCKING (unknown key).
 * 2. If evidence is missing → DEFERRABLE (can't decide yet).
 * 3. Autonomy override — evaluate based on autonomy + decision_mode:
 *    - "informational" → NEVER_BLOCKING (silent, both modes)
 *    - "blocking" + "autonomous" → NEVER_BLOCKING (auto-resolved, never blocks)
 *    - "advisory" + "autonomous" → DEFERRABLE (noted, never blocks)
 *    - "blocking" + "strict" → continue to Rule 4
 *    - "advisory" + "strict" → continue to Rule 4
 * 4. Empty-options check: If decision has no options → DEFERRABLE + IEL warning.
 * 5. Otherwise → BLOCKING_NOW (evidence exists, unresolved, has options).
 *
 * RULE ORDERING INVARIANT: Rule 3 (autonomy override) runs BEFORE Rule 4
 * (empty-options guard). This ensures that informational decisions bypass
 * all blocking paths, and that autonomous-mode decisions are not passed
 * through to the empty-options check. CAST_LOCK (blocking, no options) in
 * strict mode: autonomy returns BLOCKING_NOW → empty-options falls through
 * → DEFERRABLE + IEL warning (instead of stalling with no UI options).
 */ export function classifyDecision(semanticKey, ctx) {
  const def = DECISION_DEFS[semanticKey];
  if (!def) {
    return {
      classification: "NEVER_BLOCKING",
      reason: `Unknown decision key: ${semanticKey}`,
      revisit_stage: null
    };
  }
  // Rule 2: Check required evidence availability
  const evidenceMissing = def.required_evidence_template.some((ev)=>{
    const state = ctx.approvals_state[ev.doc_type];
    if (!state || !state.exists) return true;
    if (ev.requires_approval && !state.approved) return true;
    return false;
  });
  if (evidenceMissing) {
    const revisitStage = def.default_revisit_stage || getNextStage(ctx.doc_type, ctx.ladder);
    return {
      classification: "DEFERRABLE",
      reason: `Required evidence not yet available (missing upstream docs/approvals)`,
      revisit_stage: revisitStage
    };
  }
  // Rule 3: Autonomy override — evaluate based on autonomy + decision_mode
  if (def.autonomy) {
    const autoClass = classifyByAutonomy(def.autonomy, ctx.decision_mode);
    if (autoClass !== "BLOCKING_NOW") {
      return {
        classification: autoClass,
        reason: autoClass === "NEVER_BLOCKING" ? `Autonomy=${def.autonomy} in ${ctx.decision_mode} mode — auto-resolved, never blocks` : `Autonomy=${def.autonomy} in ${ctx.decision_mode} mode — deferred`,
        revisit_stage: autoClass === "DEFERRABLE" ? def.default_revisit_stage || null : null
      };
    }
  // BLOCKING_NOW from autonomy — continue to empty-options check
  }
  // Rule 4: Empty-options guard — decision has no selectable options
  if (!def.options || def.options.length === 0) {
    console.warn(`[decision-registry][IEL] empty_options_fallthrough { semantic_key: "${semanticKey}", autonomy: "${def.autonomy || "unset"}", mode: "${ctx.decision_mode}", doc_type: "${ctx.doc_type}", format: "${ctx.format}", action: "DEFERRABLE" }`);
    return {
      classification: "DEFERRABLE",
      reason: `Decision '${semanticKey}' has no options and requires human assessment — deferring for manual review`,
      revisit_stage: def.default_revisit_stage || null
    };
  }
  // Rule 5: Evidence exists, has options, blocking mode — pause
  return {
    classification: "BLOCKING_NOW",
    reason: `Required evidence is available but decision has not been made`,
    revisit_stage: null
  };
}
/**
 * Get required decisions for a given format + doc_type.
 * Returns empty arrays if format/doc_type not in registry (fail-open for unknown combos).
 */ export function getRequiredDecisions(format, docType) {
  const formatMap = REQUIRED_DECISIONS_BY_STAGE[format];
  if (!formatMap) return {
    blocking: [],
    deferrable: []
  };
  return formatMap[docType] || {
    blocking: [],
    deferrable: []
  };
}
/**
 * Build the full decision key for DB storage.
 */ export function buildPendingDecisionKey(format, docType, semanticKey) {
  return `${format}:${docType}:${semanticKey}`;
}
// ── Helpers ────────────────────────────────────────────────────────────────
function getNextStage(currentDocType, ladder) {
  // Delegate to shared invariant guard — prevents self-loops, reverse progression, unresolved stages
  return getCanonicalNextStage({
    ladder,
    currentStage: currentDocType,
    format: "unknown",
    source: "decisionPolicyRegistry"
  });
}
/**
 * Quality Plateau Detection.
 *
 * Returns true if CI/GP are high but stagnating.
 * This is a deterministic check — no LLM involved.
 */ export function isQualityPlateau(params) {
  const { ci, gp, previousCi, previousGp, consecutiveHighScoreAttempts } = params;
  // High scores
  if (ci < 85 || gp < 85) return false;
  // Stagnating (delta < 3 across attempts)
  const ciDelta = Math.abs(ci - previousCi);
  const gpDelta = Math.abs(gp - previousGp);
  if (ciDelta >= 3 || gpDelta >= 3) return false;
  // Multiple attempts at high score without meaningful improvement
  return consecutiveHighScoreAttempts >= 3;
}
