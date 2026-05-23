import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { computeObligationTopology } from "../_shared/obligation-topology.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type, prefer, accept, origin",
};

// ---------------------------------------------------------------------------
// Types for the demo payload
// ---------------------------------------------------------------------------
interface DemoSceneInput {
  sceneId: string;
  sceneNumber: number;
  title: string;
  actNumber: number;
  sceneText?: string;
  characterKeys?: string[];
}

interface DemoSceneResponse {
  sceneId: string;
  sceneNumber: number;
  title: string;
  actNumber: number;
  tensionField: Record<string, unknown>;
  obligationCharge: Record<string, unknown>;
  deferredIntimacy: Record<string, unknown>;
  narrativeDensity: Record<string, unknown>;
  narrativePressure: number;
  dominantMode: "tension_driven" | "obligation_driven" | "intimacy_driven" | "balanced";
  signals: {
    overpressure: boolean;
    intimacyCritical: boolean;
    obligationOverload: boolean;
    densityAnomaly: boolean;
    narrativeBrief: string;
  };
  actRollup?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errRes(msg: string, status = 400): Response {
  return jsonRes({ error: msg }, status);
}

// ===========================================================================
// BERLIN PROTOCOL — Demo data (10 scenes, 3 acts)
// ===========================================================================

const BERLIN_PROTOCOL_DEMO: DemoSceneResponse[] = [
  // -----------------------------------------------------------------------
  // ACT 1 — Setup  (scenes 1-4)
  // -----------------------------------------------------------------------
  {
    sceneId: "demo-scene-01",
    sceneNumber: 1,
    title: "The Interrogation",
    actNumber: 1,
    tensionField: {
      aggregateScore: 0.85,
      aggregateDirection: "rising",
      gradient: null,
      activeThreadCount: 2,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.85,
          direction: "initial",
          sourceLabel: "interrogation power dynamic",
        },
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.40,
          direction: "initial",
          sourceLabel: "unspoken alliance suspicion",
        },
      ],
      newThreads: [
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.85,
          direction: "initial",
          sourceLabel: "interrogation power dynamic",
        },
      ],
      resolvedThreads: [],
    },
    obligationCharge: {
      chargeScore: 0.40,
      velocity: 2.0,
      overdueCount: 0,
      outstanding: [
        {
          obligationId: "obl-01-001",
          promiseType: "dramatic_question",
          description: "Why was Elara at the restricted archive?",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "dormant",
          fulfilled: false,
        },
      ],
      introduced: [
        {
          obligationId: "obl-01-001",
          promiseType: "dramatic_question",
          description: "Why was Elara at the restricted archive?",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "dormant",
          fulfilled: false,
        },
      ],
      fulfilled: [],
    },
    deferredIntimacy: {
      aggregateIndex: 0.20,
      velocity: 0.0,
      avoidantCharacters: ["elara_vance"],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          intimacyLevel: 0.15,
          deferredIndex: 0.20,
          deferredDimensions: ["deferred_confrontation", "withheld_secret"],
          priorIntimacyLevel: 0.10,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.20,
        },
      ],
      deferredMoments: [
        {
          dimension: "withheld_secret",
          description: "Elara knows more about the archive than she admits",
          characterA: "elara_vance",
          characterB: "commander_holt",
          sceneNumber: 1,
          urgency: 0.30,
          isChekhovSetup: true,
        },
        {
          dimension: "deferred_confrontation",
          description: "Holt's unspoken mistrust of Elara's past",
          characterA: "commander_holt",
          characterB: "elara_vance",
          sceneNumber: 1,
          urgency: 0.25,
          isChekhovSetup: false,
        },
      ],
      resolvedMoments: [],
    },
    narrativeDensity: {
      score: 0.72,
      band: "dense",
      expectedDensity: 0.35,
      anomalous: true,
      subScores: [
        { dimension: "plot_information", score: 0.80, weight: 0.30, explanation: "Heavy exposition about the Berlin Protocol" },
        { dimension: "character_introduction", score: 0.75, weight: 0.25, explanation: "Three key characters introduced with distinct agendas" },
        { dimension: "thematic_weight", score: 0.65, weight: 0.20, explanation: "Trust, secrecy, institutional power established" },
        { dimension: "emotional_beat", score: 0.50, weight: 0.25, explanation: "Cold, clinical tone — emotions suppressed" },
      ],
      metrics: {
        wordCount: 2450,
        beatDensity: 0.45,
        characterBeatDensity: 0.30,
        dialogueRatio: 0.55,
        thematicCoverage: 0.28,
        plotThreadDensity: 0.35,
        turnaroundDensity: 0.40,
      },
    },
    narrativePressure: 0.72,
    dominantMode: "tension_driven",
    signals: {
      overpressure: false,
      intimacyCritical: false,
      obligationOverload: false,
      densityAnomaly: true,
      narrativeBrief:
        "Cold open interrogation scene establishing Elara Vance under suspicion. High tension from power imbalance, low intimacy. Dense exposition sets up the Berlin Protocol mystery. Two obligations seeded.",
    },
  },

  {
    sceneId: "demo-scene-02",
    sceneNumber: 2,
    title: "The Warning",
    actNumber: 1,
    tensionField: {
      aggregateScore: 0.75,
      aggregateDirection: "rising",
      gradient: -0.10,
      activeThreadCount: 3,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.75,
          direction: "rising",
          sourceLabel: "Cross warns Elara off the investigation",
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.55,
          direction: "holding",
          sourceLabel: "lingering suspicion from interrogation",
        },
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.65,
          direction: "rising",
          sourceLabel: "Kaine's veiled threat about loyalty",
        },
      ],
      newThreads: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.75,
          direction: "rising",
          sourceLabel: "Cross warns Elara off the investigation",
        },
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.65,
          direction: "rising",
          sourceLabel: "Kaine's veiled threat about loyalty",
        },
      ],
      resolvedThreads: [],
    },
    obligationCharge: {
      chargeScore: 0.55,
      velocity: 1.5,
      overdueCount: 0,
      outstanding: [
        {
          obligationId: "obl-01-001",
          promiseType: "dramatic_question",
          description: "Why was Elara at the restricted archive?",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-003",
          promiseType: "character_promise",
          description: "Agent Cross swore to protect Elara — at a cost",
          characterKeys: ["agent_cross", "elara_vance"],
          introducedAtScene: 2,
          introducedAtActIndex: 1,
          payoffHorizon: "next_act",
          urgency: "dormant",
          fulfilled: false,
        },
      ],
      introduced: [
        {
          obligationId: "obl-01-003",
          promiseType: "character_promise",
          description: "Agent Cross swore to protect Elara — at a cost",
          characterKeys: ["agent_cross", "elara_vance"],
          introducedAtScene: 2,
          introducedAtActIndex: 1,
          payoffHorizon: "next_act",
          urgency: "dormant",
          fulfilled: false,
        },
      ],
      fulfilled: [],
    },
    deferredIntimacy: {
      aggregateIndex: 0.30,
      velocity: 0.10,
      avoidantCharacters: ["agent_cross"],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.35,
          deferredIndex: 0.30,
          deferredDimensions: ["emotional_admission", "trust_distance"],
          priorIntimacyLevel: 0.25,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.30,
        },
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          intimacyLevel: 0.10,
          deferredIndex: 0.25,
          deferredDimensions: ["deferred_confrontation"],
          priorIntimacyLevel: 0.10,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.25,
        },
      ],
      deferredMoments: [
        {
          dimension: "emotional_admission",
          description: "Cross wants to warn Elara but can't say why openly",
          characterA: "agent_cross",
          characterB: "elara_vance",
          sceneNumber: 2,
          urgency: 0.45,
          isChekhovSetup: true,
        },
        {
          dimension: "trust_distance",
          description: "Elara doesn't fully trust Cross's motives",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 2,
          urgency: 0.35,
          isChekhovSetup: false,
        },
      ],
      resolvedMoments: [],
    },
    narrativeDensity: {
      score: 0.58,
      band: "balanced",
      expectedDensity: 0.35,
      anomalous: false,
      subScores: [
        { dimension: "plot_information", score: 0.55, weight: 0.30, explanation: "Warning scene — stakes clarified, not expanded" },
        { dimension: "character_introduction", score: 0.50, weight: 0.25, explanation: "Minister Kaine introduced as antagonistic force" },
        { dimension: "thematic_weight", score: 0.60, weight: 0.20, explanation: "Loyalty, protection, institutional rot" },
        { dimension: "emotional_beat", score: 0.65, weight: 0.25, explanation: "Cross's conflicted loyalty adds emotional texture" },
      ],
      metrics: {
        wordCount: 2100,
        beatDensity: 0.35,
        characterBeatDensity: 0.25,
        dialogueRatio: 0.60,
        thematicCoverage: 0.22,
        plotThreadDensity: 0.25,
        turnaroundDensity: 0.20,
      },
    },
    narrativePressure: 0.65,
    dominantMode: "tension_driven",
    signals: {
      overpressure: false,
      intimacyCritical: false,
      obligationOverload: false,
      densityAnomaly: false,
      narrativeBrief:
        "Agent Cross privately warns Elara to drop the investigation. Minister Kaine applies political pressure. Tension rising across multiple fronts. Emotional stakes begin to surface.",
    },
  },

  {
    sceneId: "demo-scene-03",
    sceneNumber: 3,
    title: "The Betrayal",
    actNumber: 1,
    tensionField: {
      aggregateScore: 0.78,
      aggregateDirection: "rising",
      gradient: 0.03,
      activeThreadCount: 4,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.80,
          direction: "rising",
          sourceLabel: "Cross's betrayal revealed — he was reporting to Kaine",
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.60,
          direction: "holding",
          sourceLabel: "Holt knew about Cross's dual loyalties",
        },
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.78,
          direction: "rising",
          sourceLabel: "Kaine's manipulation exposed",
        },
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          score: 0.70,
          direction: "rising",
          sourceLabel: "Cross torn between duty and conscience",
        },
      ],
      newThreads: [
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          score: 0.70,
          direction: "rising",
          sourceLabel: "Cross torn between duty and conscience",
        },
      ],
      resolvedThreads: [],
    },
    obligationCharge: {
      chargeScore: 0.68,
      velocity: 2.0,
      overdueCount: 0,
      outstanding: [
        {
          obligationId: "obl-01-001",
          promiseType: "dramatic_question",
          description: "Why was Elara at the restricted archive?",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-003",
          promiseType: "character_promise",
          description: "Agent Cross swore to protect Elara — at a cost",
          characterKeys: ["agent_cross", "elara_vance"],
          introducedAtScene: 2,
          introducedAtActIndex: 1,
          payoffHorizon: "next_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "simmering",
          fulfilled: false,
        },
      ],
      introduced: [
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "simmering",
          fulfilled: false,
        },
      ],
      fulfilled: [],
    },
    deferredIntimacy: {
      aggregateIndex: 0.55,
      velocity: 0.25,
      avoidantCharacters: ["agent_cross", "elara_vance"],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.20,
          deferredIndex: 0.65,
          deferredDimensions: ["emotional_admission", "deferred_reconciliation", "trust_distance"],
          priorIntimacyLevel: 0.35,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.65,
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          intimacyLevel: 0.25,
          deferredIndex: 0.40,
          deferredDimensions: ["deferred_confrontation"],
          priorIntimacyLevel: 0.20,
          scenesSinceLastInteraction: 1,
          cumulativeDeferralScore: 0.40,
        },
      ],
      deferredMoments: [
        {
          dimension: "deferred_reconciliation",
          description: "Elara can't forgive Cross — not yet",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 3,
          urgency: 0.55,
          isChekhovSetup: true,
        },
        {
          dimension: "trust_distance",
          description: "The betrayal has shattered whatever trust existed",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 3,
          urgency: 0.60,
          isChekhovSetup: false,
        },
        {
          dimension: "emotional_admission",
          description: "Cross wants to explain but Elara won't listen",
          characterA: "agent_cross",
          characterB: "elara_vance",
          sceneNumber: 3,
          urgency: 0.50,
          isChekhovSetup: true,
        },
      ],
      resolvedMoments: [],
    },
    narrativeDensity: {
      score: 0.68,
      band: "dense",
      expectedDensity: 0.35,
      anomalous: false,
      subScores: [
        { dimension: "plot_information", score: 0.60, weight: 0.30, explanation: "Betrayal reveal shifts power dynamics" },
        { dimension: "character_introduction", score: 0.30, weight: 0.25, explanation: "No new characters, but character depth expands" },
        { dimension: "thematic_weight", score: 0.75, weight: 0.20, explanation: "Betrayal, trust, institutional corruption converge" },
        { dimension: "emotional_beat", score: 0.85, weight: 0.25, explanation: "Highest emotional impact in Act 1" },
      ],
      metrics: {
        wordCount: 2300,
        beatDensity: 0.40,
        characterBeatDensity: 0.35,
        dialogueRatio: 0.50,
        thematicCoverage: 0.32,
        plotThreadDensity: 0.40,
        turnaroundDensity: 0.60,
      },
    },
    narrativePressure: 0.76,
    dominantMode: "obligation_driven",
    signals: {
      overpressure: false,
      intimacyCritical: false,
      obligationOverload: false,
      densityAnomaly: false,
      narrativeBrief:
        "Cross's betrayal is revealed — he was reporting to Minister Kaine all along. Emotional pivot point. Elara is isolated, obligation charge rising rapidly with five outstanding threads. Deferred intimacy between Elara and Cross reaches critical threshold.",
    },
  },

  {
    sceneId: "demo-scene-04",
    sceneNumber: 4,
    title: "Point of No Return",
    actNumber: 1,
    tensionField: {
      aggregateScore: 0.88,
      aggregateDirection: "rising",
      gradient: 0.10,
      activeThreadCount: 5,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.90,
          direction: "rising",
          sourceLabel: "direct confrontation — Kaine threatens Elara",
        },
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.70,
          direction: "holding",
          sourceLabel: "cold war between former allies",
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.75,
          direction: "rising",
          sourceLabel: "Holt forced to choose a side",
        },
        {
          characterA: "agent_cross",
          characterB: "commander_holt",
          score: 0.60,
          direction: "rising",
          sourceLabel: "Cross and Holt clash over Elara's fate",
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          score: 0.50,
          direction: "rising",
          sourceLabel: "the Archivist offers Elara the forbidden file",
        },
      ],
      newThreads: [
        {
          characterA: "agent_cross",
          characterB: "commander_holt",
          score: 0.60,
          direction: "rising",
          sourceLabel: "Cross and Holt clash over Elara's fate",
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          score: 0.50,
          direction: "rising",
          sourceLabel: "the Archivist offers Elara the forbidden file",
        },
      ],
      resolvedThreads: [],
    },
    obligationCharge: {
      chargeScore: 0.82,
      velocity: 2.5,
      overdueCount: 1,
      outstanding: [
        {
          obligationId: "obl-01-001",
          promiseType: "dramatic_question",
          description: "Why was Elara at the restricted archive?",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-003",
          promiseType: "character_promise",
          description: "Agent Cross swore to protect Elara — at a cost",
          characterKeys: ["agent_cross", "elara_vance"],
          introducedAtScene: 2,
          introducedAtActIndex: 1,
          payoffHorizon: "next_act",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-006",
          promiseType: "deadline",
          description: "Elara has 24 hours to turn over all research or face arrest",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-007",
          promiseType: "mystery",
          description: "What does the Archivist know about the Berlin Protocol?",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "dormant",
          fulfilled: false,
        },
      ],
      introduced: [
        {
          obligationId: "obl-01-006",
          promiseType: "deadline",
          description: "Elara has 24 hours to turn over all research or face arrest",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-007",
          promiseType: "mystery",
          description: "What does the Archivist know about the Berlin Protocol?",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "dormant",
          fulfilled: false,
        },
      ],
      fulfilled: [],
    },
    deferredIntimacy: {
      aggregateIndex: 0.60,
      velocity: 0.05,
      avoidantCharacters: ["elara_vance", "agent_cross"],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.15,
          deferredIndex: 0.75,
          deferredDimensions: ["deferred_reconciliation", "trust_distance", "emotional_admission"],
          priorIntimacyLevel: 0.20,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.75,
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          intimacyLevel: 0.40,
          deferredIndex: 0.35,
          deferredDimensions: ["withheld_secret"],
          priorIntimacyLevel: 0.20,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.35,
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          intimacyLevel: 0.20,
          deferredIndex: 0.50,
          deferredDimensions: ["deferred_confrontation", "trust_distance"],
          priorIntimacyLevel: 0.25,
          scenesSinceLastInteraction: 1,
          cumulativeDeferralScore: 0.50,
        },
      ],
      deferredMoments: [
        {
          dimension: "deferred_reconciliation",
          description: "Elara refuses Cross's attempt to explain",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 4,
          urgency: 0.65,
          isChekhovSetup: true,
        },
        {
          dimension: "withheld_secret",
          description: "The Archivist knows more than he reveals",
          characterA: "the_archivist",
          characterB: "elara_vance",
          sceneNumber: 4,
          urgency: 0.50,
          isChekhovSetup: true,
        },
        {
          dimension: "trust_distance",
          description: "Holt can't be trusted — he's Kaine's instrument",
          characterA: "elara_vance",
          characterB: "commander_holt",
          sceneNumber: 4,
          urgency: 0.55,
          isChekhovSetup: false,
        },
      ],
      resolvedMoments: [],
    },
    narrativeDensity: {
      score: 0.82,
      band: "dense",
      expectedDensity: 0.35,
      anomalous: true,
      subScores: [
        { dimension: "plot_information", score: 0.85, weight: 0.30, explanation: "Multiple threads converge — deadline, archive, betrayal" },
        { dimension: "character_introduction", score: 0.45, weight: 0.25, explanation: "The Archivist introduced as wildcard" },
        { dimension: "thematic_weight", score: 0.80, weight: 0.20, explanation: "Point of no return — no going back for Elara" },
        { dimension: "emotional_beat", score: 0.90, weight: 0.25, explanation: "Maximum emotional escalation before act break" },
      ],
      metrics: {
        wordCount: 2600,
        beatDensity: 0.55,
        characterBeatDensity: 0.40,
        dialogueRatio: 0.45,
        thematicCoverage: 0.38,
        plotThreadDensity: 0.50,
        turnaroundDensity: 0.80,
      },
    },
    narrativePressure: 0.88,
    dominantMode: "tension_driven",
    signals: {
      overpressure: true,
      intimacyCritical: false,
      obligationOverload: true,
      densityAnomaly: true,
      narrativeBrief:
        "Act 1 climax. Elara crosses the point of no return — the Archivist gives her the forbidden Berlin Protocol file. 24-hour deadline imposed by Holt. Seven outstanding obligations, obligation overload triggered. Narrative pressure at 0.88 — overpressure warning.",
    },
  },

  // -----------------------------------------------------------------------
  // ACT 2 — Confrontation  (scenes 5-8)
  // -----------------------------------------------------------------------
  {
    sceneId: "demo-scene-05",
    sceneNumber: 5,
    title: "The Descent",
    actNumber: 2,
    tensionField: {
      aggregateScore: 0.80,
      aggregateDirection: "rising",
      gradient: -0.08,
      activeThreadCount: 5,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.88,
          direction: "rising",
          sourceLabel: "Kaine deploys assets to hunt Elara",
        },
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.65,
          direction: "holding",
          sourceLabel: "Cross tracking Elara — conflicted",
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.80,
          direction: "rising",
          sourceLabel: "Holt leading the manhunt",
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          score: 0.45,
          direction: "holding",
          sourceLabel: "uneasy alliance with the Archivist",
        },
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          score: 0.75,
          direction: "rising",
          sourceLabel: "Kaine pressures Cross to prove loyalty",
        },
      ],
      newThreads: [
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          score: 0.75,
          direction: "rising",
          sourceLabel: "Kaine pressures Cross to prove loyalty",
        },
      ],
      resolvedThreads: [],
    },
    obligationCharge: {
      chargeScore: 0.75,
      velocity: 1.0,
      overdueCount: 2,
      outstanding: [
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-003",
          promiseType: "character_promise",
          description: "Agent Cross swore to protect Elara — at a cost",
          characterKeys: ["agent_cross", "elara_vance"],
          introducedAtScene: 2,
          introducedAtActIndex: 1,
          payoffHorizon: "next_act",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-006",
          promiseType: "deadline",
          description: "Elara has 24 hours to turn over all research or face arrest",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 5,
        },
        {
          obligationId: "obl-01-007",
          promiseType: "mystery",
          description: "What does the Archivist know about the Berlin Protocol?",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-02-001",
          promiseType: "plot_thread",
          description: "Elara goes underground — who can she trust?",
          characterKeys: ["elara_vance"],
          introducedAtScene: 5,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "simmering",
          fulfilled: false,
        },
      ],
      introduced: [
        {
          obligationId: "obl-02-001",
          promiseType: "plot_thread",
          description: "Elara goes underground — who can she trust?",
          characterKeys: ["elara_vance"],
          introducedAtScene: 5,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "simmering",
          fulfilled: false,
        },
      ],
      fulfilled: [
        {
          obligationId: "obl-01-006",
          promiseType: "deadline",
          description: "Elara has 24 hours to turn over all research or face arrest",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 5,
        },
      ],
    },
    deferredIntimacy: {
      aggregateIndex: 0.65,
      velocity: 0.05,
      avoidantCharacters: ["elara_vance"],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.10,
          deferredIndex: 0.80,
          deferredDimensions: ["deferred_reconciliation", "trust_distance", "emotional_admission"],
          priorIntimacyLevel: 0.15,
          scenesSinceLastInteraction: 1,
          cumulativeDeferralScore: 0.80,
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          intimacyLevel: 0.50,
          deferredIndex: 0.40,
          deferredDimensions: ["deferred_alliance", "withheld_secret"],
          priorIntimacyLevel: 0.40,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.40,
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          intimacyLevel: 0.10,
          deferredIndex: 0.60,
          deferredDimensions: ["deferred_confrontation"],
          priorIntimacyLevel: 0.20,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.60,
        },
      ],
      deferredMoments: [
        {
          dimension: "deferred_reconciliation",
          description: "Cross tries to reach Elara — she burns the bridge",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 5,
          urgency: 0.70,
          isChekhovSetup: true,
        },
        {
          dimension: "deferred_alliance",
          description: "Elara and the Archivist form a tense partnership",
          characterA: "elara_vance",
          characterB: "the_archivist",
          sceneNumber: 5,
          urgency: 0.45,
          isChekhovSetup: false,
        },
        {
          dimension: "deferred_confrontation",
          description: "Elara knows Holt is hunting her — she's not ready to face him",
          characterA: "elara_vance",
          characterB: "commander_holt",
          sceneNumber: 5,
          urgency: 0.55,
          isChekhovSetup: false,
        },
      ],
      resolvedMoments: [],
    },
    narrativeDensity: {
      score: 0.65,
      band: "balanced",
      expectedDensity: 0.35,
      anomalous: false,
      subScores: [
        { dimension: "plot_information", score: 0.60, weight: 0.30, explanation: "Elara decodes fragments of the Berlin Protocol" },
        { dimension: "character_introduction", score: 0.20, weight: 0.25, explanation: "No new characters — deepening existing arcs" },
        { dimension: "thematic_weight", score: 0.70, weight: 0.20, explanation: "Paranoia, survival, the cost of truth" },
        { dimension: "emotional_beat", score: 0.75, weight: 0.25, explanation: "Elara's isolation and resolve deepen" },
      ],
      metrics: {
        wordCount: 2200,
        beatDensity: 0.38,
        characterBeatDensity: 0.30,
        dialogueRatio: 0.45,
        thematicCoverage: 0.30,
        plotThreadDensity: 0.35,
        turnaroundDensity: 0.30,
      },
    },
    narrativePressure: 0.78,
    dominantMode: "obligation_driven",
    signals: {
      overpressure: false,
      intimacyCritical: false,
      obligationOverload: true,
      densityAnomaly: false,
      narrativeBrief:
        "Act 2 opens. Elara goes underground with the Berlin Protocol file. Manhunt begins. Obligation charge remains high with overdue obligations. The deadline is moot — Elara is already beyond the law. Cross's internal conflict intensifies.",
    },
  },

  {
    sceneId: "demo-scene-06",
    sceneNumber: 6,
    title: "The Scheme",
    actNumber: 2,
    tensionField: {
      aggregateScore: 0.72,
      aggregateDirection: "holding",
      gradient: -0.08,
      activeThreadCount: 4,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          score: 0.55,
          direction: "rising",
          sourceLabel: "scheming — planning to expose the Protocol",
        },
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.85,
          direction: "holding",
          sourceLabel: "Kaine unaware of their plans — yet",
        },
        {
          characterA: "the_archivist",
          characterB: "agent_cross",
          score: 0.50,
          direction: "rising",
          sourceLabel: "Archivist distrusts Cross, warns Elara",
        },
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.60,
          direction: "holding",
          sourceLabel: "Elara considers using Cross as asset",
        },
      ],
      newThreads: [
        {
          characterA: "the_archivist",
          characterB: "agent_cross",
          score: 0.50,
          direction: "rising",
          sourceLabel: "Archivist distrusts Cross, warns Elara",
        },
      ],
      resolvedThreads: [
        {
          characterA: "agent_cross",
          characterB: "commander_holt",
          score: 0.60,
          direction: "falling",
          sourceLabel: "Cross and Holt clash over Elara's fate",
        },
      ],
    },
    obligationCharge: {
      chargeScore: 0.78,
      velocity: 1.5,
      overdueCount: 2,
      outstanding: [
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-003",
          promiseType: "character_promise",
          description: "Agent Cross swore to protect Elara — at a cost",
          characterKeys: ["agent_cross", "elara_vance"],
          introducedAtScene: 2,
          introducedAtActIndex: 1,
          payoffHorizon: "next_act",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-007",
          promiseType: "mystery",
          description: "What does the Archivist know about the Berlin Protocol?",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-02-001",
          promiseType: "plot_thread",
          description: "Elara goes underground — who can she trust?",
          characterKeys: ["elara_vance"],
          introducedAtScene: 5,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-02-002",
          promiseType: "setup",
          description: "Plan to leak the Berlin Protocol to the press",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 6,
          introducedAtActIndex: 1,
          payoffHorizon: "same_act",
          urgency: "dormant",
          fulfilled: false,
        },
      ],
      introduced: [
        {
          obligationId: "obl-02-002",
          promiseType: "setup",
          description: "Plan to leak the Berlin Protocol to the press",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 6,
          introducedAtActIndex: 1,
          payoffHorizon: "same_act",
          urgency: "dormant",
          fulfilled: false,
        },
      ],
      fulfilled: [
        {
          obligationId: "obl-01-001",
          promiseType: "dramatic_question",
          description: "Why was Elara at the restricted archive?",
          characterKeys: ["elara_vance", "commander_holt"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 6,
        },
      ],
    },
    deferredIntimacy: {
      aggregateIndex: 0.75,
      velocity: 0.10,
      avoidantCharacters: ["elara_vance", "agent_cross"],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.12,
          deferredIndex: 0.85,
          deferredDimensions: ["deferred_reconciliation", "emotional_admission", "trust_distance"],
          priorIntimacyLevel: 0.10,
          scenesSinceLastInteraction: 2,
          cumulativeDeferralScore: 0.85,
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          intimacyLevel: 0.55,
          deferredIndex: 0.50,
          deferredDimensions: ["deferred_alliance", "withheld_secret"],
          priorIntimacyLevel: 0.50,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.50,
        },
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          intimacyLevel: 0.05,
          deferredIndex: 0.85,
          deferredDimensions: ["deferred_confrontation"],
          priorIntimacyLevel: 0.05,
          scenesSinceLastInteraction: 1,
          cumulativeDeferralScore: 0.85,
        },
      ],
      deferredMoments: [
        {
          dimension: "deferred_reconciliation",
          description: "Cross is reaching out — Elara is tempted but resists",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 6,
          urgency: 0.78,
          isChekhovSetup: true,
        },
        {
          dimension: "emotional_admission",
          description: "Cross wants to confess everything to Elara",
          characterA: "agent_cross",
          characterB: "elara_vance",
          sceneNumber: 6,
          urgency: 0.75,
          isChekhovSetup: true,
        },
        {
          dimension: "deferred_confrontation",
          description: "Elara and Kaine's final confrontation is inevitable",
          characterA: "elara_vance",
          characterB: "minister_kaine",
          sceneNumber: 6,
          urgency: 0.70,
          isChekhovSetup: false,
        },
      ],
      resolvedMoments: [],
    },
    narrativeDensity: {
      score: 0.55,
      band: "balanced",
      expectedDensity: 0.35,
      anomalous: false,
      subScores: [
        { dimension: "plot_information", score: 0.60, weight: 0.30, explanation: "Scheme is hatched — leak plan takes shape" },
        { dimension: "character_introduction", score: 0.15, weight: 0.25, explanation: "Deepening existing dynamics" },
        { dimension: "thematic_weight", score: 0.55, weight: 0.20, explanation: "Conspiracy, trust, journalism as weapon" },
        { dimension: "emotional_beat", score: 0.70, weight: 0.25, explanation: "Deferred intimacy reaching critical — Elara and Cross" },
      ],
      metrics: {
        wordCount: 1950,
        beatDensity: 0.32,
        characterBeatDensity: 0.28,
        dialogueRatio: 0.55,
        thematicCoverage: 0.25,
        plotThreadDensity: 0.30,
        turnaroundDensity: 0.25,
      },
    },
    narrativePressure: 0.74,
    dominantMode: "intimacy_driven",
    signals: {
      overpressure: false,
      intimacyCritical: true,
      obligationOverload: true,
      densityAnomaly: false,
      narrativeBrief:
        "Elara and the Archivist scheme to leak the Protocol to the press. Deferred intimacy between Elara and Cross reaches critical — 0.85 deferred index. The unanswered dramatic question from scene 1 is finally fulfilled. Seven outstanding obligations maintain overload.",
    },
  },

  {
    sceneId: "demo-scene-07",
    sceneNumber: 7,
    title: "The Reckoning",
    actNumber: 2,
    tensionField: {
      aggregateScore: 0.82,
      aggregateDirection: "rising",
      gradient: 0.10,
      activeThreadCount: 6,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.92,
          direction: "rising",
          sourceLabel: "Kaine confronts Elara directly — ultimatum",
        },
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.78,
          direction: "rising",
          sourceLabel: "Cross defects back to Elara's side",
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.70,
          direction: "holding",
          sourceLabel: "Holt caught in the middle",
        },
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          score: 0.88,
          direction: "rising",
          sourceLabel: "Cross openly defies Kaine",
        },
        {
          characterA: "the_archivist",
          characterB: "minister_kaine",
          score: 0.65,
          direction: "rising",
          sourceLabel: "Archivist's role revealed — he was Kaine's predecessor",
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          score: 0.50,
          direction: "holding",
          sourceLabel: "trust tested — Archivist's past with Kaine",
        },
      ],
      newThreads: [
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          score: 0.88,
          direction: "rising",
          sourceLabel: "Cross openly defies Kaine",
        },
        {
          characterA: "the_archivist",
          characterB: "minister_kaine",
          score: 0.65,
          direction: "rising",
          sourceLabel: "Archivist's role revealed — he was Kaine's predecessor",
        },
      ],
      resolvedThreads: [
        {
          characterA: "the_archivist",
          characterB: "agent_cross",
          score: 0.50,
          direction: "falling",
          sourceLabel: "Archivist distrusts Cross, warns Elara",
        },
      ],
    },
    obligationCharge: {
      chargeScore: 0.72,
      velocity: 0.5,
      overdueCount: 1,
      outstanding: [
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-003",
          promiseType: "character_promise",
          description: "Agent Cross swore to protect Elara — at a cost",
          characterKeys: ["agent_cross", "elara_vance"],
          introducedAtScene: 2,
          introducedAtActIndex: 1,
          payoffHorizon: "next_act",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 7,
        },
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-007",
          promiseType: "mystery",
          description: "What does the Archivist know about the Berlin Protocol?",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "urgent",
          fulfilled: true,
          fulfilledAtScene: 7,
        },
        {
          obligationId: "obl-02-001",
          promiseType: "plot_thread",
          description: "Elara goes underground — who can she trust?",
          characterKeys: ["elara_vance"],
          introducedAtScene: 5,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-02-002",
          promiseType: "setup",
          description: "Plan to leak the Berlin Protocol to the press",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 6,
          introducedAtActIndex: 1,
          payoffHorizon: "same_act",
          urgency: "urgent",
          fulfilled: false,
        },
      ],
      introduced: [],
      fulfilled: [
        {
          obligationId: "obl-01-003",
          promiseType: "character_promise",
          description: "Agent Cross swore to protect Elara — at a cost",
          characterKeys: ["agent_cross", "elara_vance"],
          introducedAtScene: 2,
          introducedAtActIndex: 1,
          payoffHorizon: "next_act",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 7,
        },
        {
          obligationId: "obl-01-007",
          promiseType: "mystery",
          description: "What does the Archivist know about the Berlin Protocol?",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 4,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "urgent",
          fulfilled: true,
          fulfilledAtScene: 7,
        },
      ],
    },
    deferredIntimacy: {
      aggregateIndex: 0.45,
      velocity: -0.30,
      avoidantCharacters: [],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.55,
          deferredIndex: 0.40,
          deferredDimensions: ["deferred_reconciliation"],
          priorIntimacyLevel: 0.12,
          scenesSinceLastInteraction: 2,
          cumulativeDeferralScore: 0.40,
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          intimacyLevel: 0.60,
          deferredIndex: 0.25,
          deferredDimensions: ["withheld_secret"],
          priorIntimacyLevel: 0.55,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.25,
        },
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          intimacyLevel: 0.08,
          deferredIndex: 0.75,
          deferredDimensions: ["deferred_confrontation"],
          priorIntimacyLevel: 0.05,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.75,
        },
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          intimacyLevel: 0.10,
          deferredIndex: 0.60,
          deferredDimensions: ["deferred_confrontation"],
          priorIntimacyLevel: 0.08,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.60,
        },
      ],
      deferredMoments: [
        {
          dimension: "deferred_reconciliation",
          description: "Cross defects back — first step toward forgiveness",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 7,
          urgency: 0.80,
          isChekhovSetup: true,
        },
        {
          dimension: "deferred_confrontation",
          description: "Kaine and Elara's final showdown approaching",
          characterA: "elara_vance",
          characterB: "minister_kaine",
          sceneNumber: 7,
          urgency: 0.85,
          isChekhovSetup: false,
        },
      ],
      resolvedMoments: [
        {
          dimension: "trust_distance",
          description: "Cross's defection begins to rebuild trust",
          characterA: "agent_cross",
          characterB: "elara_vance",
          sceneNumber: 7,
          urgency: 0.75,
          isChekhovSetup: false,
        },
        {
          dimension: "emotional_admission",
          description: "Cross admits he was wrong — Elara listens",
          characterA: "agent_cross",
          characterB: "elara_vance",
          sceneNumber: 7,
          urgency: 0.78,
          isChekhovSetup: false,
        },
      ],
    },
    narrativeDensity: {
      score: 0.78,
      band: "dense",
      expectedDensity: 0.35,
      anomalous: false,
      subScores: [
        { dimension: "plot_information", score: 0.75, weight: 0.30, explanation: "Multiple reveals — Archivist's history, Cross's defection" },
        { dimension: "character_introduction", score: 0.10, weight: 0.25, explanation: "All characters established, relationships reconfigured" },
        { dimension: "thematic_weight", score: 0.85, weight: 0.20, explanation: "Redemption, sacrifice, truth vs institutional power" },
        { dimension: "emotional_beat", score: 0.85, weight: 0.25, explanation: "Cross's return and Elara's guarded hope — high emotional yield" },
      ],
      metrics: {
        wordCount: 2500,
        beatDensity: 0.48,
        characterBeatDensity: 0.38,
        dialogueRatio: 0.50,
        thematicCoverage: 0.35,
        plotThreadDensity: 0.45,
        turnaroundDensity: 0.70,
      },
    },
    narrativePressure: 0.80,
    dominantMode: "balanced",
    signals: {
      overpressure: false,
      intimacyCritical: false,
      obligationOverload: true,
      densityAnomaly: false,
      narrativeBrief:
        "Act 2 pivot. Cross defects back to Elara's side. The Archivist's past as Kaine's predecessor is revealed. Two obligations fulfilled — Cross's promise and the Archivist mystery. Deferred intimacy between Elara and Cross begins to resolve. Tension and intimacy both high — balanced mode.",
    },
  },

  {
    sceneId: "demo-scene-08",
    sceneNumber: 8,
    title: "The Fall",
    actNumber: 2,
    tensionField: {
      aggregateScore: 0.90,
      aggregateDirection: "rising",
      gradient: 0.08,
      activeThreadCount: 6,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.95,
          direction: "rising",
          sourceLabel: "Kaine orders Elara terminated — all protocols authorized",
        },
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.65,
          direction: "rising",
          sourceLabel: "Cross and Elara on the run together",
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.78,
          direction: "rising",
          sourceLabel: "Holt's conscience breaks — he helps them escape",
        },
        {
          characterA: "agent_cross",
          characterB: "commander_holt",
          score: 0.55,
          direction: "rising",
          sourceLabel: "temporary uneasy alliance",
        },
        {
          characterA: "the_archivist",
          characterB: "minister_kaine",
          score: 0.80,
          direction: "rising",
          sourceLabel: "Archivist confronted by Kaine — pay the price",
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          score: 0.40,
          direction: "falling",
          sourceLabel: "Archivist sacrifices himself for Elara's escape",
        },
      ],
      newThreads: [
        {
          characterA: "agent_cross",
          characterB: "commander_holt",
          score: 0.55,
          direction: "rising",
          sourceLabel: "temporary uneasy alliance",
        },
      ],
      resolvedThreads: [
        {
          characterA: "the_archivist",
          characterB: "agent_cross",
          score: 0.50,
          direction: "falling",
          sourceLabel: "Archivist distrusts Cross, warns Elara",
        },
      ],
    },
    obligationCharge: {
      chargeScore: 0.65,
      velocity: -1.0,
      overdueCount: 1,
      outstanding: [
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-02-001",
          promiseType: "plot_thread",
          description: "Elara goes underground — who can she trust?",
          characterKeys: ["elara_vance"],
          introducedAtScene: 5,
          introducedAtActIndex: 0,
          payoffHorizon: "same_act",
          urgency: "simmering",
          fulfilled: false,
        },
        {
          obligationId: "obl-02-002",
          promiseType: "setup",
          description: "Plan to leak the Berlin Protocol to the press",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 6,
          introducedAtActIndex: 1,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: false,
        },
        {
          obligationId: "obl-02-003",
          promiseType: "deadline",
          description: "The Archivist sacrificed — his data must not be wasted",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 8,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: false,
        },
      ],
      introduced: [
        {
          obligationId: "obl-02-003",
          promiseType: "deadline",
          description: "The Archivist sacrificed — his data must not be wasted",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 8,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: false,
        },
      ],
      fulfilled: [],
    },
    deferredIntimacy: {
      aggregateIndex: 0.50,
      velocity: 0.05,
      avoidantCharacters: [],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.60,
          deferredIndex: 0.35,
          deferredDimensions: ["emotional_admission"],
          priorIntimacyLevel: 0.55,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.35,
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          intimacyLevel: 0.30,
          deferredIndex: 0.45,
          deferredDimensions: ["deferred_confrontation", "trust_distance"],
          priorIntimacyLevel: 0.10,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.45,
        },
        {
          characterA: "elara_vance",
          characterB: "the_archivist",
          intimacyLevel: 0.70,
          deferredIndex: 0.30,
          deferredDimensions: ["deferred_alliance"],
          priorIntimacyLevel: 0.60,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.30,
        },
        {
          characterA: "agent_cross",
          characterB: "commander_holt",
          intimacyLevel: 0.25,
          deferredIndex: 0.40,
          deferredDimensions: ["deferred_alliance"],
          priorIntimacyLevel: 0.10,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.40,
        },
      ],
      deferredMoments: [
        {
          dimension: "emotional_admission",
          description: "Cross almost tells Elara he loves her — interrupted",
          characterA: "agent_cross",
          characterB: "elara_vance",
          sceneNumber: 8,
          urgency: 0.85,
          isChekhovSetup: true,
        },
        {
          dimension: "deferred_alliance",
          description: "Holt's redemption — can Elara trust him now?",
          characterA: "elara_vance",
          characterB: "commander_holt",
          sceneNumber: 8,
          urgency: 0.60,
          isChekhovSetup: false,
        },
      ],
      resolvedMoments: [
        {
          dimension: "deferred_reconciliation",
          description: "Elara and Cross are finally working together again",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 8,
          urgency: 0.80,
          isChekhovSetup: false,
        },
      ],
    },
    narrativeDensity: {
      score: 0.85,
      band: "dense",
      expectedDensity: 0.35,
      anomalous: true,
      subScores: [
        { dimension: "plot_information", score: 0.80, weight: 0.30, explanation: "The Archivist's sacrifice, Holt's redemption, escape sequence" },
        { dimension: "character_introduction", score: 0.10, weight: 0.25, explanation: "Final character configurations set for Act 3" },
        { dimension: "thematic_weight", score: 0.90, weight: 0.20, explanation: "Sacrifice, redemption, the cost of truth — peak thematic density" },
        { dimension: "emotional_beat", score: 0.95, weight: 0.25, explanation: "Archivist's sacrifice, Holt's turn, Cross's almost-confession" },
      ],
      metrics: {
        wordCount: 2800,
        beatDensity: 0.52,
        characterBeatDensity: 0.42,
        dialogueRatio: 0.40,
        thematicCoverage: 0.40,
        plotThreadDensity: 0.48,
        turnaroundDensity: 0.85,
      },
    },
    narrativePressure: 0.92,
    dominantMode: "tension_driven",
    signals: {
      overpressure: true,
      intimacyCritical: false,
      obligationOverload: false,
      densityAnomaly: true,
      narrativeBrief:
        "Act 2 climax. The Archivist sacrifices himself for Elara's escape. Holt's conscience breaks — he helps them. Kaine authorizes termination. Narrative pressure at 0.92 — overpressure imminent. Density anomalous. Cross's almost-confession sets up Act 3 emotional stakes.",
    },
  },

  // -----------------------------------------------------------------------
  // ACT 3 — Resolution  (scenes 9-10)
  // -----------------------------------------------------------------------
  {
    sceneId: "demo-scene-09",
    sceneNumber: 9,
    title: "The Confrontation",
    actNumber: 3,
    tensionField: {
      aggregateScore: 0.95,
      aggregateDirection: "rising",
      gradient: 0.05,
      activeThreadCount: 4,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.98,
          direction: "rising",
          sourceLabel: "final confrontation — truth vs power",
        },
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.70,
          direction: "holding",
          sourceLabel: "Cross stands with Elara against Kaine",
        },
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          score: 0.85,
          direction: "rising",
          sourceLabel: "Cross confronts Kaine directly",
        },
        {
          characterA: "commander_holt",
          characterB: "minister_kaine",
          score: 0.80,
          direction: "rising",
          sourceLabel: "Holt testifies against Kaine",
        },
      ],
      newThreads: [],
      resolvedThreads: [
        {
          characterA: "the_archivist",
          characterB: "minister_kaine",
          score: 0.80,
          direction: "falling",
          sourceLabel: "Archivist confronted by Kaine — pay the price",
        },
        {
          characterA: "agent_cross",
          characterB: "commander_holt",
          score: 0.55,
          direction: "falling",
          sourceLabel: "temporary uneasy alliance",
        },
      ],
    },
    obligationCharge: {
      chargeScore: 0.55,
      velocity: -2.0,
      overdueCount: 0,
      outstanding: [
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 9,
        },
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "urgent",
          fulfilled: false,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 9,
        },
        {
          obligationId: "obl-02-002",
          promiseType: "setup",
          description: "Plan to leak the Berlin Protocol to the press",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 6,
          introducedAtActIndex: 1,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 9,
        },
        {
          obligationId: "obl-02-003",
          promiseType: "deadline",
          description: "The Archivist sacrificed — his data must not be wasted",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 8,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 9,
        },
      ],
      introduced: [],
      fulfilled: [
        {
          obligationId: "obl-01-002",
          promiseType: "setup",
          description: "The Berlin Protocol file — classified above top secret",
          characterKeys: ["elara_vance"],
          introducedAtScene: 1,
          introducedAtActIndex: 0,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 9,
        },
        {
          obligationId: "obl-01-005",
          promiseType: "unresolved_conflict",
          description: "Elara vs the Ministry — open warfare",
          characterKeys: ["elara_vance", "minister_kaine"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 9,
        },
        {
          obligationId: "obl-02-002",
          promiseType: "setup",
          description: "Plan to leak the Berlin Protocol to the press",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 6,
          introducedAtActIndex: 1,
          payoffHorizon: "same_act",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 9,
        },
        {
          obligationId: "obl-02-003",
          promiseType: "deadline",
          description: "The Archivist sacrificed — his data must not be wasted",
          characterKeys: ["elara_vance", "the_archivist"],
          introducedAtScene: 8,
          introducedAtActIndex: 3,
          payoffHorizon: "climax",
          urgency: "critical",
          fulfilled: true,
          fulfilledAtScene: 9,
        },
      ],
    },
    deferredIntimacy: {
      aggregateIndex: 0.35,
      velocity: -0.15,
      avoidantCharacters: [],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.75,
          deferredIndex: 0.20,
          deferredDimensions: [],
          priorIntimacyLevel: 0.60,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.20,
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          intimacyLevel: 0.45,
          deferredIndex: 0.25,
          deferredDimensions: ["deferred_confrontation"],
          priorIntimacyLevel: 0.30,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.25,
        },
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          intimacyLevel: 0.05,
          deferredIndex: 0.10,
          deferredDimensions: [],
          priorIntimacyLevel: 0.08,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.10,
        },
      ],
      deferredMoments: [
        {
          dimension: "deferred_confrontation",
          description: "Elara and Holt need to talk after the dust settles",
          characterA: "elara_vance",
          characterB: "commander_holt",
          sceneNumber: 9,
          urgency: 0.50,
          isChekhovSetup: false,
        },
      ],
      resolvedMoments: [
        {
          dimension: "emotional_admission",
          description: "Cross tells Elara he loves her — she says it back",
          characterA: "agent_cross",
          characterB: "elara_vance",
          sceneNumber: 9,
          urgency: 0.95,
          isChekhovSetup: false,
        },
        {
          dimension: "deferred_confrontation",
          description: "Kaine vs Elara — final confrontation, truth wins",
          characterA: "elara_vance",
          characterB: "minister_kaine",
          sceneNumber: 9,
          urgency: 0.95,
          isChekhovSetup: false,
        },
      ],
    },
    narrativeDensity: {
      score: 0.90,
      band: "dense",
      expectedDensity: 0.35,
      anomalous: true,
      subScores: [
        { dimension: "plot_information", score: 0.88, weight: 0.30, explanation: "Berlin Protocol exposed, Kaine confronted, all threads converge" },
        { dimension: "character_introduction", score: 0.05, weight: 0.25, explanation: "Climax — all characters in final positions" },
        { dimension: "thematic_weight", score: 0.92, weight: 0.20, explanation: "Truth, justice, sacrifice — thematic payoff of entire work" },
        { dimension: "emotional_beat", score: 0.95, weight: 0.25, explanation: "Love confession, confrontation, vindication — maximum emotional payload" },
      ],
      metrics: {
        wordCount: 3000,
        beatDensity: 0.58,
        characterBeatDensity: 0.45,
        dialogueRatio: 0.48,
        thematicCoverage: 0.42,
        plotThreadDensity: 0.55,
        turnaroundDensity: 0.90,
      },
    },
    narrativePressure: 0.95,
    dominantMode: "balanced",
    signals: {
      overpressure: true,
      intimacyCritical: false,
      obligationOverload: false,
      densityAnomaly: true,
      narrativeBrief:
        "Act 3 climax. Peak narrative pressure at 0.95 — maximum tension. Elara confronts Kaine with the Berlin Protocol. Cross's love confession. Holt testifies. Four obligations fulfilled in a single scene — massive payoff. Ten minutes of the world's most intense dramatic catharsis.",
    },
  },

  {
    sceneId: "demo-scene-10",
    sceneNumber: 10,
    title: "Aftermath",
    actNumber: 3,
    tensionField: {
      aggregateScore: 0.30,
      aggregateDirection: "falling",
      gradient: -0.65,
      activeThreadCount: 1,
      pairTensions: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          score: 0.30,
          direction: "falling",
          sourceLabel: "resolution — rebuilding together",
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          score: 0.35,
          direction: "falling",
          sourceLabel: "Holt's new beginning — earned trust",
        },
      ],
      newThreads: [],
      resolvedThreads: [
        {
          characterA: "elara_vance",
          characterB: "minister_kaine",
          score: 0.98,
          direction: "falling",
          sourceLabel: "Kaine arrested — conflict resolved",
        },
        {
          characterA: "agent_cross",
          characterB: "minister_kaine",
          score: 0.85,
          direction: "falling",
          sourceLabel: "Cross confronts Kaine directly",
        },
        {
          characterA: "commander_holt",
          characterB: "minister_kaine",
          score: 0.80,
          direction: "falling",
          sourceLabel: "Holt testifies against Kaine",
        },
      ],
    },
    obligationCharge: {
      chargeScore: 0.15,
      velocity: -3.0,
      overdueCount: 0,
      outstanding: [
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "simmering",
          fulfilled: true,
          fulfilledAtScene: 10,
        },
      ],
      introduced: [],
      fulfilled: [
        {
          obligationId: "obl-01-004",
          promiseType: "emotional_hook",
          description: "Cross's betrayal — can Elara ever trust him again?",
          characterKeys: ["elara_vance", "agent_cross"],
          introducedAtScene: 3,
          introducedAtActIndex: 2,
          payoffHorizon: "next_act",
          urgency: "simmering",
          fulfilled: true,
          fulfilledAtScene: 10,
        },
      ],
    },
    deferredIntimacy: {
      aggregateIndex: 0.15,
      velocity: -0.20,
      avoidantCharacters: [],
      pairStates: [
        {
          characterA: "elara_vance",
          characterB: "agent_cross",
          intimacyLevel: 0.85,
          deferredIndex: 0.08,
          deferredDimensions: [],
          priorIntimacyLevel: 0.75,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.08,
        },
        {
          characterA: "elara_vance",
          characterB: "commander_holt",
          intimacyLevel: 0.55,
          deferredIndex: 0.12,
          deferredDimensions: [],
          priorIntimacyLevel: 0.45,
          scenesSinceLastInteraction: 0,
          cumulativeDeferralScore: 0.12,
        },
      ],
      deferredMoments: [],
      resolvedMoments: [
        {
          dimension: "deferred_confrontation",
          description: "Elara and Holt have their honest conversation",
          characterA: "elara_vance",
          characterB: "commander_holt",
          sceneNumber: 10,
          urgency: 0.40,
          isChekhovSetup: false,
        },
        {
          dimension: "trust_distance",
          description: "Full trust restored between Elara and Cross",
          characterA: "elara_vance",
          characterB: "agent_cross",
          sceneNumber: 10,
          urgency: 0.45,
          isChekhovSetup: false,
        },
      ],
    },
    narrativeDensity: {
      score: 0.35,
      band: "sparse",
      expectedDensity: 0.35,
      anomalous: false,
      subScores: [
        { dimension: "plot_information", score: 0.25, weight: 0.30, explanation: "Denouement — loose ends tied, no new info" },
        { dimension: "character_introduction", score: 0.05, weight: 0.25, explanation: "No new characters" },
        { dimension: "thematic_weight", score: 0.40, weight: 0.20, explanation: "Healing, hope, new beginnings" },
        { dimension: "emotional_beat", score: 0.70, weight: 0.25, explanation: "Gentle emotional resolution — earned catharsis" },
      ],
      metrics: {
        wordCount: 1800,
        beatDensity: 0.20,
        characterBeatDensity: 0.15,
        dialogueRatio: 0.55,
        thematicCoverage: 0.12,
        plotThreadDensity: 0.10,
        turnaroundDensity: 0.05,
      },
    },
    narrativePressure: 0.30,
    dominantMode: "intimacy_driven",
    signals: {
      overpressure: false,
      intimacyCritical: false,
      obligationOverload: false,
      densityAnomaly: false,
      narrativeBrief:
        "Aftermath. All tension resolved. Elara and Cross rebuild their relationship. Holt earns redemption. The Protocol is public. Kaine is arrested. Final obligation fulfilled — trust between Elara and Cross restored. Almost all deferred intimacy resolved. Narrative pressure at 0.30 — peaceful landing.",
    },
  },
];

// ===========================================================================
// Summary computation
// ===========================================================================
function computeSummary(scenes: DemoSceneResponse[]): Record<string, unknown> {
  const totalScenes = scenes.length;
  const avgPressure =
    scenes.reduce((sum, s) => sum + s.narrativePressure, 0) / totalScenes;

  // Dominant mode vote
  const modeCounts: Record<string, number> = {};
  for (const s of scenes) {
    const mode = s.dominantMode;
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
  }
  const dominantMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Act breakdown
  const acts = new Map<number, DemoSceneResponse[]>();
  for (const s of scenes) {
    const act = s.actNumber;
    if (!acts.has(act)) acts.set(act, []);
    acts.get(act)!.push(s);
  }

  const actBreakdown: Record<string, unknown>[] = [];
  for (const [actNum, actScenes] of acts) {
    const actAvgPressure =
      actScenes.reduce((sum, s) => sum + s.narrativePressure, 0) / actScenes.length;
    actBreakdown.push({
      act: actNum,
      sceneCount: actScenes.length,
      avgNarrativePressure: Math.round(actAvgPressure * 100) / 100,
      dominantMode: actScenes.map((s) => s.dominantMode).reduce(
        (acc, m) => {
          acc[m] = (acc[m] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    });
  }

  return {
    totalScenes,
    avgNarrativePressure: Math.round(avgPressure * 100) / 100,
    dominantModeAcrossScenes: dominantMode,
    actBreakdown,
  };
}

// ===========================================================================
// Handler
// ===========================================================================
serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errRes("Method not allowed. Use POST.", 405);
  }

  try {
    const body = await req.json();
    const { projectId, scenes, mock } = body as {
      projectId?: string;
      scenes?: DemoSceneInput[];
      mock?: boolean;
    };

    if (!projectId) {
      return errRes("Missing required field: projectId");
    }

    // Default to mock mode for demo
    const isMock = mock !== false;

    let resultScenes: DemoSceneResponse[];

    if (isMock) {
      // Return hardcoded Berlin Protocol demo data
      resultScenes = BERLIN_PROTOCOL_DEMO.map((scene) => ({
        ...scene,
        tensionField: { ...scene.tensionField },
        obligationCharge: { ...scene.obligationCharge },
        deferredIntimacy: { ...scene.deferredIntimacy },
        narrativeDensity: { ...scene.narrativeDensity },
      }));
    } else {
      // Non-mock mode: call computeObligationTopology per scene
      if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
        return errRes(
          "Non-mock mode requires `scenes` array with sceneText and characterKeys",
        );
      }

      resultScenes = [];
      for (const scene of scenes) {
        try {
          const state = computeObligationTopology({
            projectId,
            sceneId: scene.sceneId,
            sceneNumber: scene.sceneNumber,
            sceneText: scene.sceneText || "",
            characterKeys: scene.characterKeys || [],
            versionId: undefined,
            includeActRollup: false,
            actNumber: scene.actNumber,
          });

          resultScenes.push({
            sceneId: scene.sceneId,
            sceneNumber: scene.sceneNumber,
            title: scene.title,
            actNumber: scene.actNumber,
            tensionField: state.tensionField as unknown as Record<string, unknown>,
            obligationCharge: state.obligationCharge as unknown as Record<string, unknown>,
            deferredIntimacy: state.deferredIntimacy as unknown as Record<string, unknown>,
            narrativeDensity: state.narrativeDensity as unknown as Record<string, unknown>,
            narrativePressure: state.narrativePressure,
            dominantMode: state.dominantMode,
            signals: state.signals,
            actRollup: state.actRollup as unknown as Record<string, unknown> | undefined,
          });
        } catch (err) {
          console.error(
            `[demo-obligation-data] Error computing scene ${scene.sceneId}:`,
            err,
          );
          resultScenes.push({
            sceneId: scene.sceneId,
            sceneNumber: scene.sceneNumber,
            title: scene.title,
            actNumber: scene.actNumber,
            tensionField: { error: "compute failed" },
            obligationCharge: { error: "compute failed" },
            deferredIntimacy: { error: "compute failed" },
            narrativeDensity: { error: "compute failed" },
            narrativePressure: 0,
            dominantMode: "balanced",
            signals: {
              overpressure: false,
              intimacyCritical: false,
              obligationOverload: false,
              densityAnomaly: false,
              narrativeBrief: `Error computing topology: ${err instanceof Error ? err.message : String(err)}`,
            },
          });
        }
      }
    }

    const summary = computeSummary(resultScenes);

    return jsonRes({ scenes: resultScenes, summary });
  } catch (err) {
    console.error("[demo-obligation-data] Unhandled error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});