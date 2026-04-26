/**
 * trend-opportunity-engine — Phase 2.3 Market Signal Mapping
 *
 * Maps external signals (cultural, market, format, talent, geopolitical)
 * to canonical IFFY project attributes. Read-only — no canonical writes.
 *
 * Signal sources (pre-existing tables):
 *   trend_signals — active market/cultural/format signals
 *   cast_trends — talent availability signals
 *
 * Canonical reads:
 *   projects — project metadata (format, lane, budget)
 *   project_documents — document existence per project
 *   project_document_versions.meta_json — convergence scores as baseline
 *   narrative_engines — structural pattern for thematic mapping
 *
 * NO canonical writes. Signals are overlay data.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Types ─────────────────────────────────────────────────────────────────

type SignalType = "cultural" | "market" | "format" | "talent" | "geopolitical";
type SignalStrength = "rising" | "peak" | "declining" | "emerging";
type TimeSensitivity = "immediate" | "3months" | "6months" | "12months";
type Confidence = "high" | "medium" | "low";

interface SignalMapping {
  signal_id: string;
  signal_type: SignalType;
  signal_label: string;
  signal_strength: SignalStrength;
  relevance_to_project: number | null;   // null = thematic signal, no beat sheet
  opportunity_score: number;            // 0-100
  risk_score: number;                    // 0-100
  reasoning: string;
  recommended_action: string;
  time_sensitivity: TimeSensitivity;
  data_freshness: string;                // ISO or "STALE"
}

interface ProjectOpportunityRadar {
  project_id: string;
  project_name: string;
  format: string;
  genre: string;
  aggregate_opportunity_score: number;
  aggregate_risk_score: number;
  top_opportunity: SignalMapping | null;
  top_risk: SignalMapping | null;
  recommended_positioning_adjustment: string;
  signal_count: number;
  confidence: Confidence;
  generated_at: string;
}

interface TrendOpportunityOutput {
  project_id: string;
  status: "ok" | "no_profile" | "no_signals" | "insufficient_data";
  radar: ProjectOpportunityRadar | null;
  signals_by_category: {
    cultural: SignalMapping[];
    market: SignalMapping[];
    format: SignalMapping[];
    talent: SignalMapping[];
    geopolitical: SignalMapping[];
  };
  confidence: Confidence;
  generated_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert trend_signals row → SignalMapping */
function mapSignal(row: any, relevanceOverride: number | null, reasoning: string): SignalMapping {
  const velocity = (row.velocity || "stable").toLowerCase();
  const isRising = velocity === "rising" || velocity === "emerging";
  const isFalling = velocity === "declining";

  const saturationRisk = row.saturation_risk ?? "medium";
  const saturationScore = saturationRisk === "high" ? 70 : saturationRisk === "medium" ? 40 : 15;

  // Opportunity = signal strength + rising bonus, reduced by saturation risk
  const opportunityScore = isRising
    ? Math.min(100, (row.strength ?? 5) * 8 + 20 - saturationScore * 0.3)
    : Math.max(0, (row.strength ?? 5) * 6 - saturationScore * 0.2);

  // Risk = declining + high saturation
  const riskScore = isFalling
    ? Math.min(100, (row.strength ?? 5) * 8 + 15)
    : saturationScore;

  // Time sensitivity: derived from cycle_phase + velocity
  let timeSensitivity: TimeSensitivity = "6months";
  if (velocity === "rising" && row.cycle_phase === "early") timeSensitivity = "immediate";
  else if (velocity === "rising") timeSensitivity = "3months";
  else if (velocity === "peak") timeSensitivity = "3months";
  else if (isFalling) timeSensitivity = "12months";

  // Data freshness check (30-day staleness)
  const lastUpdated = row.last_updated_at ?? row.created_at;
  const daysSinceUpdate = lastUpdated
    ? (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  const dataFreshness = daysSinceUpdate > 30 ? "STALE" : (lastUpdated ?? "unknown");

  // Recommended action
  const recommendedAction = isFalling
    ? "Monitor — signal declining. Assess if project positioning needs adjustment."
    : isRising && saturationRisk === "high"
    ? "Act now — rising signal with saturation risk. Time-sensitive window."
    : isRising
    ? "Accelerate — rising signal. Favorable window for positioning."
    : "Hold — stable signal. No urgency.";

  return {
    signal_id: row.id,
    signal_type: normalizeCategory(row.category),
    signal_label: row.name,
    signal_strength: normalizeStrength(velocity),
    relevance_to_project: relevanceOverride,
    opportunity_score: Math.round(opportunityScore),
    risk_score: Math.round(riskScore),
    reasoning,
    recommended_action: recommendedAction,
    time_sensitivity: timeSensitivity,
    data_freshness: dataFreshness,
  };
}

function normalizeCategory(cat: string | null): SignalType {
  if (!cat) return "market";
  const lower = cat.toLowerCase();
  if (lower.includes("genre") || lower.includes("cultural") || lower.includes("social") || lower.includes("audience") || lower.includes("political"))
    return "cultural";
  if (lower.includes("market") || lower.includes("commercial") || lower.includes("box office") || lower.includes("streaming"))
    return "market";
  if (lower.includes("format") || lower.includes("platform") || lower.includes("episode") || lower.includes("runtime"))
    return "format";
  if (lower.includes("talent") || lower.includes("cast") || lower.includes("director") || lower.includes("crew"))
    return "talent";
  if (lower.includes("geopolitical") || lower.includes("trade") || lower.includes("export") || lower.includes("censor"))
    return "geopolitical";
  return "market";
}

function normalizeStrength(vel: string): SignalStrength {
  switch ((vel || "stable").toLowerCase()) {
    case "rising": return "rising";
    case "emerging": return "emerging";
    case "peak": return "peak";
    case "declining": return "declining";
    default: return "peak";
  }
}

// ── Core engine ─────────────────────────────────────────────────────────────

async function buildSignalsForProject(
  supabase: any,
  projectId: string,
  format: string | null,
  lane: string | null,
): Promise<{
  signalsByCategory: Record<SignalType, SignalMapping[]>;
  hasSignals: boolean;
}> {
  const result: Record<SignalType, SignalMapping[]> = {
    cultural: [], market: [], format: [], talent: [], geopolitical: [],
  };

  // ── Fetch trend_signals (cultural/market/format/geopolitical) ──
  // Filter by format and lane
  let q = supabase
    .from("trend_signals")
    .select("*")
    .eq("status", "active")
    .order("strength", { ascending: false })
    .limit(100);

  const { data: signals } = await q;

  if (!signals || signals.length === 0) {
    return { signalsByCategory: result, hasSignals: false };
  }

  // Compute relevance per signal based on format/lane match
  for (const row of signals) {
    const relevance = computeRelevance(row, format, lane);
    if (relevance === 0) continue; // Not relevant to this project

    const reasoning = buildReasoning(row, format, lane, relevance);
    const mapped = mapSignal(row, relevance, reasoning);
    const cat = mapped.signal_type;
    if (result[cat]) result[cat].push(mapped);
  }

  // ── Fetch cast_trends (talent signals) ──
  let castQ = supabase
    .from("cast_trends")
    .select("*")
    .eq("status", "active")
    .order("strength", { ascending: false })
    .limit(30);

  const { data: castSignals } = await castQ;

  if (castSignals) {
    for (const row of castSignals) {
      const relevance = computeCastRelevance(row, format, lane);
      if (relevance === 0) continue;

      const reasoning = `${row.actor_name ?? row.trend_type ?? "Talent"} trending. ${row.explanation ?? ""}`;
      const velocity = (row.velocity || "stable").toLowerCase();
      const saturationRisk = row.saturation_risk ?? "medium";
      const saturationScore = saturationRisk === "high" ? 70 : saturationRisk === "medium" ? 40 : 15;
      const opportunityScore = Math.min(100, (row.strength ?? 5) * 8 + 10 - saturationScore * 0.2);
      const riskScore = saturationScore;

      const lastUpdated = row.last_updated ?? row.created_at;
      const daysSince = lastUpdated ? (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
      const dataFreshness = daysSince > 30 ? "STALE" : (lastUpdated ?? "unknown");

      result.talent.push({
        signal_id: row.id,
        signal_type: "talent",
        signal_label: row.actor_name ?? row.trend_type ?? "Talent Signal",
        signal_strength: normalizeStrength(velocity),
        relevance_to_project: relevance,
        opportunity_score: Math.round(opportunityScore),
        risk_score: Math.round(riskScore),
        reasoning,
        recommended_action: velocity === "rising" ? "Consider attach — talent trending" : "Monitor",
        time_sensitivity: "3months",
        data_freshness: dataFreshness,
      });
    }
  }

  return {
    signalsByCategory: result,
    hasSignals: result.cultural.length + result.market.length + result.format.length + result.talent.length + result.geopolitical.length > 0,
  };
}

function computeRelevance(row: any, format: string | null, lane: string | null): number {
  let score = 30; // baseline relevance

  // Format match
  if (format && row.production_type) {
    const pt = (row.production_type || "").toLowerCase();
    if (pt === format || pt.includes(format) || format.includes(pt)) {
      score += 30;
    } else {
      score -= 20;
    }
  }

  // Lane relevance
  if (lane && row.lane_relevance) {
    const lanes = Array.isArray(row.lane_relevance) ? row.lane_relevance : [];
    if (lanes.includes(lane)) {
      score += 20;
    } else if (lanes.length > 0) {
      score -= 10;
    }
  }

  // Genre tags overlap
  if (row.genre_tags && Array.isArray(row.genre_tags) && row.genre_tags.length > 0) {
    score += 10; // baseline bonus for having genre tags
  }

  // Format tags overlap
  if (row.format_tags && Array.isArray(row.format_tags) && row.format_tags.length > 0) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function computeCastRelevance(row: any, format: string | null, _lane: string | null): number {
  let score = 25;

  if (format && row.production_type) {
    const pt = (row.production_type || "").toLowerCase();
    if (pt === format || pt.includes(format)) score += 25;
    else score -= 15;
  }

  if (row.genre_relevance) score += 10;

  return Math.max(0, Math.min(100, score));
}

function buildReasoning(row: any, format: string | null, lane: string | null, relevance: number): string {
  const parts: string[] = [];

  if (format && row.production_type) {
    const pt = (row.production_type || "").toLowerCase();
    const match = pt === format || pt.includes(format) || format.includes(pt);
    parts.push(`Format: ${match ? "matches" : "differs from"} project (${format})`);
  }

  if (lane && row.lane_relevance) {
    const lanes = Array.isArray(row.lane_relevance) ? row.lane_relevance : [];
    parts.push(`Lane: ${lanes.includes(lane) ? "directly relevant" : "peripheral"} to ${lane}`);
  }

  if (row.explanation) {
    parts.push(`${(row.explanation || "").slice(0, 80)}`);
  }

  if (row.forecast) {
    parts.push(`Forecast: ${row.forecast}`);
  }

  return parts.join(". ") || `Signal (strength=${row.strength}/10, ${row.velocity})`;
}

// ── Aggregate ───────────────────────────────────────────────────────────────

function computeRadar(
  projectId: string,
  projectName: string,
  format: string | null,
  signalsByCategory: Record<SignalType, SignalMapping[]>,
  confidence: Confidence,
): ProjectOpportunityRadar {
  // Flatten all signals with non-null relevance
  const allWithRelevance = (Object.values(signalsByCategory) as SignalMapping[][])
    .flat()
    .filter(s => s.relevance_to_project !== null && s.relevance_to_project > 0);

  if (allWithRelevance.length === 0) {
    return {
      project_id: projectId,
      project_name: projectName,
      format: format ?? "unknown",
      genre: "",
      aggregate_opportunity_score: 0,
      aggregate_risk_score: 0,
      top_opportunity: null,
      top_risk: null,
      recommended_positioning_adjustment: "Insufficient signal data — add trend signals for this project",
      signal_count: 0,
      confidence,
      generated_at: new Date().toISOString(),
    };
  }

  // Weighted aggregate (relevance as weight)
  const totalRelevance = allWithRelevance.reduce((sum, s) => sum + (s.relevance_to_project ?? 0), 0);
  const aggregateOpportunity = allWithRelevance.reduce(
    (sum, s) => sum + s.opportunity_score * (s.relevance_to_project ?? 0), 0
  ) / totalRelevance;
  const aggregateRisk = allWithRelevance.reduce(
    (sum, s) => sum + s.risk_score * (s.relevance_to_project ?? 0), 0
  ) / totalRelevance;

  // Top opportunity: highest (opportunity × relevance)
  const topOpportunity = allWithRelevance.reduce(
    (best, s) => {
      const score = s.opportunity_score * (s.relevance_to_project ?? 0);
      const bestScore = best ? best.opportunity_score * (best.relevance_to_project ?? 0) : 0;
      return score > bestScore ? s : best;
    },
    null as SignalMapping | null,
  );

  // Top risk: highest risk × relevance
  const topRisk = allWithRelevance.reduce(
    (best, s) => {
      const score = s.risk_score * (s.relevance_to_project ?? 0);
      const bestScore = best ? best.risk_score * (best.relevance_to_project ?? 0) : 0;
      return score > bestScore ? s : best;
    },
    null as SignalMapping | null,
  );

  // Recommended positioning
  const risingSignals = allWithRelevance.filter(s => s.signal_strength === "rising" && s.relevance_to_project && s.relevance_to_project > 40);
  const decliningSignals = allWithRelevance.filter(s => s.signal_strength === "declining" && s.relevance_to_project && s.relevance_to_project > 40);

  let positioning = "";
  if (risingSignals.length > 0) {
    const topRising = risingSignals[0];
    positioning = `Accelerate positioning around "${topRising.signal_label}" — rising signal (${topRising.signal_strength}). ${topRising.recommended_action}`;
  } else if (decliningSignals.length > 0) {
    const topDeclining = decliningSignals[0];
    positioning = `Review positioning — "${topDeclining.signal_label}" is declining. ${topDeclining.recommended_action}`;
  } else {
    positioning = "Signal environment stable. No immediate positioning shift required.";
  }

  return {
    project_id: projectId,
    project_name: projectName,
    format: format ?? "unknown",
    genre: "",
    aggregate_opportunity_score: Math.round(aggregateOpportunity),
    aggregate_risk_score: Math.round(aggregateRisk),
    top_opportunity: topOpportunity,
    top_risk: topRisk,
    recommended_positioning_adjustment: positioning,
    signal_count: allWithRelevance.length,
    confidence,
    generated_at: new Date().toISOString(),
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
    });
  }

  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return Response.json({ error: "projectId required" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Fetch project ──
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, title, format, genres, budget_range, tone, assigned_lane")
      .eq("id", projectId)
      .maybeSingle();

    if (projErr || !project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const format = project.format ?? null;
    const lane = project.assigned_lane ?? null;

    // ── Build signals ──
    const { signalsByCategory, hasSignals } = await buildSignalsForProject(
      supabase, projectId, format, lane
    );

    // ── Determine confidence ──
    // High: has signals + project has convergence scores
    // Medium: has signals, no convergence scores
    // Low: no signals
    let confidence: Confidence = "medium";
    if (!hasSignals) {
      confidence = "low";
    } else {
      // Check if project has convergence scores in meta_json
      const { data: versions } = await supabase
        .from("project_document_versions")
        .select("meta_json")
        .eq("project_id", projectId)
        .not("meta_json", "is", null)
        .limit(5);

      const hasConvergence = versions?.some(v => v.meta_json?.ci != null) ?? false;
      if (hasConvergence) confidence = "high";
    }

    // ── Build radar ──
    const radar = computeRadar(projectId, project.title, format, signalsByCategory, confidence);

    // ── Determine status ──
    let status: TrendOpportunityOutput["status"] = "ok";
    if (!hasSignals) status = "no_signals";
    else if (!format) status = "no_profile";

    const output: TrendOpportunityOutput = {
      project_id: projectId,
      status,
      radar,
      signals_by_category: {
        cultural: signalsByCategory.cultural,
        market: signalsByCategory.market,
        format: signalsByCategory.format,
        talent: signalsByCategory.talent,
        geopolitical: signalsByCategory.geopolitical,
      },
      confidence,
      generated_at: new Date().toISOString(),
    };

    // Remove empty categories
    for (const cat of Object.keys(output.signals_by_category) as SignalType[]) {
      if (output.signals_by_category[cat].length === 0) {
        // Keep array but empty — this is "category absent" per spec
      }
    }

    return Response.json(output, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err: any) {
    console.error("[trend-opportunity-engine] error:", err.message);
    return Response.json({ error: err.message || "Internal error" }, { status: 500 });
  }
});