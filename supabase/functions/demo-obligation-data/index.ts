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

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errRes(msg: string, status = 400): Response {
  return jsonRes({ error: msg }, status);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SceneData {
  sceneNumber: number;
  sceneHeading: string;
  tensionScore: number;
  obligationCharge: number;
  deferredIntimacy: number;
  narrativeDensity: number;
  narrativePressure: number;
  actNumber: number;
  dominantMode: "tension_driven" | "obligation_driven" | "intimacy_driven" | "balanced";
}

interface Summary {
  dominantModeAcrossScenes: string;
  avgTension: number;
  avgObligation: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function geometricMean(values: number[]): number {
  if (values.length === 0) return 0;
  const product = values.reduce((p, v) => p * Math.max(v, 0.001), 1);
  return Math.pow(product, 1 / values.length);
}

function computeDominantMode(
  tension: number,
  obligation: number,
  intimacy: number,
): SceneData["dominantMode"] {
  const max = Math.max(tension, obligation, intimacy);
  if (tension === max && tension > 0.55) return "tension_driven";
  if (obligation === max && obligation > 0.55) return "obligation_driven";
  if (intimacy === max && intimacy > 0.55) return "intimacy_driven";
  return "balanced";
}

// ---------------------------------------------------------------------------
// BERLIN PROTOCOL — Demo data (10 scenes, 3 acts)
// ---------------------------------------------------------------------------
const ACT_1_ACT_NAME = "Setup — The Huntress and the Ghost";
const ACT_2_ACT_NAME = "Confrontation — The Devil's Bargain";
const ACT_3_ACT_NAME = "Climax — Zero Hour";

function buildBerlinProtocolDemo(): SceneData[] {
  // Source data: raw metrics per scene (tensionScore, obligationCharge, deferredIntimacy, narrativeDensity)
  const raw: {
    sceneNumber: number;
    sceneHeading: string;
    actNumber: number;
    tensionScore: number;
    obligationCharge: number;
    deferredIntimacy: number;
    narrativeDensity: number;
  }[] = [
    // -----------------------------------------------------------------------
    // ACT 1 — Setup  (scenes 1-4)
    // -----------------------------------------------------------------------
    {
      sceneNumber: 1,
      sceneHeading: "The Interrogation",
      actNumber: 1,
      tensionScore: 0.85,
      obligationCharge: 0.40,
      deferredIntimacy: 0.20,
      narrativeDensity: 0.72,
    },
    {
      sceneNumber: 2,
      sceneHeading: "The Warning",
      actNumber: 1,
      tensionScore: 0.75,
      obligationCharge: 0.55,
      deferredIntimacy: 0.30,
      narrativeDensity: 0.58,
    },
    {
      sceneNumber: 3,
      sceneHeading: "The Betrayal",
      actNumber: 1,
      tensionScore: 0.78,
      obligationCharge: 0.68,
      deferredIntimacy: 0.45,
      narrativeDensity: 0.65,
    },
    {
      sceneNumber: 4,
      sceneHeading: "The Archive Heist",
      actNumber: 1,
      tensionScore: 0.82,
      obligationCharge: 0.72,
      deferredIntimacy: 0.38,
      narrativeDensity: 0.80,
    },
    // -----------------------------------------------------------------------
    // ACT 2 — Confrontation  (scenes 5-7)
    // -----------------------------------------------------------------------
    {
      sceneNumber: 5,
      sceneHeading: "The Safe House Raid",
      actNumber: 2,
      tensionScore: 0.80,
      obligationCharge: 0.78,
      deferredIntimacy: 0.60,
      narrativeDensity: 0.62,
    },
    {
      sceneNumber: 6,
      sceneHeading: "Cross's Confession",
      actNumber: 2,
      tensionScore: 0.65,
      obligationCharge: 0.75,
      deferredIntimacy: 0.85,
      narrativeDensity: 0.55,
    },
    {
      sceneNumber: 7,
      sceneHeading: "The Mole Revealed",
      actNumber: 2,
      tensionScore: 0.90,
      obligationCharge: 0.82,
      deferredIntimacy: 0.55,
      narrativeDensity: 0.78,
    },
    // -----------------------------------------------------------------------
    // ACT 3 — Climax  (scenes 8-10)
    // -----------------------------------------------------------------------
    {
      sceneNumber: 8,
      sceneHeading: "The Underground Bunker",
      actNumber: 3,
      tensionScore: 0.88,
      obligationCharge: 0.85,
      deferredIntimacy: 0.65,
      narrativeDensity: 0.70,
    },
    {
      sceneNumber: 9,
      sceneHeading: "The Countdown",
      actNumber: 3,
      tensionScore: 0.95,
      obligationCharge: 0.72,
      deferredIntimacy: 0.50,
      narrativeDensity: 0.85,
    },
    {
      sceneNumber: 10,
      sceneHeading: "Zero Hour",
      actNumber: 3,
      tensionScore: 0.70,
      obligationCharge: 0.55,
      deferredIntimacy: 0.40,
      narrativeDensity: 0.60,
    },
  ];

  return raw.map((r) => {
    const narrativePressure = geometricMean([
      r.tensionScore,
      r.obligationCharge,
      r.deferredIntimacy,
    ]);
    const dominantMode = computeDominantMode(
      r.tensionScore,
      r.obligationCharge,
      r.deferredIntimacy,
    );
    return {
      sceneNumber: r.sceneNumber,
      sceneHeading: r.sceneHeading,
      tensionScore: r.tensionScore,
      obligationCharge: r.obligationCharge,
      deferredIntimacy: r.deferredIntimacy,
      narrativeDensity: r.narrativeDensity,
      narrativePressure: Math.round(narrativePressure * 100) / 100,
      actNumber: r.actNumber,
      dominantMode,
    };
  });
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------
function computeSummary(scenes: SceneData[]): Summary {
  const total = scenes.length;
  if (total === 0) {
    return { dominantModeAcrossScenes: "balanced", avgTension: 0, avgObligation: 0 };
  }

  const sumTension = scenes.reduce((s, sc) => s + sc.tensionScore, 0);
  const sumObligation = scenes.reduce((s, sc) => s + sc.obligationCharge, 0);

  const modeCounts: Record<string, number> = {};
  for (const s of scenes) {
    modeCounts[s.dominantMode] = (modeCounts[s.dominantMode] || 0) + 1;
  }
  const dominantMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0][0];

  return {
    dominantModeAcrossScenes: dominantMode,
    avgTension: Math.round((sumTension / total) * 100) / 100,
    avgObligation: Math.round((sumObligation / total) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errRes("Method not allowed. Use POST.", 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { projectId, documentId, mock, sceneIndex } = body as {
      projectId?: string;
      documentId?: string;
      mock?: boolean;
      sceneIndex?: number;
    };

    if (!projectId) {
      return errRes("Missing required field: projectId");
    }

    const isMock = mock !== false;

    let scenes: SceneData[];

    if (isMock) {
      // Return hardcoded Berlin Protocol demo data
      scenes = buildBerlinProtocolDemo();
    } else {
      // Non-mock mode: iterate scenes and call computeObligationTopology per scene
      // Requires the caller to pass scene data since we don't query the DB here
      const inputScenes = (body as any).scenes as
        | { sceneId: string; sceneNumber: number; sceneHeading: string; actNumber: number; sceneText?: string; characterKeys?: string[] }[]
        | undefined;

      if (!inputScenes || !Array.isArray(inputScenes) || inputScenes.length === 0) {
        return errRes(
          "Non-mock mode requires `scenes` array with sceneId, sceneNumber, sceneHeading, actNumber, sceneText, and characterKeys",
        );
      }

      scenes = [];
      for (const input of inputScenes) {
        try {
          const state = computeObligationTopology({
            projectId,
            sceneId: input.sceneId,
            sceneNumber: input.sceneNumber,
            sceneText: input.sceneText || "",
            characterKeys: input.characterKeys || [],
            versionId: documentId || undefined,
            includeActRollup: false,
            actNumber: input.actNumber,
          });

          const tensionScore = state.tensionField.aggregateScore;
          const obligationCharge = state.obligationCharge.chargeScore;
          const deferredIntimacy = state.deferredIntimacy.aggregateIndex;
          const narrativeDensity = state.narrativeDensity.score;
          const narrativePressure = geometricMean([
            tensionScore,
            obligationCharge,
            deferredIntimacy,
          ]);
          const dominantMode = computeDominantMode(
            tensionScore,
            obligationCharge,
            deferredIntimacy,
          );

          scenes.push({
            sceneNumber: input.sceneNumber,
            sceneHeading: input.sceneHeading,
            tensionScore: Math.round(tensionScore * 100) / 100,
            obligationCharge: Math.round(obligationCharge * 100) / 100,
            deferredIntimacy: Math.round(deferredIntimacy * 100) / 100,
            narrativeDensity: Math.round(narrativeDensity * 100) / 100,
            narrativePressure: Math.round(narrativePressure * 100) / 100,
            actNumber: input.actNumber,
            dominantMode,
          });
        } catch (err) {
          console.error(
            `[demo-obligation-data] Error computing scene ${input.sceneId}:`,
            err,
          );
          scenes.push({
            sceneNumber: input.sceneNumber,
            sceneHeading: input.sceneHeading,
            tensionScore: 0,
            obligationCharge: 0,
            deferredIntimacy: 0,
            narrativeDensity: 0,
            narrativePressure: 0,
            actNumber: input.actNumber,
            dominantMode: "balanced",
          });
        }
      }
    }

    // Apply sceneIndex filter if provided
    if (typeof sceneIndex === "number" && sceneIndex >= 0 && sceneIndex < scenes.length) {
      scenes = [scenes[sceneIndex]];
    }

    const summary = computeSummary(scenes);

    return jsonRes({ scenes, summary });
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
