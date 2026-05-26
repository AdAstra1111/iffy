/**
 * Edge Function: review-visual-execution
 *
 * Allows human review of visual execution outputs.
 * Sets review_state on project_visual_execution_provenance rows.
 *
 * This function does NOT trigger any generation, mutation of assets,
 * or auto-run. It only sets review state.
 *
 * POST /review-visual-execution
 * Body: { executionId: string, reviewState: string, reviewNotes?: string, userId?: string }
 *
 * Valid review states:
 *   accepted — generated outputs are approved for downstream use
 *   rejected — generated outputs are unacceptable
 *   needs_revision — outputs need fixes (suggests repair intent)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_REVIEW_STATES = ["pending_review", "accepted", "rejected", "needs_revision"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { executionId, reviewState, reviewNotes, userId } = body;

    if (!executionId) {
      return jsonRes({ error: "executionId is required" }, 400);
    }

    if (!reviewState) {
      return jsonRes({ error: "reviewState is required" }, 400);
    }

    if (!VALID_REVIEW_STATES.includes(reviewState)) {
      return jsonRes(
        {
          error: `Invalid reviewState. Must be one of: ${VALID_REVIEW_STATES.join(", ")}`,
          valid_states: VALID_REVIEW_STATES,
        },
        400,
      );
    }

    // Fetch the execution row to verify it exists
    const { data: execution, error: fetchError } = await supabase
      .from("project_visual_execution_provenance")
      .select("id, execution_state, review_state")
      .eq("id", executionId)
      .maybeSingle();

    if (fetchError) {
      return jsonRes({ error: fetchError.message }, 500);
    }

    if (!execution) {
      return jsonRes({ error: "Execution not found" }, 404);
    }

    // Can only review completed or partial executions
    if (!["completed", "partial"].includes(execution.execution_state)) {
      return jsonRes(
        {
          error: "Can only review completed or partial executions",
          current_execution_state: execution.execution_state,
        },
        400,
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      review_state: reviewState,
      review_notes: reviewNotes ?? null,
      reviewed_at: now,
      reviewed_by: userId ?? null,
    };

    const { data: updated, error: updateError } = await supabase
      .from("project_visual_execution_provenance")
      .update(updateData)
      .eq("id", executionId)
      .select("*")
      .maybeSingle();

    if (updateError) {
      return jsonRes({ error: updateError.message }, 500);
    }

    return jsonRes({
      execution: updated,
      message: reviewState === "accepted"
        ? "Execution outputs accepted — they can now satisfy downstream preflight"
        : reviewState === "rejected"
        ? "Execution outputs rejected — they will block downstream preflight until resolved"
        : reviewState === "needs_revision"
        ? "Execution flagged for revision — create a new repair intent"
        : "Review state reset to pending_review",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message }, 500);
  }
});