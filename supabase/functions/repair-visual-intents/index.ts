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

            // Capture execution provenance (append-only)
            const execNum = await supabase.rpc('next_execution_number', { p_project_id: intent.project_id });
            // Mark previous executions for this stage as superseded
            const { data: prevExecs } = await supabase
              .from('project_visual_execution_provenance')
              .select('id, generated_asset_ids')
              .eq('project_id', intent.project_id)
              .eq('stage_id', intent.stage_id)
              .eq('is_superseded', false);
            const prevExecIds = (prevExecs ?? []).map((r: any) => r.id);
            let previousAssetIds: string[] = [];
            for (const p of (prevExecs ?? [])) {
              if (p.generated_asset_ids) previousAssetIds.push(...p.generated_asset_ids);
            }

            // Insert provenance row
            const provenanceRow = {
              project_id: intent.project_id,
              repair_intent_id: intent.id,
              execution_number: execNum.data ?? 1,
              stage_id: intent.stage_id,
              recommended_action: intent.recommended_action,
              execution_state: evalRes.ok ? 'completed' : 'failed',
              governance_snapshot_hash: evalResult?.source_snapshot_hash ?? null,
              stale_reason_snapshot: intent.stale_reason_codes ?? null,
              generation_input_hash: null,
              generated_asset_ids: null,
              previous_asset_ids: previousAssetIds.length > 0 ? previousAssetIds : null,
              previous_execution_id: prevExecIds.length > 0 ? prevExecIds[prevExecIds.length - 1] : null,
              is_superseded: false,
              result_summary: evalRes.ok ? { stages_count: evalResult?.stages?.length ?? 0, evaluated_at: evalResult?.evaluated_at } : null,
              error_message: evalRes.ok ? null : JSON.stringify(evalResult),
              executed_at: now,
            };

            const { error: provError } = await supabase
              .from('project_visual_execution_provenance')
              .insert(provenanceRow);

            // Supersede previous executions for this stage
            if (prevExecIds.length > 0) {
              await supabase
                .from('project_visual_execution_provenance')
                .update({ is_superseded: true, superseded_at: now })
                .in('id', prevExecIds);
            }

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

          case "REGENERATE_CANDIDATES": {
            // ── Route based on stage_id ──
            if (intent.stage_id === "hero_frames") {
              // ── Hero Frame Execution ──
              // Guard: stale reason must include CANON_NEWER_THAN_STAGE or CAST_NEWER_THAN_HERO_FRAMES
              const hfAllowedReasons = ["CANON_NEWER_THAN_STAGE", "CAST_NEWER_THAN_HERO_FRAMES"];
              const hasHfReason = (intent.stale_reason_codes ?? []).some(
                (code: string) => hfAllowedReasons.includes(code),
              );
              if (!hasHfReason) {
                return jsonRes(
                  {
                    error: "Stale reason does not qualify for hero-frame regeneration",
                    code: "EXECUTOR_NOT_ENABLED",
                    current_reasons: intent.stale_reason_codes,
                    allowed_reasons: hfAllowedReasons,
                  },
                  400,
                );
              }

              // Guard: preflight must pass
              const preflightUrl =
                `${Deno.env.get("SUPABASE_URL")!}/functions/v1/hero-frame-preflight`;
              const preflightRes = await fetch(preflightUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")!}`,
                },
                body: JSON.stringify({ projectId: intent.project_id }),
              });
              const preflightResult = await preflightRes.json();

              if (!preflightRes.ok || !preflightResult.all_requirements_pass) {
                const failedReqs = (preflightResult.requirements ?? [])
                  .filter((r: any) => !r.passed)
                  .map((r: any) => r.code);
                return jsonRes(
                  {
                    error: "Hero-frame preflight failed",
                    code: "PREFLIGHT_FAILED",
                    failed_requirements: failedReqs,
                    preflight_result: preflightResult,
                  },
                  400,
                );
              }

              // Execute generate-hero-frames
              const hfUrl =
                `${Deno.env.get("SUPABASE_URL")!}/functions/v1/generate-hero-frames`;
              const hfPayload = { project_id: intent.project_id };

              let hfResult: any;
              let hfOk = false;

              try {
                const hfRes = await fetch(hfUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")!}`,
                  },
                  body: JSON.stringify(hfPayload),
                });
                hfResult = await hfRes.json();
                hfOk = hfRes.ok;
              } catch (fetchErr) {
                hfResult = {
                  error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
                };
                hfOk = false;
              }

              // Extract generated hero frame image IDs
              const heroFrameImageIds: string[] = [];
              if (hfOk && hfResult?.results && Array.isArray(hfResult.results)) {
                for (const r of hfResult.results) {
                  if (r.image_id) heroFrameImageIds.push(r.image_id);
                }
              }

              // After hero frame generation, refresh governance
              let governanceResult: any = null;
              try {
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
                governanceResult = evalRes.ok
                  ? await evalRes.json()
                  : { error: "Governance refresh failed" };
              } catch (govErr) {
                governanceResult = {
                  error: govErr instanceof Error ? govErr.message : String(govErr),
                };
              }

              const now = new Date().toISOString();
              const executionResult = {
                invoked_function: "generate-hero-frames",
                input_snapshot: hfPayload,
                output_summary: {
                  success: hfOk,
                  frame_count: heroFrameImageIds.length,
                  hero_frame_image_ids: heroFrameImageIds,
                  meta: hfResult?.meta ?? null,
                },
                governance_refresh: {
                  status: governanceResult?.error ? "failed" : "completed",
                  evaluated_at: governanceResult?.evaluated_at ?? now,
                  stages_count: governanceResult?.stages?.length ?? 0,
                },
                error: hfOk ? undefined : (hfResult?.error ?? "Unknown error"),
              };

              // Capture execution provenance (append-only)
              const execNum = await supabase.rpc("next_execution_number", {
                p_project_id: intent.project_id,
              });
              const { data: prevExecs } = await supabase
                .from("project_visual_execution_provenance")
                .select("id, generated_asset_ids")
                .eq("project_id", intent.project_id)
                .eq("stage_id", intent.stage_id)
                .eq("is_superseded", false);
              const prevExecIds = (prevExecs ?? []).map((r: any) => r.id);
              let previousAssetIds: string[] = [];
              for (const p of prevExecs ?? []) {
                if (p.generated_asset_ids)
                  previousAssetIds.push(...p.generated_asset_ids);
              }

              const genInputStr = JSON.stringify(hfPayload);
              const genInputEncoder = new TextEncoder();
              const genInputHash = await crypto.subtle.digest(
                "SHA-256",
                genInputEncoder.encode(genInputStr),
              );
              const genInputHashHex = Array.from(new Uint8Array(genInputHash))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");

              const provenanceRow = {
                project_id: intent.project_id,
                repair_intent_id: intent.id,
                execution_number: execNum.data ?? 1,
                stage_id: intent.stage_id,
                recommended_action: intent.recommended_action,
                execution_state: hfOk ? "completed" : "failed",
                governance_snapshot_hash:
                  governanceResult?.source_snapshot_hash ?? null,
                stale_reason_snapshot: intent.stale_reason_codes ?? null,
                generation_input_hash: genInputHashHex,
                generated_asset_ids:
                  heroFrameImageIds.length > 0 ? heroFrameImageIds : null,
                previous_asset_ids:
                  previousAssetIds.length > 0 ? previousAssetIds : null,
                previous_execution_id:
                  prevExecIds.length > 0
                    ? prevExecIds[prevExecIds.length - 1]
                    : null,
                is_superseded: false,
                result_summary: hfOk
                  ? {
                      frame_count: heroFrameImageIds.length,
                      hero_frame_image_ids: heroFrameImageIds,
                    }
                  : null,
                error_message: hfOk
                  ? null
                  : (executionResult.error ?? "Unknown error"),
                executed_at: now,
              };

              const { error: provError } = await supabase
                .from("project_visual_execution_provenance")
                .insert(provenanceRow);

              if (prevExecIds.length > 0) {
                await supabase
                  .from("project_visual_execution_provenance")
                  .update({ is_superseded: true, superseded_at: now })
                  .in("id", prevExecIds);
              }

              const updateData: Record<string, unknown> = {
                execution_state: hfOk ? "completed" : "failed",
                executed_at: now,
                execution_result_json: executionResult,
              };

              const { data: updated, error: updateError } = await supabase
                .from("project_visual_repair_intents")
                .update(updateData)
                .eq("id", intentId)
                .select("*")
                .maybeSingle();

              if (updateError) {
                return jsonRes({ error: updateError.message }, 500);
              }

              return jsonRes({ intent: updated });
            }

            // ── Poster Execution (existing) ──
            if (intent.stage_id === "lookbook") {
              // Lookbook execution preflight exists but executor is not enabled
              return jsonRes(
                {
                  error: "Lookbook executor is not enabled yet",
                  code: "EXECUTOR_NOT_ENABLED",
                  recommended_action: intent.recommended_action,
                  stage_id: intent.stage_id,
                  note: "Lookbook execution preflight exists (P11) but executor is not enabled — see lookbook-preflight edge function",
                },
                400,
              );
            }

            if (intent.stage_id !== "poster") {
              return jsonRes(
                {
                  error: "Execution not yet enabled for this action on this stage",
                  code: "EXECUTOR_NOT_ENABLED",
                  recommended_action: intent.recommended_action,
                  stage_id: intent.stage_id,
                },
                400,
              );
            }

            // Guards: stale reason must include HERO_FRAMES_NEWER_THAN_POSTER or VISUAL_STYLE_OUTDATED
            const allowedReasons = ["HERO_FRAMES_NEWER_THAN_POSTER", "VISUAL_STYLE_OUTDATED"];
            const hasAllowedReason = (intent.stale_reason_codes ?? []).some(
              (code: string) => allowedReasons.includes(code),
            );
            if (!hasAllowedReason) {
              return jsonRes(
                {
                  error: "Stale reason does not qualify for poster regeneration",
                  code: "EXECUTOR_NOT_ENABLED",
                  current_reasons: intent.stale_reason_codes,
                  allowed_reasons: allowedReasons,
                },
                400,
              );
            }

            const posterUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/generate-poster`;
            const posterPayload = { project_id: intent.project_id };

            let posterResult: any;
            let posterOk = false;

            try {
              const posterRes = await fetch(posterUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")!}`,
                },
                body: JSON.stringify(posterPayload),
              });
              posterResult = await posterRes.json();
              posterOk = posterRes.ok;
            } catch (fetchErr) {
              posterResult = { error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) };
              posterOk = false;
            }

            // Extract poster candidate ids if available
            const posterCandidateIds: string[] = [];
            if (posterOk && posterResult) {
              // generate-poster can return different shapes
              if (Array.isArray(posterResult)) {
                for (const p of posterResult) {
                  if (p.id) posterCandidateIds.push(p.id);
                }
              } else if (posterResult.data && Array.isArray(posterResult.data)) {
                for (const p of posterResult.data) {
                  if (p.id) posterCandidateIds.push(p.id);
                }
              } else if (posterResult.id) {
                posterCandidateIds.push(posterResult.id);
              } else if (posterResult.poster?.id) {
                posterCandidateIds.push(posterResult.poster.id);
              }
            }

            // After poster generation, refresh governance
            let governanceResult: any = null;
            try {
              const evalUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/evaluate-visual-governance`;
              const evalRes = await fetch(evalUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")!}`,
                },
                body: JSON.stringify({ projectId: intent.project_id }),
              });
              governanceResult = evalRes.ok ? await evalRes.json() : { error: "Governance refresh failed" };
            } catch (govErr) {
              governanceResult = { error: govErr instanceof Error ? govErr.message : String(govErr) };
            }

            const now = new Date().toISOString();
            const executionResult = {
              invoked_function: "generate-poster",
              input_snapshot: posterPayload,
              output_summary: {
                success: posterOk,
                candidate_count: posterCandidateIds.length,
                poster_candidate_ids: posterCandidateIds,
              },
              governance_refresh: {
                status: governanceResult?.error ? "failed" : "completed",
                evaluated_at: governanceResult?.evaluated_at ?? now,
                stages_count: governanceResult?.stages?.length ?? 0,
              },
              error: posterOk ? undefined : (posterResult?.error ?? "Unknown error"),
            };

            // Capture execution provenance (append-only)
            const execNum = await supabase.rpc('next_execution_number', { p_project_id: intent.project_id });
            const { data: prevExecs } = await supabase
              .from('project_visual_execution_provenance')
              .select('id, generated_asset_ids')
              .eq('project_id', intent.project_id)
              .eq('stage_id', intent.stage_id)
              .eq('is_superseded', false);
            const prevExecIds = (prevExecs ?? []).map((r: any) => r.id);
            let previousAssetIds: string[] = [];
            for (const p of (prevExecs ?? [])) {
              if (p.generated_asset_ids) previousAssetIds.push(...p.generated_asset_ids);
            }

            // Compute generation input hash from the poster payload
            const genInputStr = JSON.stringify(posterPayload);
            const genInputEncoder = new TextEncoder();
            const genInputHash = await crypto.subtle.digest('SHA-256', genInputEncoder.encode(genInputStr));
            const genInputHashHex = Array.from(new Uint8Array(genInputHash)).map(b => b.toString(16).padStart(2, '0')).join('');

            const provenanceRow = {
              project_id: intent.project_id,
              repair_intent_id: intent.id,
              execution_number: execNum.data ?? 1,
              stage_id: intent.stage_id,
              recommended_action: intent.recommended_action,
              execution_state: posterOk ? 'completed' : 'failed',
              governance_snapshot_hash: governanceResult?.source_snapshot_hash ?? null,
              stale_reason_snapshot: intent.stale_reason_codes ?? null,
              generation_input_hash: genInputHashHex,
              generated_asset_ids: posterCandidateIds.length > 0 ? posterCandidateIds : null,
              previous_asset_ids: previousAssetIds.length > 0 ? previousAssetIds : null,
              previous_execution_id: prevExecIds.length > 0 ? prevExecIds[prevExecIds.length - 1] : null,
              is_superseded: false,
              result_summary: posterOk ? { candidate_count: posterCandidateIds.length, poster_candidate_ids: posterCandidateIds } : null,
              error_message: posterOk ? null : (executionResult.error ?? 'Unknown error'),
              executed_at: now,
            };

            const { error: provError } = await supabase
              .from('project_visual_execution_provenance')
              .insert(provenanceRow);

            // Supersede previous executions for this stage
            if (prevExecIds.length > 0) {
              await supabase
                .from('project_visual_execution_provenance')
                .update({ is_superseded: true, superseded_at: now })
                .in('id', prevExecIds);
            }

            const updateData: Record<string, unknown> = {
              execution_state: posterOk ? "completed" : "failed",
              executed_at: now,
              execution_result_json: executionResult,
            };

            const { data: updated, error: updateError } = await supabase
              .from("project_visual_repair_intents")
              .update(updateData)
              .eq("id", intentId)
              .select("*")
              .maybeSingle();

            if (updateError) {
              return jsonRes({ error: updateError.message }, 500);
            }

            return jsonRes({ intent: updated });
          }

          default:
            // REFRESH_GOVERNANCE and REGENERATE_CANDIDATES are the only supported actions for execution
            // All other generation actions are explicitly blocked
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