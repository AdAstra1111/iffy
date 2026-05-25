/**
 * evaluationContractRegistry.ts
 *
 * Canonical Evaluation Contract Registry for all IFFY document types.
 *
 * Every document type that participates in the evaluation pipeline has a typed
 * EvaluationContract defining:
 *   - What dimensions to evaluate (allowed_dimensions)
 *   - What dimensions to NEVER evaluate (forbidden_dimensions — firewall)
 *   - Valid blocker conditions (permitted_blockers with evidence requirements)
 *   - Convergence rules (when to stop rewriting)
 *   - Confidence threshold (minimum confidence to surface a note)
 *
 * Contracts are the SINGLE SOURCE OF TRUTH for evaluation. The auto-run
 * pipeline derives prompts from contracts via buildEvalPrompt() — it does NOT
 * use ad-hoc prompt text.
 *
 * Missing contract for an evaluated doc_type raises UNCONFIGURED_DOC_TYPE
 * — evaluation fails closed.
 *
 * @see IFFY-EVALUATION-SPEC.md for the canonical specification
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DimensionDef {
  name: string;
  /** Relative importance within this contract (0.0–1.0) */
  weight: number;
  /** Specific evaluation questions to answer */
  criteria: string[];
  /** Minimum confidence floor for this dimension (0.0–1.0) */
  minConfidence: number;
}

export interface BlockerDef {
  /** Human-readable condition description */
  condition: string;
  /** What evidence must support this blocker */
  requiredEvidence: string[];
  /** Maximum times this blocker fires per evaluation pass */
  maxInstances: number;
}

export interface ConvergenceRule {
  /** Convergence strategy type */
  type: 'exhaustion' | 'threshold' | 'manual';
  /** Condition description for when convergence is met */
  condition: string;
  /** Maximum iterations before forced convergence */
  maxIterations: number;
}

export interface EvidenceBoundBlocker {
  type: 'blocker';
  /** Falsifiable claim — must be objective, not subjective */
  claim: string;
  /** Exact quote or structural reference from the document */
  evidence: string;
  /** Specific spans in the document supporting the evidence */
  evidence_spans: Array<{
    start: string;
    text: string;
  }>;
  /** Confidence level (0.0–1.0); < 0.5 is suppressed */
  confidence: number;
  /** Optional remediation suggestion */
  remediation?: string;
  /** Which dimension this blocker belongs to */
  dimension: string;
}

export interface EvaluationContract {
  docType: string;
  /** Dimensions to evaluate */
  allowedDimensions: DimensionDef[];
  /** Firewall — never evaluate these dimensions */
  forbiddenDimensions: string[];
  /** Valid blocker conditions for this document type */
  permittedBlockers: BlockerDef[];
  /** When to stop evaluating */
  convergenceRules: ConvergenceRule[];
  /** Minimum confidence to surface a note (0.0–1.0) */
  confidenceThreshold: number;
  /** Minimum evidence spans required per blocker */
  minEvidenceSpans: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function contract(
  docType: string,
  allowed: DimensionDef[],
  forbidden: string[],
  blockers: BlockerDef[],
  convergence: ConvergenceRule[],
  threshold = 0.5,
  minSpans = 1,
): EvaluationContract {
  return {
    docType,
    allowedDimensions: allowed,
    forbiddenDimensions: forbidden,
    permittedBlockers: blockers,
    convergenceRules: convergence,
    confidenceThreshold: threshold,
    minEvidenceSpans: minSpans,
  };
}

function dim(
  name: string,
  weight: number,
  criteria: string[],
  minConfidence = 0.5,
): DimensionDef {
  return { name, weight, criteria, minConfidence };
}

function blocker(
  condition: string,
  requiredEvidence: string[],
  maxInstances = 1,
): BlockerDef {
  return { condition, requiredEvidence, maxInstances };
}

function convergeExhaustion(maxIterations = 10): ConvergenceRule {
  return {
    type: 'exhaustion',
    condition:
      'All blocker counts decreasing or flat AND no new blocker types in last 2 iterations AND (all notes resolved OR remaining notes stale — same blocker firing 3+ times)',
    maxIterations,
  };
}

function convergeThreshold(condition: string, maxIterations = 8): ConvergenceRule {
  return {
    type: 'threshold',
    condition,
    maxIterations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LADDER DOCUMENT TYPE CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 1. Idea / Logline
 * Initial concept stage — evaluates premise engine only. No scene/character depth.
 */
const IDEA_CONTRACT: EvaluationContract = contract(
  'idea',
  [
    dim('clarity_of_premise', 0.30, [
      'Is there a clear protagonist with a basic want or goal?',
      'Is there an opposition source or antagonist force?',
      'Is there a premise engine — the core dramatic situation that generates the story?',
    ]),
    dim('hook_strength', 0.25, [
      'Does the logline or premise generate curiosity?',
      'Is the central dramatic question compelling?',
    ]),
    dim('market_differentiation', 0.20, [
      'Is the concept distinct from obvious comps?',
      'Is there a clear audience implied?',
      'Is genre/format declared?',
    ]),
    dim('emotional_core_clarity', 0.15, [
      'Is the emotional through-line of the premise clear?',
      'Is the central character relationship or tension identifiable?',
    ]),
    dim('series_sustainability', 0.10, [
      '(Series only) Can the premise sustain multiple episodes?',
      'Is there a renewable conflict engine?',
    ]),
  ],
  [
    'Structure, character depth, dialogue, scene construction',
    'Escalation path details, relationship dynamics specifics, protagonist backstory',
    'Theme integration, market positioning detail',
  ],
  [
    blocker(
      'Premise is incoherent — no discernible story-generating conflict',
      ['Quote showing the premise statement', 'Explanation of why it lacks conflict generation'],
      1,
    ),
    blocker(
      'No identifiable hook — logline fails to create curiosity or dramatic question',
      ['The premise text as written', 'What hook element is missing'],
      1,
    ),
    blocker(
      'No target audience implied — format/genre unclear',
      ['Genre/format declaration or lack thereof', 'Implied audience from context'],
      1,
    ),
    blocker(
      'Series format mismatch — premise is single-event forced into series structure',
      ['Premise description', 'Why it does not support series format'],
      1,
    ),
  ],
  [convergeExhaustion(6)],
  0.5,
  1,
);

/**
 * 2. Concept Brief
 * One-pager expanding the idea — narrative clarity and genre positioning focused.
 */
const CONCEPT_BRIEF_CONTRACT: EvaluationContract = contract(
  'concept_brief',
  [
    dim('narrative_clarity', 0.30, [
      'Is the narrative direction clearly described?',
      'Is the central conflict well-defined?',
      'Are protagonist/antagonist dynamics articulated?',
    ]),
    dim('genre_positioning', 0.20, [
      'Is genre clearly stated and consistent throughout?',
      'Are genre conventions acknowledged or subverted intentionally?',
    ]),
    dim('tone_lock', 0.15, [
      'Is the tonal register defined and consistent?',
      'Is there a clear emotional palette for the project?',
    ]),
    dim('comp_titles', 0.15, [
      'Are comparable titles or references provided?',
      'Do comps illuminate the project rather than substitute for it?',
    ]),
    dim('central_conflict_definition', 0.20, [
      'Is the primary dramatic conflict clearly stated?',
      'Are the stakes established?',
      'Is there a clear central dramatic question?',
    ]),
  ],
  [
    'Script mechanics, scene construction, character arc details',
    'Dialogue quality, line-level execution',
    'Production feasibility, budget implications',
  ],
  [
    blocker(
      'Central conflict undefined — no clear dramatic tension between protagonist/antagonist',
      ['Text describing the conflict', 'Why it is insufficiently defined'],
      1,
    ),
    blocker(
      'Tone is ambiguous or contradictory with the stated genre',
      ['Statement of tone/genre', 'Text that contradicts the tone declaration'],
      1,
    ),
    blocker(
      'Genre mismatch with format — stated genre is incompatible with format expectations',
      ['Declared genre', 'Format context' , 'Explanation of the mismatch'],
      1,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  1,
);

/**
 * 3. Character Bible
 * Character development architecture — depth, arcs, relationships.
 */
const CHARACTER_BIBLE_CONTRACT: EvaluationContract = contract(
  'character_bible',
  [
    dim('character_depth', 0.25, [
      'Does each major character have clear wants vs needs in conflict?',
      'Is there a core contradiction for each principal character?',
      'Is there a specific formative wound for each character?',
      'Is there a public mask vs private self distinction?',
    ]),
    dim('arc_design', 0.20, [
      'Does each principal have a clear transformation arc?',
      'Are internal and external arc trajectories distinct?',
      'Is there a defined starting point and resolution point?',
    ]),
    dim('relationship_dynamics', 0.20, [
      'Are key relationship axes between characters mapped?',
      'Are power dynamics, tensions, and dependencies specified?',
      'Are emotional stakes of relationships clear?',
    ]),
    dim('thematic_integration', 0.15, [
      'Does each character embody a thematic question or tension?',
      'Is the ensemble thematic function coherent?',
    ]),
    dim('development_utility', 0.20, [
      'Is the bible specific enough to generate downstream documents?',
      'Are character details actionable for beat sheet, outline, or script?',
    ]),
  ],
  [
    'Plot specifics, dialogue style, scene mechanics',
    'Market positioning, commercial packaging language',
    'Production format specifics',
  ],
  [
    blocker(
      'Character motivation contradicts backstory — no internal logic chain',
      ['Stated motivation', 'Backstory evidence', 'Explanation of contradiction'],
      3,
    ),
    blocker(
      'Arc trajectory absent for one or more principal characters',
      ['Character name', 'What is missing from their arc' , 'Why this blocks development'],
      5,
    ),
    blocker(
      'Relationship dynamics insufficiently defined — no tension axes between key characters',
      ['Characters involved', 'Existing relationship text', 'What is missing'],
      3,
    ),
  ],
  [convergeExhaustion(10)],
  0.5,
  2,
);

/**
 * 4. Treatment
 * Narrative prose document — story in act-by-act summary form.
 */
const TREATMENT_CONTRACT: EvaluationContract = contract(
  'treatment',
  [
    dim('narrative_arc', 0.25, [
      'Is there a clear beginning, middle, and end?',
      'Does the story progress through identifiable acts?',
      'Is there a coherent dramatic through-line?',
    ]),
    dim('act_structure', 0.20, [
      'Is the act structure coherent? (3-act with optional 2a/2b bisection for film)',
      'Does each act serve its dramatic function?',
      'Are the act transitions motivated?',
    ]),
    dim('dramatic_tension', 0.20, [
      'Is there a clear tension curve that escalates?',
      'Are there identifiable stakes at each stage?',
    ]),
    dim('pacing', 0.15, [
      'Is the narrative momentum balanced across acts?',
      'Are slower and faster passages intentionally placed?',
    ]),
    dim('key_scene_beats', 0.20, [
      'Are the major story beats present (inciting incident, midpoint, climax)?',
      'Do key scene descriptions convey narrative function?',
    ]),
  ],
  [
    'Dialogue quality, action line formatting, slugline aesthetics',
    'Scene-level detail that belongs in beat sheet or outline',
    'Production formatting, budget analysis',
  ],
  [
    blocker(
      'Acts do not form coherent dramatic arc in sequence',
      ['Act summaries', 'Why the progression breaks'],
      1,
    ),
    blocker(
      'Tension curve is flat or missing — no dramatic escalation across acts',
      ['Tension description per act', 'What escalation is missing'],
      1,
    ),
    blocker(
      'Pacing is unbalanced — one act dominates runtime without dramatic justification',
      ['Relative act lengths', 'Pacing issue explanation'],
      1,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  1,
);

/**
 * 5. Story Outline
 * Plot architecture — scene-by-scene structure and progression logic.
 */
const STORY_OUTLINE_CONTRACT: EvaluationContract = contract(
  'story_outline',
  [
    dim('structural_architecture', 0.25, [
      'Is the scene sequence structurally sound?',
      'Does the outline follow a clear dramatic arc?',
    ]),
    dim('scene_progression', 0.20, [
      'Does each scene advance the plot or character development?',
      'Are transitions between scenes motivated?',
    ]),
    dim('escalation_logic', 0.20, [
      'Do stakes escalate through the sequence?',
      'Are reversals and turning points appropriately placed?',
    ]),
    dim('thematic_spine', 0.15, [
      'Does the outline support a coherent thematic through-line?',
      'Are thematic beats distributed across the story?',
    ]),
    dim('act_break_placement', 0.20, [
      'Are act breaks at dramatically effective positions?',
      'Does each act end with a compelling hook or question?',
    ]),
  ],
  [
    'Dialogue quality, line-level prose, description detail',
    'Character voice, specific blocking or camera directions',
    'Market positioning, budget analysis',
  ],
  [
    blocker(
      'Scene sequence has gaps — 2+ consecutive scenes without clear dramatic purpose',
      ['Scene descriptions', 'Explanation of the gap'],
      2,
    ),
    blocker(
      'No identifiable escalation across scenes — flat narrative line',
      ['Escalation indicators', 'What is missing'],
      1,
    ),
    blocker(
      'Act break placements feel arbitrary without dramatic justification',
      ['Act break positions', 'Why they are problematic'],
      2,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  1,
);

/**
 * 6. Beat Sheet
 * Scene-by-scene beat structure — dramatic progression and pacing.
 */
const BEAT_SHEET_CONTRACT: EvaluationContract = contract(
  'beat_sheet',
  [
    dim('beat_progression', 0.25, [
      'Do beats follow a logical dramatic progression?',
      'Is each beat a distinct story event, not filler?',
    ]),
    dim('dramatic_escalation', 0.25, [
      'Does tension escalate from beat to beat?',
      'Are emotional peaks distributed effectively?',
    ]),
    dim('turning_points', 0.20, [
      'Are major turning points identified and dramatically effective?',
      'Do act-level beats signal structural transitions?',
    ]),
    dim('structural_completeness', 0.30, [
      'Are all required structural beats present?',
      'Does the beat sequence form a complete dramatic arc?',
    ]),
  ],
  [
    'Prose quality, description aesthetic quality',
    'Dialogue line-level evaluation',
    'Market positioning, budget analysis',
  ],
  [
    blocker(
      'Beats do not form a coherent dramatic progression — gaps between events',
      ['Beat sequence excerpts', 'Missing connection explanation'],
      2,
    ),
    blocker(
      'No identifiable escalation pattern — beats are flat in intensity',
      ['Beat emotional indicators', 'Flatness explanation'],
      1,
    ),
    blocker(
      'Missing required structural beats (inciting incident, midpoint, climax)',
      ['What is missing', 'Where it should appear'],
      2,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  1,
);

/**
 * 7. Feature Script
 * Full screenplay — structural integrity, character motivation, dialogue, scene progression.
 */
const FEATURE_SCRIPT_CONTRACT: EvaluationContract = contract(
  'feature_script',
  [
    dim('classical_structure_integrity', 0.20, [
      'Is the 3-act structure properly executed?',
      'Are act breaks in the right place?',
      'Does escalation follow expected structural beats?',
    ]),
    dim('internal_coherence', 0.25, [
      'Does story logic hold throughout?',
      'Do character choices flow from their motivations?',
      'Does cause-and-effect track across scenes?',
    ]),
    dim('character_motivation_clarity', 0.20, [
      'Are character actions motivated by established wants/needs?',
      'Are character choices consistent with their established personality?',
    ]),
    dim('scene_progression_logic', 0.20, [
      'Does each scene advance plot or character development?',
      'Are scene transitions motivated and clear?',
    ]),
    dim('dialogue_naturalism', 0.15, [
      'Does dialogue sound natural and character-specific?',
      'Is subtext present where appropriate?',
    ]),
  ],
  [
    'Production formatting specifics, budget implications',
    'Market analysis, commercial viability assessment',
    'Format compliance (industry standard)',
  ],
  [
    blocker(
      'Scenes do not advance plot or character — 2+ consecutive scenes that stall momentum',
      ['Scene descriptions', 'Why they stall'],
      3,
    ),
    blocker(
      'Character motivation breaks at a key juncture — action contradicts established psychology',
      ['Character action', 'Established motivation' , 'Contradiction explanation'],
      3,
    ),
    blocker(
      'Dialogue is uniformly flat across 3+ scenes — all characters sound identical',
      ['Dialogue excerpts from 3+ scenes', 'Why they lack differentiation'],
      1,
    ),
    blocker(
      'Internal coherence broken — cause and effect do not track across scenes',
      ['Scene sequence', 'Coherence break explanation'],
      2,
    ),
  ],
  [convergeExhaustion(10)],
  0.5,
  2,
);

/**
 * 8. Production Draft
 * Production-planning document — department-head specificity only.
 * ANTI-EXPOSITION RULE: NEVER flag for exposition. This is a HARD constraint.
 */
const PRODUCTION_DRAFT_CONTRACT: EvaluationContract = contract(
  'production_draft',
  [
    dim('production_readiness', 0.25, [
      'Are scene blocks and action lines specific enough for department heads?',
      'Is scene-level detail sufficient for budgeting and scheduling?',
    ]),
    dim('scene_feasibility', 0.20, [
      'Is every scene executable within declared budget and format?',
      'Are exigency problems flagged (VFX, stunts, specialty locations)?',
    ]),
    dim('department_head_clarity', 0.20, [
      'Are action descriptions unambiguous for production designer, costume, sound?',
      'Are prop cues, SFX/VFX markers, and scene-specific production notes explicit?',
    ]),
    dim('schedule_implications', 0.10, [
      'Are scene lengths, location counts, and cast requirements flagged for scheduling?',
      'Are complex setups identified?',
    ]),
    dim('continuity', 0.10, [
      'Are scene-to-scene transitions clear?',
      'Are continuity errors across scenes absent?',
    ]),
    dim('format_compliance', 0.10, [
      'Are sluglines correctly formatted with scene numbers, location, time of day?',
      'Is the document in standard screenplay production format?',
    ]),
    dim('production_cues', 0.05, [
      'Are essential production annotations present (SFX, VFX, practical effects, stunt notes)?',
      'Are annotations appropriate without over-annotating routine action?',
    ]),
  ],
  [
    '"Too much exposition" — **EVER BLOCKED**. Extended action lines describe physical details for dept heads.',
    'Artistic quality, narrative originality, dialogue literary quality',
    'Market comparison, creative vision evaluation',
  ],
  [
    blocker(
      'Scene numbering has gaps — sequence is non-contiguous',
      ['Slugline sequence showing gaps' , 'Missing scene numbers identified'],
      1,
    ),
    blocker(
      'Sluglines missing location or time of day — department heads cannot plan',
      ['Incomplete slugline examples' , 'What is missing'],
      5,
    ),
    blocker(
      'Continuity breaks between scenes — physical detail contradicts across cuts',
      ['Two scene descriptions that conflict' , 'Contradiction explanation'],
      3,
    ),
    blocker(
      'Format violates industry standard — margins, scene numbering, or character cues incorrect',
      ['Format example' , 'Specific violation'],
      3,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  2,
);

/**
 * 9. Episode Beats (Series)
 * Beat sheets for series episodes — episodic structure and hooks.
 */
const EPISODE_BEATS_CONTRACT: EvaluationContract = contract(
  'episode_beats',
  [
    dim('beat_progression', 0.25, [
      'Do beats form a coherent episode arc?',
      'Is each beat a distinct story event?',
    ]),
    dim('hook_design', 0.20, [
      'Does the cold open or first beat hook the viewer?',
      'Is there an effective teaser or opening gambit?',
    ]),
    dim('act_break_cliffhanger', 0.20, [
      'Do act breaks end with compelling questions or cliffhangers?',
      'Are commercial break hooks designed for retention?',
    ]),
    dim('escalation_within_episode', 0.20, [
      'Does tension escalate within the episode runtime?',
      'Are beats paced for the 30/60-minute format?',
    ]),
    dim('episode_identity', 0.15, [
      'Does the episode have a standalone identity within the season arc?',
      'Are episode-specific themes or conflicts present?',
    ]),
  ],
  [
    'Dialogue quality, line-level prose',
    'Character voice details, scene-level blocking',
    'Market positioning, production format',
  ],
  [
    blocker(
      'Beat sequence lacks dramatic progression — beats are flat or repetitive',
      ['Beat sequence', 'Why progression is flat'],
      2,
    ),
    blocker(
      'Act breaks do not function as hooks — transitions lack dramatic tension',
      ['Act break points', 'What is missing'],
      2,
    ),
    blocker(
      'Episode lacks standalone identity — indistinguishable from other episodes in outline',
      ['Episode description', 'Comparison to other episodes'],
      1,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  1,
);

/**
 * 10. Episode Script
 * Script for a series episode — same as feature script with episodic structure.
 */
const EPISODE_SCRIPT_CONTRACT: EvaluationContract = contract(
  'episode_script',
  [
    dim('classical_structure_integrity', 0.15, [
      'Is the act structure correctly executed for the episode runtime?',
      'Are act breaks in dramatically effective positions?',
    ]),
    dim('internal_coherence', 0.20, [
      'Does episode-internal logic hold?',
      'Do character choices track within the episode?',
    ]),
    dim('character_motivation_clarity', 0.15, [
      'Are character actions motivated by episode and season context?',
    ]),
    dim('episodic_structure', 0.15, [
      'Is there a cold open or teaser that hooks?',
      'Are act break cliffhangers designed for commercial retention?',
    ]),
    dim('season_arc_integration', 0.20, [
      'Does this episode advance the season arc?',
      'Are seasonal storylines progressed, not just reset?',
    ]),
    dim('dialogue_naturalism', 0.15, [
      'Is dialogue character-specific and natural?',
      'Is subtext present where appropriate?',
    ]),
  ],
  [
    'Production formatting for industry standard',
    'Budget implications, market analysis',
    'Feature-film pacing logic',
  ],
  [
    blocker(
      'Episode lacks standalone identity — functions only as plot delivery',
      ['Episode content', 'Why it has no independent identity'],
      1,
    ),
    blocker(
      'Act breaks do not function as hooks — missing cliffhanger tension between acts',
      ['Act break points', 'What is missing'],
      2,
    ),
    blocker(
      'Season arc not advanced — episode resets to status quo without progression',
      ['Episode ending', 'Arc progression evidence'],
      1,
    ),
    blocker(
      'Character motivation breaks within the episode — inconsistent writing',
      ['Character action', 'Motivation context', 'Contradiction'],
      2,
    ),
  ],
  [convergeExhaustion(10)],
  0.5,
  2,
);

/**
 * 11. Format Rules
 * Vertical drama format constraints — structural/production document.
 */
const FORMAT_RULES_CONTRACT: EvaluationContract = contract(
  'format_rules',
  [
    dim('episode_duration_compliance', 0.20, [
      'Are min/max durations specified?',
      'Do durations align with canonical format qualifications?',
    ]),
    dim('episode_count_alignment', 0.15, [
      'Does the rule set match the project season_episode_count?',
      'Are count constraints realistic for the format?',
    ]),
    dim('structural_episode_template', 0.20, [
      'Is there a clear hook duration, act count, and cliffhanger position?',
      'Is beat density per episode specified?',
    ]),
    dim('platform_distribution_specs', 0.15, [
      'Are format constraints tied to specific delivery platform?',
      'Are exhibition context requirements specified?',
    ]),
    dim('production_constraints', 0.15, [
      'Are location limits, cast size per episode, shot complexity documented?',
    ]),
    dim('vertical_specifics', 0.15, [
      '(Vertical only) Is scroll-optimised pacing addressed?',
      'Are mobile-first shot framing rules present?',
      'Are in-episode hook rules specified?',
    ]),
  ],
  [
    'Season arc content, character descriptions, episode story content',
    'Market data, narrative quality evaluation',
    'Creative evaluation of narrative depth — Format Rules are intentionally non-narrative',
  ],
  [
    blocker(
      'Out-of-scope content detected — format rules contain season arc, character, or market data',
      ['Out-of-scope content excerpt', 'Why it violates scope'],
      3,
    ),
    blocker(
      'Episode duration or count ranges missing — cannot plan production',
      ['Missing spec', 'What is needed'],
      1,
    ),
    blocker(
      'Vertical-specific constraints missing for vertical drama format',
      ['Missing constraint list', 'Why needed'],
      1,
    ),
  ],
  [convergeExhaustion(6)],
  0.5,
  1,
);

/**
 * 12. Season Arc
 * Season-level arc — episode progression and thematic spine.
 */
const SEASON_ARC_CONTRACT: EvaluationContract = contract(
  'season_arc',
  [
    dim('episode_episode_progression', 0.25, [
      'Do episodes build on each other in sequence?',
      'Is there cumulative tension across the season?',
    ]),
    dim('arc_climax_placement', 0.20, [
      'Is the climax placed at the optimal season position?',
      'Are pre-climax and resolution phases proportioned?',
    ]),
    dim('subplot_interleaving', 0.20, [
      'Are subplots distributed across the episode sequence?',
      'Do subplots intersect the main arc at meaningful points?',
    ]),
    dim('emotional_escalation', 0.20, [
      'Does emotional intensity build across the season?',
      'Are breather episodes placed for pacing?',
    ]),
    dim('character_arc_integration', 0.15, [
      'Are character arcs tracked across the season?',
      'Do internal and external arcs resolve?',
    ]),
  ],
  [
    'Dialogue quality, scene-level execution',
    'Production constraints, episode-specific formatting',
    'Market analysis',
  ],
  [
    blocker(
      'Episodes lack cumulative tension — each episode resets without building',
      ['Episode sequence summary', 'Why no cumulative build'],
      1,
    ),
    blocker(
      'Climax placement feels arbitrary — not supported by preceding episode escalation',
      ['Climax episode context', 'Preceding episodes', 'Arbitrariness explanation'],
      1,
    ),
    blocker(
      'Subplots do not intersect main arc — running in parallel without connection',
      ['Subplot descriptions', 'Connection gaps'],
      2,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  1,
);

/**
 * 13. Episode Grid
 * Grid of all episodes with 8-field canonical format.
 */
const EPISODE_GRID_CONTRACT: EvaluationContract = contract(
  'episode_grid',
  [
    dim('structural_completeness', 0.25, [
      'Does every episode have all 8 required fields?',
      'Are fields correctly ordered?',
    ]),
    dim('hook_specificity', 0.20, [
      'Is HOOK a specific opening action/event — not a mood description?',
      'Is HOOK distinct from TONE for each entry?',
    ]),
    dim('escalation_curve', 0.20, [
      'Do episode hooks/escalation build from premiere to finale?',
      'Is there a recognisable intensity curve?',
    ]),
    dim('cliffhanger_quality', 0.20, [
      'Is each CLIFFHANGER specific and unresolved?',
      'Do CLIFFHANGERS create genuine forward pull?',
    ]),
    dim('arc_position_alignment', 0.15, [
      'Are ARC POSITION labels aligned with actual episode function?',
      'Is the arc progression coherent across labels?',
    ]),
  ],
  [
    'Scene breakdowns, dialogue, character backstory',
    'Season-wide arc descriptions beyond episode entries',
    'Narrative prose depth — this is a structural planning document',
  ],
  [
    blocker(
      'Missing episode numbers or gaps in episode count',
      ['Episode list', 'Gaps identified'],
      1,
    ),
    blocker(
      'Templated/generic entries — episodes not individually specified',
      ['Generic entry examples', 'Why they are insufficient'],
      5,
    ),
    blocker(
      'Range summaries used instead of individual episode entries',
      ['Range summary examples', 'Missing episodes'],
      3,
    ),
    blocker(
      'Missing required field — one of 8 canonical fields absent',
      ['Missing field name', 'Episode entry'],
      8,
    ),
    blocker(
      'HOOK contains mood/feeling description instead of specific opening action',
      ['HOOK entry', 'What it should be'],
      5,
    ),
    blocker(
      'TONE contains action/event instead of emotional register word/phrase',
      ['TONE entry', 'What it should be'],
      5,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  1,
);

/**
 * 14. Vertical Episode Beats
 * Beat sheets for vertical drama episodes.
 * CRITICAL: Hook-first mandate, cliffhanger mandate, minimum beat density.
 */
const VERTICAL_EPISODE_BEATS_CONTRACT: EvaluationContract = contract(
  'vertical_episode_beats',
  [
    dim('beat_density', 0.20, [
      'Does every episode have minimum 4 beats within its duration window?',
      'Is each beat a story change — not a line of dialogue?',
    ]),
    dim('scroll_stop_hook', 0.25, [
      'Is Beat 1 a new, self-contained hook for THIS episode?',
      'Does Beat 1 exploit carry-in tension without resolving the prior cliffhanger?',
    ]),
    dim('micro_cliffhanger', 0.25, [
      'Does every episode end with a forward-pulling micro-cliffhanger?',
      'Does the cliffhanger create urgency for the next episode?',
    ]),
    dim('escalation_intensity', 0.15, [
      'Does beat intensity escalate within each episode?',
      'Are emotional shifts mapped per beat?',
    ]),
    dim('character_agency', 0.15, [
      'Does character action drive each beat?',
      'Are characters active, not passive?',
    ]),
  ],
  [
    'Full dialogue/scripted scenes — belongs in Season Script',
    'Episode-level structural overview — belongs in Episode Grid',
    'Character descriptions — belongs in Character Bible',
  ],
  [
    blocker(
      'Episode opens by resolving previous episode\'s cliffhanger — Beat 1 must be new hook',
      ['Episode opening beat', 'Resolution content' , 'Required hook-first pattern'],
      1,
    ),
    blocker(
      'Episode has no micro-cliffhanger ending — every episode must end with forward pull',
      ['Episode ending beat', 'What is missing'],
      1,
    ),
    blocker(
      'Episode has fewer than 4 beats — minimum density not met',
      ['Beat count', 'Episode duration', 'Missing beats'],
      3,
    ),
    blocker(
      'Beat describes season structure instead of this specific episode\'s events',
      ['Beat text', 'Why it is season-level'],
      3,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  2,
);

/**
 * 15. Season Script (Vertical Drama)
 * Full-season continuous script for vertical drama.
 */
const SEASON_SCRIPT_CONTRACT: EvaluationContract = contract(
  'season_script',
  [
    dim('canon_consistency', 0.25, [
      'Do characters and relationships match the Character Bible?',
      'Is the world/canon consistent across episodes?',
    ]),
    dim('emotional_escalation', 0.20, [
      'Does each episode escalate emotionally from the previous?',
      'Is season-level emotional progression coherent?',
    ]),
    dim('hook_immediacy', 0.15, [
      'Does every episode start with an immediate hook in opening lines?',
      'Are hooks distinct — not repetitive patterns?',
    ]),
    dim('cliffhanger_quality', 0.20, [
      'Does every episode end with a cliffhanger?',
      'Are cliffhangers varied — not the same device repeated?',
    ]),
    dim('arc_alignment', 0.20, [
      'Does each episode align with its Episode Grid entry?',
      'Are season arc milestones hit at correct episodes?',
    ]),
  ],
  [
    'Feature-film pacing logic — vertical drama has different pace',
    'Production formatting standards for traditional film',
    'Budget analysis, market positioning',
  ],
  [
    blocker(
      'Character inconsistent with canon — personality, relationship, or backstory broken',
      ['Inconsistent text', 'Canon source', 'Contradiction explanation'],
      5,
    ),
    blocker(
      'Episode lacks immediate hook in opening lines — audience retention risk',
      ['Opening lines', 'Why no hook'],
      3,
    ),
    blocker(
      'Episode missing cliffhanger ending — viewer has no reason to continue',
      ['Episode ending', 'What is missing'],
      3,
    ),
    blocker(
      'Episode deviates from Episode Grid or Season Arc without justification',
      ['Grid entry', 'Actual content', 'Deviation explanation'],
      3,
    ),
  ],
  [convergeExhaustion(10)],
  0.5,
  2,
);

/**
 * 16. Documentary Outline
 * Story structure for documentary — editorial approach and thematic coherence.
 */
const DOCUMENTARY_OUTLINE_CONTRACT: EvaluationContract = contract(
  'documentary_outline',
  [
    dim('narrative_structure', 0.25, [
      'Is there a coherent narrative arc for the documentary?',
      'Does the structure support the subject matter naturally?',
    ]),
    dim('subject_access', 0.20, [
      'Is the access/subject relationship clearly described?',
      'Are interview subjects or primary sources identified?',
    ]),
    dim('thematic_coherence', 0.25, [
      'Are the documentary themes clearly articulated?',
      'Do themes build on each other across the arc?',
    ]),
    dim('editorial_approach', 0.30, [
      'Is the editorial point of view defined?',
      'Are ethical considerations addressed?',
      'Is the filmmaking approach (observational, participatory, expository) specified?',
    ]),
  ],
  [
    'Invented characters, fabricated scenes, INT./EXT. sluglines — never fabricate',
    'Dramatised dialogue or fictional elements',
    'Market analysis, production budget specifics',
  ],
  [
    blocker(
      'No identifiable narrative arc — documentary lacks dramatic through-line',
      ['Subject description', 'Structural outline', 'Missing arc explanation'],
      1,
    ),
    blocker(
      'Fabricated elements — invented characters or scenes not based on real subjects/events',
      ['Fabricated element', 'Why it is fabricated'],
      3,
    ),
    blocker(
      'Thematic coherence absent — central subject is not unified by identifiable themes',
      ['Subject exploration', 'Theme gap explanation'],
      1,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  1,
);

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT DOCUMENT TYPE CONTRACTS
// (Non-ladder docs that still get evaluated)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Market Sheet
 * Commercial viability document — GP primary axis.
 */
const MARKET_SHEET_CONTRACT: EvaluationContract = contract(
  'market_sheet',
  [
    dim('audience_targeting', 0.25, [
      'Is the target demographic precisely defined?',
      'Is audience specificity demonstrated?',
    ]),
    dim('comparable_titles', 0.20, [
      'Are comps current (last 5 years)?',
      'Are comps genuinely comparable in format/tone/budget?',
      'Is the comparison used to make a real positioning argument?',
    ]),
    dim('market_gap_angle', 0.20, [
      'Does the sheet articulate why THIS project fills a gap?',
      'Is the unique selling proposition clear?',
    ]),
    dim('budget_alignment', 0.15, [
      'Is the budget band realistic for the format and scale?',
    ]),
    dim('distribution_strategy', 0.10, [
      'Are distribution channels named and plausible?',
    ]),
    dim('revenue_model', 0.10, [
      'Does the sheet address revenue model (streaming, licensing, presales, etc.)?',
    ]),
  ],
  [
    'Narrative execution quality, character depth, plot specifics',
    'Creative vision, dialogue, performance analysis',
    'Script-level evaluation',
  ],
  [
    blocker(
      'No identifiable target audience — demographic undefined',
      ['Audience description', 'What is missing'],
      1,
    ),
    blocker(
      'Comparables missing or inaccurate — comps not current or not genuinely comparable',
      ['Comp list', 'Why each fails'],
      3,
    ),
    blocker(
      'Commercial case unconvincing — no market gap argument or revenue model',
      ['Commercial argument', 'What is missing'],
      1,
    ),
  ],
  [convergeExhaustion(6)],
  0.5,
  1,
);

/**
 * Vertical Market Sheet
 * Mobile-first short-form drama market sheet.
 */
const VERTICAL_MARKET_SHEET_CONTRACT: EvaluationContract = contract(
  'vertical_market_sheet',
  [
    dim('platform_targeting', 0.25, [
      'Are specific mobile/vertical platforms named?',
      'Is audience size and content fit rationale provided?',
    ]),
    dim('audience_demographics', 0.20, [
      'Is the target viewer precisely described?',
      'Are age, platform behaviour, viewing context specified?',
    ]),
    dim('comparable_vertical_titles', 0.15, [
      'Are comps recent vertical-format series?',
      'Do comps have performance data or audience signals?',
    ]),
    dim('monetisation_model', 0.15, [
      'Is monetisation addressed (ad revenue, creator fund, brand deal, licensing)?',
    ]),
    dim('episode_economics', 0.15, [
      'Is cost-per-episode vs expected revenue at scale addressed?',
    ]),
    dim('cultural_fit', 0.10, [
      'Does the project align with current content appetite on named platforms?',
    ]),
  ],
  [
    'Narrative craft evaluation, traditional film/TV market elements',
    'Creative depth assessment',
  ],
  [
    blocker(
      'Platform fit not demonstrated — no named platforms or audience rationale',
      ['Platform discussion', 'What is missing'],
      1,
    ),
    blocker(
      'Monetisation model absent — no credible revenue path described',
      ['Revenue discussion', 'Missing model'],
      1,
    ),
    blocker(
      'No comparable vertical-format comps — comps are from traditional media, not vertical',
      ['Comp list', 'Format mismatch explanation'],
      2,
    ),
  ],
  [convergeExhaustion(6)],
  0.5,
  1,
);

/**
 * Deck / Pitch Document
 * Visual presentation and narrative sellability.
 */
const DECK_CONTRACT: EvaluationContract = contract(
  'deck',
  [
    dim('presentation_clarity', 0.25, [
      'Is the vision clearly communicated?',
      'Is the deck scannable and visually structured?',
    ]),
    dim('narrative_sellability', 0.25, [
      'Does the narrative summary hook the reader?',
      'Is the story compelling at a high level?',
    ]),
    dim('audience_hook', 0.20, [
      'Is there a clear audience entry point?',
      'Does the deck make the case for why this matters?',
    ]),
    dim('visual_appeal', 0.15, [
      'Is the visual language compelling?',
      'Are references and comps visually presented?',
    ]),
    dim('positioning_angle', 0.15, [
      'Is the unique angle articulated?',
      'Does the deck differentiate from competitors?',
    ]),
  ],
  [
    'Script mechanics, production budget specifics',
    'Distribution specifics at pitch stage',
    'Scene-level evaluation',
  ],
  [
    blocker(
      'No clear sellable angle — deck fails to articulate why this project matters',
      ['Positioning section', 'Missing angle'],
      1,
    ),
    blocker(
      'Comps do not position the project — references without positioning argument',
      ['Comp presentation', 'Missing argument'],
      2,
    ),
    blocker(
      'Narrative summary fails to hook — story description is flat or confusing',
      ['Narrative section', 'Hook failure explanation'],
      1,
    ),
  ],
  [convergeExhaustion(6)],
  0.5,
  1,
);

/**
 * Visual Project Bible
 * Deterministic visual assembly document — NOT narrative.
 */
const VISUAL_PROJECT_BIBLE_CONTRACT: EvaluationContract = contract(
  'visual_project_bible',
  [
    dim('visual_tone', 0.15, [
      'Is overall visual identity specific?',
      'Are palette/mood references clear?',
    ]),
    dim('world_visual_language', 0.15, [
      'Are rules of the visual world defined?',
      'Is environmental identity coherent?',
    ]),
    dim('character_visual_profiles', 0.15, [
      'Are principal characters visually specified with clear differentiation?',
    ]),
    dim('wardrobe_system', 0.10, [
      'Is wardrobe logic defined with silhouette, material, color, state logic?',
    ]),
    dim('location_language', 0.15, [
      'Are locations visually specified with mood, palette, texture?',
      'Is production design character defined?',
    ]),
    dim('motif_system', 0.10, [
      'Are recurring visual motifs identified?',
      'Are motifs meaningfully integrated?',
    ]),
    dim('cinematography_principles', 0.10, [
      'Are camera, lens, framing, movement, and lighting rules defined?',
    ]),
    dim('reference_frames', 0.10, [
      'Are visual references contextualized and useful?',
    ]),
  ],
  [
    'Logline, premise, narrative themes, dramatic structure',
    'Dialogue, screenplay formatting, scene construction',
    'Market analysis, budget',
  ],
  [
    blocker(
      'Missing or vague coverage in a domain — one of 8 domains has insufficient specificity',
      ['Domain name', 'Existing content', 'What is missing'],
      8,
    ),
    blocker(
      'Contradictory visual systems — elements across domains conflict (e.g., palette vs. location language)',
      ['Conflicting elements', 'Contradiction explanation'],
      3,
    ),
    blocker(
      'References not contextualized — images without explanation of their relevance',
      ['Reference examples', 'Missing context'],
      5,
    ),
  ],
  [convergeExhaustion(10)],
  0.5,
  1,
);

/**
 * Topline Narrative
 * Synopsis + logline + story pillars overview.
 */
const TOPLINE_NARRATIVE_CONTRACT: EvaluationContract = contract(
  'topline_narrative',
  [
    dim('logline_clarity', 0.20, [
      'Is the logline clear, compelling, and specific?',
      'Does it convey protagonist, conflict, and stakes?',
    ]),
    dim('synopsis_coherence', 0.20, [
      'Is the short synopsis coherent?',
      'Does the long synopsis provide adequate detail?',
    ]),
    dim('story_pillar_completeness', 0.20, [
      'Are story pillars defined?',
      'Do pillars cover the key narrative dimensions?',
    ]),
    dim('theme_stakes_articulation', 0.20, [
      'Are themes and stakes clearly articulated?',
      'Is the central dramatic question present?',
    ]),
    dim('series_promise', 0.20, [
      '(Series) Is the series engine/promise defined?',
      'Is the season arc snapshot provided?',
    ]),
  ],
  [
    'Scene construction, dialogue, prose quality',
    'Production format specifics',
    'Budget and market analysis',
  ],
  [
    blocker(
      'Logline missing core elements — protagonist, conflict, or stakes absent',
      ['Logline text', 'Missing component explanation'],
      1,
    ),
    blocker(
      'Synopsis incoherent — narrative summary does not form a clear story',
      ['Synopsis text', 'Coherence gap explanation'],
      1,
    ),
  ],
  [convergeExhaustion(6)],
  0.5,
  1,
);

/**
 * Season Master Script
 * Compiled season scripts — evaluated for structural consistency across episodes.
 */
const SEASON_MASTER_SCRIPT_CONTRACT: EvaluationContract = contract(
  'season_master_script',
  [
    dim('cross_episode_consistency', 0.25, [
      'Are characters consistent across all compiled episodes?',
      'Are continuity details tracked between episodes?',
    ]),
    dim('season_arc_execution', 0.25, [
      'Does the compiled script execute the season arc?',
      'Are arc milestones hit at correct positions?',
    ]),
    dim('tonal_coherence', 0.20, [
      'Is tone consistent across all episodes?',
      'Are tonal shifts intentional and motivated?',
    ]),
    dim('pacing_across_episodes', 0.15, [
      'Is the season-level pacing balanced?',
      'Are intensity peaks and valleys distributed for the format?',
    ]),
    dim('structural_completeness', 0.15, [
      'Does the compiled script have complete scenes and transitions between episodes?',
    ]),
  ],
  [
    'Individual dialogue line evaluation at episode level',
    'Production formatting',
    'Market positioning',
  ],
  [
    blocker(
      'Cross-episode character inconsistency — character behaves differently across compiled episodes',
      ['Episode references', 'Contradiction explanation'],
      5,
    ),
    blocker(
      'Season arc not executed — compiled episodes do not collectively serve the arc',
      ['Arc document reference', 'Execution gap'],
      1,
    ),
  ],
  [convergeExhaustion(8)],
  0.5,
  2,
);

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete registry of all evaluation contracts.
 *
 * Keyed by canonical docType string (matching BASE_DOC_TYPES keys).
 */
export const EVALUATION_CONTRACTS: Record<string, EvaluationContract> = {
  // ── Ladder document types ──
  idea:                            IDEA_CONTRACT,
  concept_brief:                   CONCEPT_BRIEF_CONTRACT,
  character_bible:                 CHARACTER_BIBLE_CONTRACT,
  treatment:                       TREATMENT_CONTRACT,
  story_outline:                   STORY_OUTLINE_CONTRACT,
  beat_sheet:                      BEAT_SHEET_CONTRACT,
  feature_script:                  FEATURE_SCRIPT_CONTRACT,
  production_draft:                PRODUCTION_DRAFT_CONTRACT,
  episode_beats:                   EPISODE_BEATS_CONTRACT,
  episode_script:                  EPISODE_SCRIPT_CONTRACT,
  format_rules:                    FORMAT_RULES_CONTRACT,
  season_arc:                      SEASON_ARC_CONTRACT,
  episode_grid:                    EPISODE_GRID_CONTRACT,
  vertical_episode_beats:          VERTICAL_EPISODE_BEATS_CONTRACT,
  season_script:                   SEASON_SCRIPT_CONTRACT,
  documentary_outline:             DOCUMENTARY_OUTLINE_CONTRACT,

  // ── Output / additional document types ──
  market_sheet:                    MARKET_SHEET_CONTRACT,
  vertical_market_sheet:           VERTICAL_MARKET_SHEET_CONTRACT,
  deck:                            DECK_CONTRACT,
  visual_project_bible:            VISUAL_PROJECT_BIBLE_CONTRACT,
  topline_narrative:               TOPLINE_NARRATIVE_CONTRACT,
  season_master_script:            SEASON_MASTER_SCRIPT_CONTRACT,
};

// ═══════════════════════════════════════════════════════════════════════════
// LADDER TYPE ENUMERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set of all canonical doc types that participate in the evaluation pipeline.
 *
 * Derived from the source-of-truth ladder definitions in documentLadders.ts.
 * These are the types that MUST have contracts — evaluation fails closed otherwise.
 */
export const LADDER_EVALUATION_TYPES: ReadonlySet<string> = new Set([
  'idea',
  'concept_brief',
  'character_bible',
  'treatment',
  'story_outline',
  'beat_sheet',
  'feature_script',
  'production_draft',
  'episode_beats',
  'episode_script',
  'format_rules',
  'season_arc',
  'episode_grid',
  'vertical_episode_beats',
  'season_script',
  'documentary_outline',
]);

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export class UnconfiguredDocTypeError extends Error {
  constructor(docType: string) {
    super(`UNCONFIGURED_DOC_TYPE: No evaluation contract found for "${docType}"`);
    this.name = 'UnconfiguredDocTypeError';
  }
}

/**
 * Validates that every ladder document type has a registered contract.
 *
 * Used at startup / test time to ensure the registry is complete.
 * Fails closed — any missing contract throws an error.
 *
 * @param additionalTypes Optional set of additional types that should have contracts
 *   (e.g., output document types that get evaluated)
 * @returns Array of ValidationResult for each checked type
 * @throws UnconfiguredDocTypeError if any required type is missing
 */
export function validateAllContracts(
  additionalTypes?: ReadonlySet<string>,
): Array<{ docType: string; hasContract: boolean }> {
  const requiredTypes = new Set(LADDER_EVALUATION_TYPES);

  if (additionalTypes) {
    for (const t of additionalTypes) {
      requiredTypes.add(t);
    }
  }

  const results: Array<{ docType: string; hasContract: boolean }> = [];

  for (const docType of requiredTypes) {
    const hasContract = docType in EVALUATION_CONTRACTS;
    results.push({ docType, hasContract });

    if (!hasContract) {
      throw new UnconfiguredDocTypeError(docType);
    }
  }

  return results;
}

/**
 * Retrieves the evaluation contract for a given document type.
 *
 * @param docType Canonical document type key
 * @returns The EvaluationContract
 * @throws UnconfiguredDocTypeError if no contract exists
 */
export function getContract(docType: string): EvaluationContract {
  const contract = EVALUATION_CONTRACTS[docType];
  if (!contract) {
    throw new UnconfiguredDocTypeError(docType);
  }
  return contract;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Builds a deterministic evaluation prompt from a contract.
 *
 * This is the SINGLE function that derives evaluation prompts from contracts.
 * No ad-hoc prompt text should exist in the pipeline — always use this function.
 *
 * @param contract The evaluation contract for the document type
 * @param formatHint Optional format context (e.g., "film", "tv-series")
 * @returns A complete evaluation prompt string
 */
export function buildEvalPrompt(
  contract: EvaluationContract,
  formatHint?: string,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Evaluation: ${contract.docType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`);
  if (formatHint) {
    lines.push(`Format: ${formatHint}`);
  }
  lines.push('');

  // Scoring dimensions
  lines.push('## Allowed Dimensions');
  for (const dim of contract.allowedDimensions.sort((a, b) => b.weight - a.weight)) {
    lines.push(`\n### ${dim.name} (weight: ${Math.round(dim.weight * 100)}%)`);
    for (const criterion of dim.criteria) {
      lines.push(`- ${criterion}`);
    }
  }
  lines.push('');

  // Firewall
  lines.push('## Forbidden Dimensions — DO NOT EVALUATE');
  lines.push('The following dimensions are OUT OF SCOPE for this document type:');
  for (const forbidden of contract.forbiddenDimensions) {
    lines.push(`- ${forbidden}`);
  }
  lines.push('');

  // Permitted blockers
  lines.push('## Valid Blockers');
  lines.push('Only the following blocker conditions are valid for this document type:');
  for (const blockerDef of contract.permittedBlockers) {
    lines.push(`\n### ${blockerDef.condition}`);
    lines.push('Required evidence:');
    for (const ev of blockerDef.requiredEvidence) {
      lines.push(`- ${ev}`);
    }
    lines.push(`Maximum instances: ${blockerDef.maxInstances}`);
  }
  lines.push('');

  // Convergence rules
  lines.push('## Convergence Rules');
  for (const rule of contract.convergenceRules) {
    lines.push(`- Type: ${rule.type}`);
    lines.push(`- Condition: ${rule.condition}`);
    lines.push(`- Max iterations: ${rule.maxIterations}`);
  }
  lines.push('');

  // Confidence
  lines.push(`## Confidence Threshold: ${contract.confidenceThreshold * 100}%`);
  lines.push('Notes below this confidence level are suppressed and never surfaced.');

  // Output format
  lines.push('');
  lines.push('## Output Format');
  lines.push('Return structured evaluation with the following fields per note:');
  lines.push('- type: "blocker"');
  lines.push('- dimension: [one of the Allowed Dimensions above]');
  lines.push('- claim: [falsifiable objective statement]');
  lines.push('- evidence: [exact quote or structural reference]');
  lines.push('- evidence_spans: [{ start, text }]');
  lines.push('- confidence: [0.0–1.0]');
  lines.push('- remediation: [optional suggestion]');

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export default EVALUATION_CONTRACTS;
