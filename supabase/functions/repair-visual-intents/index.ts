/**
 * Edge Function: repair-visual-intents
 *
 * CRUD-style management for project_visual_repair_intents records.
 * This function ONLY manages repair intent records — it does NOT trigger
 * any visual generation, auto-run, or invoke any other edge function.
 *
 * Actions:
 *   list    — List all repair intents for a project
 *   create  — Create a new repair intent (upsert on conflict)
 *   approve — Approve a pending repair intent
 *   reject  — Reject a pending repair intent
 *   cancel  — Cancel a pending or approved (non-executed) repair intent
 *   execute — Execute an approved repair intent (REFRESH_GOVERNANCE only)
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
    const { action } = body;

    if (!action) {
      return jsonRes({ error: "action is required" }, 400);
    }

    switch (action) {
      // ── LIST ──
      case "list": {
        const { projectId } = body;
        if (!projectId) {
          return jsonRes({ error: "projectId is required" }, 400);
        }

        const { data: intents, error, count } = await supabase
          .from("project_visual_repair_intents")
          .select("*", { count: "exact" })
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });

        if (error) {
          return jsonRes({ error: error.message }, 500);
        }

        return jsonRes({ intents: intents ?? [], count: count ?? 0 });
      }

      // ── CREATE ──
      case "create": {
        const {
          projectId,
          stageId,
          staleReasonCodes,
          recommendedAction,
          intentLabel,
          intentDetail,
          provenanceSnapshot,
          downstreamStages,
          createdBy,
        } = body;

        if (!projectId) {
          return jsonRes({ error: "projectId is required" }, 400);
        }
        if (!stageId) {
          return jsonRes({ error: "stageId is required" }, 400);
        }
        if (!recommendedAction) {
          return jsonRes({ error: "recommendedAction is required" }, 400);
        }
        if (!createdBy) {
          return jsonRes({ error: "createdBy is required" }, 400);
        }

        const { data: inserted, error: insertError } = await supabase
          .from("project_visual_repair_intents")
          .insert({
            project_id: projectId,
            stage_id: stageId,
            stale_reason_codes: staleReasonCodes ?? [],
            recommended_action: recommendedAction,
            intent_label: intentLabel ?? null,
            intent_detail: intentDetail ?? null,
            provenance_snapshot: provenanceSnapshot ?? null,
            downstream_stages: downstreamStages ?? null,
            created_by: createdBy,
          })
          .select("*")
          .maybeSingle();

        if (insertError) {
          return jsonRes({ error: insertError.message }, 500);
        }

        // If ON CONFLICT DO NOTHING resulted in no insert, fetch the existing row
        if (!inserted) {
          const { data: existing, error: fetchError } = await supabase
            .from("project_visual_repair_intents")
            .select("*")
            .eq("project_id", projectId)
            .eq("stage_id", stageId)
            .eq("recommended_action", recommendedAction)
            .maybeSingle();

          if (fetchError) {
            return jsonRes({ error: fetchError.message }, 500);
          }

          return jsonRes({ intent: existing ?? null });
        }

        return jsonRes({ intent: inserted });
      }

      // ── APPROVE ──
      case "approve": {
        const { intentId, userId } = body;
        if (!intentId) {
          return jsonRes({ error: "intentId is required" }, 400);
        }

        const { data: updated, error: updateError } = await supabase
          .from("project_visual_repair_intents")
          .update({
            approval_state: "approved",
            approved_at: new Date().toISOString(),
            approved_by: userId ?? null,
          })
          .eq("id", intentId)
          .eq("approval_state", "pending")
          .select("*")
          .maybeSingle();

        if (updateError) {
          return jsonRes({ error: updateError.message }, 500);
        }

        if (!updated) {
          return jsonRes(
            { error: "Intent not found or not in pending state" },
            404,
          );
        }

        return jsonRes({ intent: updated });
      }

      // ── REJECT ──
      case "reject": {
        const { intentId, reason } = body;
        if (!intentId) {
          return jsonRes({ error: "intentId is required" }, 400);
        }

        const updateData: Record<string, unknown> = {
          approval_state: "rejected",
          rejection_reason: reason ?? null,
        };

        const { data: updated, error: updateError } = await supabase
          .from("project_visual_repair_intents")
          .update(updateData)
          .eq("id", intentId)
          .eq("approval_state", "pending")
          .select("*")
          .maybeSingle();

        if (updateError) {
          return jsonRes({ error: updateError.message }, 500);
        }

        if (!updated) {
          return jsonRes(
            { error: "Intent not found or not in pending state" },
            404,
          );
        }

        return jsonRes({ intent: updated });
      }

      // ── CANCEL ──
      case "cancel": {
        const { intentId } = body;
        if (!intentId) {
          return jsonRes({ error: "intentId is required" }, 400);
        }

        const { data: updated, error: updateError } = await supabase
          .from("project_visual_repair_intents")
          .update({ approval_state: "cancelled" })
          .eq("id", intentId)
          .in("approval_state", ["pending", "approved"])
          .select("*")
          .maybeSingle();

        if (updateError) {
          return jsonRes({ error: updateError.message }, 500);
        }

        if (!updated) {
          return jsonRes(
            { error: "Intent not found or not in pending/approved state" },
            404,
          );
        }

        return jsonRes({ intent: updated });
      }

      // ── EXECUTE ──
      case "execute": {
        const { intentId } = body;
        if (!intentId) {
          return jsonRes({ error: "intentId is required" }, 400);
        }

        // Fetch the intent
        const { data: intent, error: fetchError } = await supabase
          .from("project_visual_repair_intents")
          .select("*")
          .eq("id", intentId)
          .maybeSingle();

        if (fetchError) {
          return jsonRes({ error: fetchError.message }, 500);
        }

        if (!intent) {
          return jsonRes({ error: "Intent not found" }, 404);
        }

        // Validate approval state
        if (intent.approval_state !== "approved") {
          return jsonRes(
            {
              error: "Cannot execute intent that is not approved",
              current_state: intent.approval_state,
            },
            400,
          );
        }

        // Validate execution state
        if (!["queued", "ready"].includes(intent.execution_state)) {
          return jsonRes(
            {
              error: "Intent already executed or blocked",
              current_execution_state: intent.execution_state,
            },
            400,
          );
        }

        const now = new Date().toISOString();

        // Route based on recommended_action
        switch (intent.recommended_action) {
          case "REFRESH_GOVERNANCE": {
            // Re-evaluate visual governance (read-only, no generation)
            const evalUrl =
              `${Deno.env.get("SUPABASE_URL")!}/functions/v1/evaluate-visual-governance`;
            const evalRes = await fetch(evalUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")!}`,
              },
              body: JSON.stringify({ projectId: intent.project_id }),
            });
            const evalResult = await evalRes.json();

            if (evalRes.ok) {
              const { data: updated, error: updateError } = await supabase
                .from("project_visual_repair_intents")
                .update({
                  execution_state: "completed",
                  executed_at: now,
                  execution_result_json: {
                    ...evalResult,
                    evaluated_at: now,
                  },
                })
                .eq("id", intentId)
                .select("*")
                .maybeSingle();

              if (updateError) {
                return jsonRes({ error: updateError.message }, 500);
              }

              return jsonRes({ intent: updated });
            } else {
              const { data: updated, error: updateError } = await supabase
                .from("project_visual_repair_intents")
                .update({
                  execution_state: "failed",
                  executed_at: now,
                  execution_result_json: {
                    error: evalResult,
                    evaluated_at: now,
                  },
                })
                .eq("id", intentId)
                .select("*")
                .maybeSingle();

              if (updateError) {
                return jsonRes({ error: updateError.message }, 500);
              }

              return jsonRes({ intent: updated });
            }
          }

          default:
            // REFRESH_GOVERNANCE is the only supported action for execution
            // All generation actions are explicitly blocked
            return jsonRes(
              {
                error: "Execution not yet enabled for this action",
                code: "EXECUTOR_NOT_ENABLED",
                recommended_action: intent.recommended_action,
              },
              400,
            );
        }
      }

      default:
        return jsonRes(
          { error: `Unknown action: ${action}. Supported: list, create, approve, reject, cancel, execute` },
          400,
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message }, 500);
  }
});