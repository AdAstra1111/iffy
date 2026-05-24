// ── Analyze Handler ──
// Lazy-loaded module. Receives context from index.ts router.

export async function handle(ctx: {
  supabase: any;
  user: { id: string | null; email?: string };
  userId: string | null;
  corsHeaders: Record<string, string>;
  body: Record<string, any>;
  action: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}): Promise<Response> {
  const { supabase, user, userId, corsHeaders, body, action } = ctx;
  
// Accept both camelCase and snake_case from payload as final override
      const payloadDuration = body.episodeTargetDurationSeconds ?? body.episode_target_duration_seconds ?? null;
      const payloadDurationMin = body.episode_target_duration_min_seconds ?? null;
      const payloadDurationMax = body.episode_target_duration_max_seconds ?? null;
      const payloadCount = body.seasonEpisodeCount ?? body.season_episode_count ?? null;

      const gc = project?.guardrails_config || {};
      const gquals = gc?.overrides?.qualifications || {};
      const fmtDefaults = FORMAT_DEFAULTS_ENGINE[effectiveFormat] || {};
      // Canon values override all legacy values (highest priority after explicit payload)
      const effectiveDuration = payloadDuration || canonEpisodeMeta.min || rq.episode_target_duration_seconds || project?.episode_target_duration_seconds || gquals.episode_target_duration_seconds || fmtDefaults.episode_target_duration_seconds || null;
      const effectiveDurationMin = payloadDurationMin || canonEpisodeMeta.min || rq.episode_target_duration_min_seconds || (project as any)?.episode_target_duration_min_seconds || gquals.episode_target_duration_min_seconds || fmtDefaults.episode_target_duration_min_seconds || effectiveDuration || null;
      const effectiveDurationMax = payloadDurationMax || canonEpisodeMeta.max || rq.episode_target_duration_max_seconds || (project as any)?.episode_target_duration_max_seconds || gquals.episode_target_duration_max_seconds || fmtDefaults.episode_target_duration_max_seconds || effectiveDuration || null;
      const effectiveSeasonCount = payloadCount || canonEpisodeMeta.episode_count || rq.season_episode_count || (project as any)?.season_episode_count || gquals.season_episode_count || fmtDefaults.season_episode_count || null;

      // Vertical drama: require episode duration (min or max or scalar)
      if (effectiveFormat === "vertical-drama" && !effectiveDuration && !effectiveDurationMin) {
        throw new Error("episode_target_duration is required for vertical drama format");
      }

      // Fetch season config for vertical drama
      const seasonEpisodeCount = effectiveSeasonCount;
      let seasonArchitecture: any = null;
      if (effectiveFormat === "vertical-drama" && seasonEpisodeCount) {
        // Compute season architecture inline (mirrors dev-os-config.ts logic)
        const E = seasonEpisodeCount;
        if (E >= 10) {
          const actSize = Math.floor(E * 0.2);
          const remainder = E - actSize * 5;
          const acts: any[] = [];
          let cursor = 1;
          for (let a = 1; a <= 5; a++) {
            const extra = a > (5 - remainder) ? 1 : 0;
            const count = actSize + extra;
            acts.push({ act: a, start_episode: cursor, end_episode: cursor + count - 1, episode_count: count });
            cursor += count;
          }
          seasonArchitecture = {
            model: "5-act", episode_count: E, acts,
            anchors: { reveal_index: Math.round(E * 0.25), mid_index: Math.round(E * 0.50), pre_finale_index: Math.round(E * 0.80), finale_index: E },
          };
        } else {
          const act1 = Math.round(E * 0.3); const act3 = Math.round(E * 0.3); const act2 = E - act1 - act3;
          seasonArchitecture = {
            model: "3-act", episode_count: E,
            acts: [
              { act: 1, start_episode: 1, end_episode: act1, episode_count: act1 },
              { act: 2, start_episode: act1 + 1, end_episode: act1 + act2, episode_count: act2 },
              { act: 3, start_episode: act1 + act2 + 1, end_episode: E, episode_count: act3 },
            ],
            anchors: { reveal_index: Math.round(E * 0.33), mid_index: Math.round(E * 0.55), finale_index: E },
          };
        }
      }

      // Build deliverable-aware system prompt (routing order: deliverable → format → behavior)
      const baseSystemPrompt = buildAnalyzeSystem(effectiveDeliverable, effectiveFormat, effectiveBehavior, effectiveDurationMin, effectiveDurationMax);

      // Inject guardrails with per-engine mode support
      const guardrails = buildGuardrailBlock({
        project: project ? { ...project, production_type: effectiveProductionType, guardrails_config: (project as any).guardrails_config } : undefined,
        productionType: effectiveFormat,
        engineName: "dev-engine-v2",
        corpusEnabled: !!body.corpusEnabled,
        corpusCalibration: body.corpusCalibration,
      });
      const systemPrompt = composeSystem({ baseSystem: baseSystemPrompt, guardrailsBlock: guardrails.textBlock });
      console.log(`[dev-engine-v2] guardrails: profile=${guardrails.profileName}, hash=${guardrails.hash}, mode=${guardrails.policy.engineMode}`);

            const prevContext = ""; // score anchoring removed — causes LLM variance on re-analysis


      let seasonContext = "";
      if (seasonArchitecture) {
        seasonContext = `\nSEASON ARCHITECTURE: ${seasonArchitecture.episode_count} episodes, ${seasonArchitecture.model} model. Anchors: reveal=${seasonArchitecture.anchors.reveal_index}, midpoint=${seasonArchitecture.anchors.mid_index}${seasonArchitecture.anchors.pre_finale_index ? `, pre-finale=${seasonArchitecture.anchors.pre_finale_index}` : ""}, finale=${seasonArchitecture.anchors.finale_index}.`;
      }

      // Build canonical qualification binding + episode length block for prompt
      const episodeLengthBlock = buildEpisodeLengthBlock(project, gquals, fmtDefaults);
      let qualBinding = "";
      if (rq.is_series && rq.season_episode_count) {
        const durMin = effectiveDurationMin;
        const durMax = effectiveDurationMax;
        const durMid = durMin && durMax ? Math.round((durMin + durMax) / 2) : (durMin || durMax || null);
        const durRangeStr = (durMin && durMax && durMin !== durMax)
          ? `${durMin}–${durMax} seconds (midpoint ${durMid}s)`
          : `${durMid || 'N/A'} seconds`;
        qualBinding = `\nCANONICAL QUALIFICATIONS (authoritative — ignore older references to different values):
Target season length: ${rq.season_episode_count} episodes.
Episode target duration range: ${durRangeStr}.
Format: ${rq.format}.${episodeLengthBlock}`;
      } else if (episodeLengthBlock) {
        qualBinding = episodeLengthBlock;
      }

      // ── Signal Context Injection ──
      let signalContext = "";
      if (body.skipSignals) {
        console.log("[dev-engine-v2] Signals disabled for this run (skipSignals=true)");
      } else try {
        const { data: projSettings } = await supabase.from("projects")
          .select("signals_influence, signals_apply")
          .eq("id", projectId).single();
        const influence = (projSettings as any)?.signals_influence ?? 0.5;
        const applyConfig = (projSettings as any)?.signals_apply ?? { pitch: true, dev: true, grid: true, doc: true };
        if (!applyConfig.dev) {
          console.log("[dev-engine-v2] Signals disabled via signals_apply.dev=false");
        } else if (applyConfig.dev) {
          const { data: matches } = await supabase
            .from("project_signal_matches")
            .select("id, relevance_score, impact_score, rationale, cluster:cluster_id(name, category, strength, velocity, saturation_risk, explanation)")
            .eq("project_id", projectId)
            .order("impact_score", { ascending: false })
            .order("id", { ascending: true })
            .limit(3);
          if (matches && matches.length > 0) {
            const fmt = effectiveFormat === "vertical-drama" ? "vertical_drama" : effectiveFormat === "documentary" ? "documentary" : "film";
            const influenceLabel = influence >= 0.65 ? "HIGH" : influence >= 0.35 ? "MODERATE" : "LOW";
            const fmtNote = fmt === "vertical_drama" ? "Apply retention mechanics — cliff cadence, reveal pacing, twist density."
              : fmt === "documentary" ? "Apply truth constraints — access/evidence plan. Signals inform subject positioning only."
              : "Apply budget realism, lane liquidity, and saturation warnings.";
            const lines = matches.map((m: any, i: number) => {
              const c = m.cluster;
              return `${i+1}. ${c?.name || "Signal"} [${c?.category || ""}] — strength ${c?.strength || 0}/10, ${c?.velocity || "Stable"}, saturation ${c?.saturation_risk || "Low"}\n   ${c?.explanation || ""}`;
            }).join("\n");
            signalContext = `\n=== MARKET & FORMAT SIGNALS (influence: ${influenceLabel}) ===\n${fmtNote}\n${lines}\n=== END SIGNALS ===`;
          }
        }
      } catch (e) {
        console.warn("[dev-engine-v2] Signal context fetch failed (non-fatal):", e);
      }

      // ── Locked Decisions Injection ──
      let lockedDecisionsContext = "";
      try {
        const { data: decisions } = await supabase.from("decision_ledger")
          .select("decision_key, title, decision_text")
          .eq("project_id", projectId)
          .eq("status", "active")
          .order("decision_key", { ascending: true })
          .limit(20);
        if (decisions && decisions.length > 0) {
          const bullets = decisions.map((d: any) => `- [${d.decision_key}] ${d.decision_text}`).join("\n");
          lockedDecisionsContext = `\n\nLOCKED DECISIONS (MUST FOLLOW — treat as canon, do not re-open):\n${bullets}`;
        }
      } catch (e) {
        console.warn("[dev-engine-v2] Locked decisions fetch failed (non-fatal):", e);
      }

      // ── Canon OS Context block (FULL canon injection) ──
      let canonOSContext = "";
      if (canonJson) {
        const parts: string[] = [];
        if (canonJson.title) parts.push(`Title: ${canonJson.title}`);
        if (canonJson.logline && typeof canonJson.logline === "string" && canonJson.logline.trim()) parts.push(`Logline: ${canonJson.logline}`);
        if (canonJson.premise && typeof canonJson.premise === "string" && canonJson.premise.trim()) parts.push(`Premise: ${canonJson.premise}`);
        if (canonJson.format) parts.push(`Format: ${canonJson.format}`);
        if (canonJson.genre) parts.push(`Genre: ${canonJson.genre}`);
        if (canonJson.tone) parts.push(`Tone: ${canonJson.tone}`);
        if (canonJson.tone_style && typeof canonJson.tone_style === "string" && canonJson.tone_style.trim()) parts.push(`Tone & Style: ${canonJson.tone_style}`);
        if (canonEpisodeMeta.episode_count) parts.push(`Episode count: ${canonEpisodeMeta.episode_count}`);
        if (canonEpisodeMeta.min != null && canonEpisodeMeta.max != null) {
          parts.push(`Episode duration range: ${canonEpisodeMeta.min}–${canonEpisodeMeta.max}s`);
        }
        // Characters
        if (Array.isArray(canonJson.characters) && canonJson.characters.length > 0) {
          const charLines = canonJson.characters
            .filter((c: any) => c.name && c.name.trim())
            .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
            .map((c: any) => {
              const details = [c.role, c.goals, c.traits].filter(Boolean).join("; ");
              return `  - ${c.name}${details ? `: ${details}` : ""}`;
            });
          if (charLines.length > 0) parts.push(`Characters:\n${charLines.join("\n")}`);
        }
        if (canonJson.timeline && typeof canonJson.timeline === "string" && canonJson.timeline.trim()) parts.push(`Timeline: ${canonJson.timeline}`);
        if (canonJson.locations && typeof canonJson.locations === "string" && canonJson.locations.trim()) parts.push(`Locations: ${canonJson.locations}`);
        if (canonJson.ongoing_threads && typeof canonJson.ongoing_threads === "string" && canonJson.ongoing_threads.trim()) parts.push(`Ongoing threads: ${canonJson.ongoing_threads}`);
        if (Array.isArray(canonJson.world_rules) && canonJson.world_rules.length > 0) parts.push(`World rules: ${canonJson.world_rules.join("; ")}`);
        else if (typeof canonJson.world_rules === "string" && canonJson.world_rules.trim()) parts.push(`World rules: ${canonJson.world_rules}`);
        if (Array.isArray(canonJson.forbidden_changes) && canonJson.forbidden_changes.length > 0) parts.push(`Forbidden changes: ${canonJson.forbidden_changes.join("; ")}`);
        else if (typeof canonJson.forbidden_changes === "string" && canonJson.forbidden_changes.trim()) parts.push(`Forbidden changes: ${canonJson.forbidden_changes}`);
        if (canonJson.format_constraints && typeof canonJson.format_constraints === "string" && canonJson.format_constraints.trim()) parts.push(`Format constraints: ${canonJson.format_constraints}`);
        if (parts.length > 0) {
          canonOSContext = `\nCANON OS (authoritative — these values override any other references):\n${parts.join("\n")}`;
        }
      }
      // If no canon established, inject warning so engine doesn't invent canonical facts
      if (!canonOSContext) {
        // Check if canon_json is empty (no logline, premise, characters set)
        const hasCanonContent = canonJson && (
          (typeof canonJson.logline === "string" && canonJson.logline.trim()) ||
          (typeof canonJson.premise === "string" && canonJson.premise.trim()) ||
          (Array.isArray(canonJson.characters) && canonJson.characters.length > 0)
        );
        if (!hasCanonContent) {
          canonOSContext = `\nCANON OS: No canonical logline, premise, or characters have been established in the Canon Editor. Do NOT assert specific protagonist names, premise details, or genre classifications as canonical facts. Analyze only what is present in the document text. If the document itself establishes these elements, reference them as "per the document" not as established canon.`;
        }
      }

      // ── Effective Profile Context (from seed_intel_pack in canon) ──
      let effectiveProfileContext = "";
      try {
        if (canonJson?.seed_intel_pack || (Array.isArray(canonJson?.comparables) && canonJson.comparables.length > 0)) {
            const ep = buildEffectiveProfileContextBlock({ canonJson, project });
            if (ep) effectiveProfileContext = ep;
          }
      } catch (e) {
        console.warn("[dev-engine-v2] Effective profile build failed (non-fatal):", e);
      }

      // ── Team Voice injection ──
      const analyzeLane = project?.assigned_lane || "independent-film";
      const tvCtx = await loadTeamVoiceContext(supabase, projectId, analyzeLane);
      const teamVoiceBlock = tvCtx.block ? `\n${tvCtx.block}` : "";

      // ── Supporting doc context (deterministic, optional) ──
      let supportingContext = "";
      if (body.includeDocumentIds && Array.isArray(body.includeDocumentIds) && body.includeDocumentIds.length > 0) {
        try {
          supportingContext = await loadSupportingDocPack(supabase, projectId, body.includeDocumentIds, documentId);
        } catch (e: any) {
          console.warn("[dev-engine-v2] loadSupportingDocPack failed (non-fatal):", e?.message);
        }
      }

      // ── Cross-rung canonical enforcement: auto-inject locked upstream docs ──
      // When analyzing treatment/story_outline/character_bible, fetch docs that sit
      // below it in the ladder (beat_sheet, concept_brief) and inject as canonical
      // reference so the rubric doesn't penalise cross-rung consistency issues.
      // Only runs when caller has NOT provided includeDocumentIds (no double-injection).
      let crossRungCanonBlock = "";
      const CROSS_RUNG_TARGETS: Record<string, string[]> = {
        treatment: ["beat_sheet", "concept_brief"],
        story_outline: ["beat_sheet", "treatment", "concept_brief"],
        character_bible: ["beat_sheet", "treatment", "concept_brief"],
      };
      const crossRungTypes = CROSS_RUNG_TARGETS[deliverableType];
      if (crossRungTypes && !(body.includeDocumentIds && body.includeDocumentIds.length > 0)) {
        try {
          const { data: crossDocs } = await supabase
            .from("project_documents")
            .select("id, doc_type, title")
            .eq("project_id", projectId)
            .in("doc_type", crossRungTypes);
          if (crossDocs && crossDocs.length > 0) {
            const crossIds = crossDocs.map((d: any) => d.id);
            const crossPack = await loadSupportingDocPack(supabase, projectId, crossIds, documentId);
            if (crossPack) {
              crossRungCanonBlock = `\n\n=== CANONICAL REFERENCE (LOCKED UPSTREAM DOCS — DO NOT CONTRADICT) ===\nThe following documents sit below this deliverable in the development ladder and are treated as LOCKED CANON for scoring purposes. When evaluating CI criterion CI-4 (Structural Integrity) and GP criterion GP-4 (Development Viability), assess whether this document is CONSISTENT WITH and BUILDING ON these canonical references. Penalise inconsistencies — notes that fix surface quality but break cross-rung consistency should be flagged as HIGH_IMPACT.\n${crossPack}\n=== END CANONICAL REFERENCE ===`;
              console.log(`[dev-engine-v2] cross-rung-canonical injected { docType: "${deliverableType}", sources: ${JSON.stringify(crossDocs.map((d: any) => d.doc_type))} }`);
            }
          }
        } catch (e: any) {
          console.warn("[dev-engine-v2] cross-rung canonical load failed (non-fatal):", e?.message);
        }
      }
      // ── Canon conformance scoring context injection (all doc types) ──
      // When scoring any DEVELOPMENT_ARCHITECTURE or SCRIPT_EXECUTION doc type,
      // inject the relevant canonical documents so CI-5/CI-6 can be evaluated.
      let canonConformanceContext = "";
      const canonConformanceTypes = new Set([
        "character_bible", "story_outline", "beat_sheet", "season_arc",
        "episode_grid", "episode_beats", "vertical_episode_beats",
        "treatment", "story_outline",
        "feature_script", "episode_script", "season_script", "production_draft",
        "season_master_script",
      ]);
      if (canonConformanceTypes.has(deliverableType)) {
        try {
          // Build upstream doc type list based on what this doc should check against
          const upstreamMap: Record<string, string[]> = {
            "episode_grid": ["character_bible"],
            "vertical_episode_beats": ["character_bible", "episode_grid"],
            "episode_beats": ["character_bible", "episode_grid"],
            "season_arc": ["character_bible", "idea", "concept_brief"],
            "beat_sheet": ["character_bible"],
            "character_bible": ["idea", "concept_brief"],
            "story_outline": ["idea", "concept_brief", "character_bible"],
            "treatment": ["idea", "concept_brief"],
            "feature_script": ["character_bible", "beat_sheet", "idea"],
            "episode_script": ["character_bible", "episode_grid", "season_arc"],
            "season_script": ["character_bible", "episode_grid", "season_arc"],
            "production_draft": ["character_bible", "episode_grid", "format_rules"],
          };
          const upstreamTypes = upstreamMap[deliverableType] || [];
          if (upstreamTypes.length > 0) {
            const { data: upstreamDocs } = await supabase
              .from("project_documents")
              .select("id, doc_type")
              .eq("project_id", projectId)
              .in("doc_type", upstreamTypes);
            if (upstreamDocs && upstreamDocs.length > 0) {
              const docIds = upstreamDocs.map((d: any) => d.id);
              const { data: upstreamVersions } = await supabase
                .from("project_document_versions")
                .select("document_id, plaintext")
                .in("document_id", docIds)
                .eq("is_current", true);
              if (upstreamVersions && upstreamVersions.length > 0) {
                const canonBlocks = upstreamVersions
                  .filter((v: any) => v.plaintext && v.plaintext.length > 200)
                  .map((v: any) => {
                    const docType = upstreamDocs.find((d: any) => d.id === v.document_id)?.doc_type || "unknown";
                    return `[${docType.toUpperCase()} CANON]\n${v.plaintext.slice(0, 2500)}`;
                  });
                if (canonBlocks.length > 0) {
                  canonConformanceContext = `\n\nCANON CONFORMANCE REFERENCE (for CI-5/CI-6 scoring — DO NOT contradict these established facts):\n${canonBlocks.join("\n\n")}`;
                  console.log(`[dev-engine-v2] canon conformance context injected for ${deliverableType}, sources: ${upstreamTypes.join(",")}`);
                }
              }
            }
          }
        } catch (e) {
          console.warn("[dev-engine-v2] canon conformance context injection failed (non-fatal):", e);
        }
      }
      // ── NEC Guardrail injection for analyze (NEC-first) ──
      const analyzeNecBlock = await loadNECGuardrailBlock(supabase, projectId);

      // ── NARRATIVE SPINE: Phase 2 advisory alignment check (non-blocking) ──
      // Only injected when a LOCKED spine exists. Findings tagged note_source='spine_alignment'.
      // FIX 3: Restored lock-state guard — provisional/confirmed spines do NOT trigger this block.
      let spineAlignmentBlock = "";
      try {
        const spineStateForAdvisory = await getSpineState(supabase, projectId);
        if ((spineStateForAdvisory.state === 'locked' || spineStateForAdvisory.state === 'locked_amended') && spineStateForAdvisory.spine) {
          // Only use alignment block for narrative documents (not market/finance docs)
          const NARRATIVE_DOC_TYPES = new Set(["idea","concept_brief","character_bible","season_arc","episode_grid","vertical_episode_beats","season_script","treatment","story_outline","beat_sheet","feature_script","episode_script","production_draft"]);
          if (NARRATIVE_DOC_TYPES.has(docType)) {
            spineAlignmentBlock = spineToReviewerAlignmentBlock(spineStateForAdvisory.spine);
          }
        }
      } catch (e) {
        console.warn("[dev-engine-v2] spine alignment block load failed (non-fatal):", e);
      }

      // ── Comp guardrail block for ANALYZE ──
      let analyzeCompBlock = "";
      try {
        const { data: pcAnalyze } = await supabase.from("project_comparables")
          .select("title, extraction_meta").eq("project_id", projectId).limit(8);
        const { data: ccAnalyze } = !pcAnalyze?.length ? await supabase.from("comparable_candidates")
          .select("title, query").eq("project_id", projectId).order("confidence", { ascending: false }).limit(8)
          : { data: null };
        const compRows = pcAnalyze?.length ? pcAnalyze.map((c: any) => ({ title: c.title, comp_type: c.extraction_meta?.comp_type || "tone" }))
          : (ccAnalyze || []).map((c: any) => ({ title: c.title, comp_type: c.query?.comp_type || "tone" }));
        if (compRows.length > 0) {
          const toneComps = compRows.filter((c: any) => c.comp_type === "tone").map((c: any) => c.title);
          const antiComps = compRows.filter((c: any) => c.comp_type === "anti").map((c: any) => c.title);
          const allTitles = compRows.map((c: any) => c.title).join(", ");
          analyzeCompBlock = `\n\nCOMP ALIGNMENT CHECK: This project's comparable titles are: ${allTitles}.${toneComps.length ? ` Primary tone comps: ${toneComps.join(", ")}.` : ""} When scoring Creative Integrity, explicitly ask: "Would a fan of these comparable works find this material satisfying? Does this earn its place in that company?" Penalise comp-drift — if the material is drifting toward generic or significantly below the quality bar set by these comps, reduce CI accordingly.${antiComps.length ? ` Flag as a HIGH_IMPACT note if the material is drifting toward the sensibility of anti-comps: ${antiComps.join(", ")}.` : ""}`;
        }
      } catch (e) { /* non-fatal */ }

      // ── Episode beats: structural pre-analysis + sampled scoring ──
      const isBeatsDeliverable = effectiveDeliverable === "vertical_episode_beats" || effectiveDeliverable === "episode_beats";
      if (isBeatsDeliverable && version.plaintext.length > 1000) {
        try {
          const { parseEpisodeBlocks: parseBeatBlocks } = await import("../../_shared/surgicalEpisodeRewrite.ts");
          const bBlocks = parseBeatBlocks(version.plaintext);
          const bTotalParsed = bBlocks.size;
          const bExpected = effectiveSeasonCount || bTotalParsed;

          let episodesMissingHook = 0, episodesMissingCliffhanger = 0, episodesLowBeatCount = 0, totalBeats = 0;
          // Detect format: new bracket-label format vs legacy inline (Character Action: ...)
          const sampleContent = Array.from(bBlocks.values()).slice(0, 5).map(b => b.content).join("\n");
          const usesNewBracketFormat = /\[HOOK\]|\[ESCALATION\]|\[CLIFFHANGER\]/i.test(sampleContent);

          for (const [, block] of bBlocks) {
            const txt = block.content;
            const beatLines = txt.match(/^\d+\.\s+\S/gm) || [];
            totalBeats += beatLines.length;
            if (beatLines.length < 4) episodesLowBeatCount++;
            if (usesNewBracketFormat) {
              if (!/\[HOOK\]/i.test(txt)) episodesMissingHook++;
              if (!/\[CLIFFHANGER\]/i.test(txt)) episodesMissingCliffhanger++;
            }
          }

          const avgBeats = bTotalParsed > 0 ? (totalBeats / bTotalParsed).toFixed(1) : "0";
          const bMissing = Math.max(0, bExpected - bTotalParsed);
          const bAllNums = Array.from(bBlocks.keys()).sort((a, b) => a - b);
          const bSampleSize = Math.min(10, bAllNums.length);
          const bSampleIndices = bSampleSize > 0
            ? Array.from({ length: bSampleSize }, (_, i) => Math.floor((i / (bSampleSize - 1 || 1)) * (bAllNums.length - 1))).map(idx => bAllNums[idx])
            : bAllNums.slice(0, bSampleSize);
          const bSampledBlocks = bSampleIndices.map(n => bBlocks.get(n)?.content || "").join("\n\n---\n\n");

          const hookCliffNote = usesNewBracketFormat
            ? `Episodes missing [HOOK] label: ${episodesMissingHook}${episodesMissingHook > 0 ? " (blocker)" : " ✓"}\nEpisodes missing [CLIFFHANGER] label: ${episodesMissingCliffhanger}${episodesMissingCliffhanger > 0 ? " (blocker)" : " ✓"}`
            : `Beat format: legacy inline style — do NOT flag as missing labels. This is a valid pre-existing format.`;

          episodeGridStructuralBlock = `\nEPISODE BEATS STRUCTURAL ANALYSIS (computed — do not override):
Episodes parsed: ${bTotalParsed} / ${bExpected} expected${bMissing > 0 ? ` — ${bMissing} episodes pending (progress: ${Math.round((bTotalParsed / bExpected) * 100)}%)` : " ✓"}
Average beats per episode: ${avgBeats}${Number(avgBeats) < 4 ? " — BELOW MINIMUM (warning)" : " ✓"}
Low beat count episodes (<4): ${episodesLowBeatCount}${episodesLowBeatCount > 0 ? " (warning)" : " ✓"}
${hookCliffNote}

EPISODE PROGRESS NOTE: Missing episodes indicate work-in-progress, NOT failure.
Only flag as BLOCKER if there is structural corruption (collapsed ranges, banned language, wrong content type).

SCORING INSTRUCTION: Score the SAMPLE (10 representative episodes).
CI = beat specificity, hook-first mandate, beat structure present.
GP = cliffhanger quality, escalation logic, beat density within duration.
Do NOT penalise for using the legacy inline beat format. Both formats are valid.
A complete beats doc should score CI 75–85.`;

          docTextForScoring = bSampledBlocks.slice(0, maxContextChars);
          console.log(`[dev-engine-v2] ${effectiveDeliverable} beats scoring: sampled ${bSampleIndices.length}/${bTotalParsed}, avgBeats=${avgBeats}, missing=${bMissing}`);
        } catch (bErr) {
          console.warn("[dev-engine-v2] beats structural analysis failed:", bErr);
        }
      }

      // ── Episode grid: structural pre-analysis + sampled scoring ──
      // Episode grids with 30–60 episodes are too large for reliable holistic LLM scoring.
      // Holistic scoring produces large CI/GP swings because the LLM's impression varies
      // depending on which episodes it attends to. Instead:
      //   1. Compute a structural pre-analysis deterministically (field completeness, uniqueness)
      //   2. Sample 10 representative episodes spread across the arc for qualitative scoring
      //   3. Inject the structural context so the scorer evaluates episode quality not doc length
      let episodeGridStructuralBlock = "";
      let seasonScriptStructuralBlock = "";
      let docTextForScoring = version.plaintext.slice(0, maxContextChars);

      if ((effectiveDeliverable === "season_script" || effectiveDeliverable === "season_master_script") && version.plaintext.length > 1000) {
        try {
          const blocks = parseEpisodeBlocks(version.plaintext);
          const totalParsed = blocks.size;
          const expectedCount = effectiveSeasonCount || totalParsed;
          const missingEpisodes = Math.max(0, expectedCount - totalParsed);
          const allNums = Array.from(blocks.keys()).sort((a, b) => a - b);
          const sampleSize = Math.min(12, allNums.length);
          const sampleIndices = sampleSize > 0
            ? Array.from({ length: sampleSize }, (_, i) => Math.floor((i / (sampleSize - 1 || 1)) * (allNums.length - 1)))
              .map((idx) => allNums[idx])
            : [];
          const sampledBlocks = sampleIndices.map((n) => blocks.get(n)?.content || "").join("\n\n---\n\n");
          const lastEpisodeNumber = allNums[allNums.length - 1] || 0;
          const lastEpisodeBlock = lastEpisodeNumber ? (blocks.get(lastEpisodeNumber)?.content || "") : "";
          const finalTail = (lastEpisodeBlock || version.plaintext).slice(-400).trim();
          const hasExplicitEnding = /\b(EPISODE END|FADE OUT|THE END|END OF EPISODE)\b/i.test(lastEpisodeBlock);
          const endsWithTerminalPunctuation = /[.!?]["')\]]?$/.test(finalTail);
          const finalEpisodeAppearsTruncated = !!lastEpisodeBlock && !hasExplicitEnding && !endsWithTerminalPunctuation;
          const safeTailSnippet = finalTail.replace(/`/g, "'").slice(-220);

          seasonScriptStructuralBlock = `\nSEASON SCRIPT STRUCTURAL ANALYSIS (computed from FULL plaintext — authoritative):
Canonical expected episodes: ${expectedCount}
Episode headings parsed from current plaintext: ${totalParsed}${missingEpisodes > 0 ? ` — ${missingEpisodes} episodes missing` : " ✓"}
Highest episode number present: ${lastEpisodeNumber}
Final episode status: ${finalEpisodeAppearsTruncated ? "appears truncated or abruptly cut off" : "appears structurally complete"}
Final tail excerpt (from full plaintext, not the sample): ${safeTailSnippet}

CRITICAL REVIEW INSTRUCTION:
- The MATERIAL block below is a representative sample for scoring, NOT the full season.
- NEVER infer total episode count from the sample size or excerpt length.
- If parsed episode count equals canonical expected episodes, do NOT claim fewer episodes were provided.
- Base completeness/blocker language on these computed full-document facts.`;

          if (sampledBlocks) {
            docTextForScoring = sampledBlocks.slice(0, maxContextChars);
          }
          console.log(`[dev-engine-v2] season_script scoring: sampled ${sampleIndices.length} of ${totalParsed} episodes, expected=${expectedCount}, truncated=${finalEpisodeAppearsTruncated}`);
        } catch (seasonScriptErr) {
          console.warn("[dev-engine-v2] season_script structural analysis failed:", seasonScriptErr);
        }
      }

      if (effectiveDeliverable === "episode_grid" && version.plaintext.length > 1000) {
        try {
          const blocks = parseEpisodeBlocks(version.plaintext);
          const totalParsed = blocks.size;
          const expectedCount = effectiveSeasonCount || totalParsed;

          // Structural completeness metrics
          const REQUIRED_FIELDS = ["PREMISE", "HOOK", "CORE MOVE", "CLIFFHANGER", "ARC POSITION", "TONE"];
          let fieldsMissing = 0;
          let genericEntries = 0;
          const cliffhangers = new Set<string>();
          const coreMoves = new Set<string>();
          let duplicateCliffhangers = 0;
          let duplicateCoreMoves = 0;

          for (const [, block] of blocks) {
            const txt = block.content;
            for (const field of REQUIRED_FIELDS) {
              if (!txt.includes(field + ":")) fieldsMissing++;
            }
            if (/follows established|same structure|same as above|template|same pattern/i.test(txt)) genericEntries++;
            const cfMatch = txt.match(/CLIFFHANGER:\s*(.+)/i);
            const cmMatch = txt.match(/CORE MOVE:\s*(.+)/i);
            if (cfMatch?.[1]) {
              const key = cfMatch[1].trim().toLowerCase().slice(0, 60);
              if (cliffhangers.has(key)) duplicateCliffhangers++;
              cliffhangers.add(key);
            }
            if (cmMatch?.[1]) {
              const key = cmMatch[1].trim().toLowerCase().slice(0, 60);
              if (coreMoves.has(key)) duplicateCoreMoves++;
              coreMoves.add(key);
            }
          }

          const missingEpisodes = Math.max(0, expectedCount - totalParsed);
          const completenessScore = totalParsed > 0
            ? Math.round(100 - (fieldsMissing / (totalParsed * REQUIRED_FIELDS.length)) * 100)
            : 0;

          // Sample 10 episodes spread across the arc
          const allNums = Array.from(blocks.keys()).sort((a, b) => a - b);
          const sampleSize = Math.min(10, allNums.length);
          const sampleIndices = sampleSize > 0
            ? Array.from({ length: sampleSize }, (_, i) => Math.floor((i / (sampleSize - 1 || 1)) * (allNums.length - 1)))
              .map(idx => allNums[idx])
            : allNums.slice(0, sampleSize);
          const sampledBlocks = sampleIndices.map(n => blocks.get(n)?.content || "").join("\n\n---\n\n");

          episodeGridStructuralBlock = `\nEPISODE GRID STRUCTURAL ANALYSIS (computed — do not override):
Episodes parsed: ${totalParsed} / ${expectedCount} expected${missingEpisodes > 0 ? ` — ${missingEpisodes} episodes pending (progress: ${Math.round((totalParsed / expectedCount) * 100)}%)` : " ✓"}
Field completeness: ${completenessScore}% (all 6 fields present across episodes)${fieldsMissing > 0 ? ` — ${fieldsMissing} missing field instances (warning)` : " ✓"}
Generic/templated entries: ${genericEntries}${genericEntries > 0 ? " (blocker)" : " ✓"}
Duplicate cliffhangers: ${duplicateCliffhangers}${duplicateCliffhangers > 0 ? " (blocker)" : " ✓"}
Duplicate core moves: ${duplicateCoreMoves}${duplicateCoreMoves > 0 ? " (blocker)" : " ✓"}

EPISODE PROGRESS NOTE: Missing episodes indicate work-in-progress, NOT failure.
Only flag as BLOCKER if there is structural corruption (collapsed ranges, banned summarization language, wrong content type).
Missing episodes during iterative development should be reported as PROGRESS ("X of Y episodes complete"), not as blockers.

SCORING INSTRUCTION: Base your CI/GP score primarily on the SAMPLE below (10 representative episodes).
Do NOT attempt to evaluate all ${totalParsed} episodes — score the sample quality.
Structural blockers above (generic entries, duplicates) are ALREADY COMPUTED — if any exist, flag them as-is.
CI = field specificity + title quality + escalation logic in the sample.
GP = cliffhanger effectiveness + arc position accuracy + hook quality in the sample.
A fully complete grid with specific, unique entries should score CI 75–85. Reserve 85+ for exceptional escalation design.`;

          // Replace doc text with sampled version for scoring stability
          docTextForScoring = sampledBlocks.slice(0, maxContextChars);
          console.log(`[dev-engine-v2] episode_grid scoring: sampled ${sampleIndices.length} of ${totalParsed} episodes, completeness=${completenessScore}%, missing=${missingEpisodes}`);
        } catch (gridErr) {
          console.warn("[dev-engine-v2] episode_grid structural analysis failed:", gridErr);
        }
      }

      // ── Convergence history context injection (medium-term fix) ──
      // Instead of relying on the current ANALYZE output's convergence status (which
      // gets reset to in_progress when blockers are found), check historical records
      // to determine if this document was EVER scored as converged. If a prior version
      // was converged, the AI should strongly bias against inventing new blockers.
      let convergenceHistoryContext = "";
      try {
        const { data: convHistory } = await supabase
          .from("dev_engine_convergence_history")
          .select("convergence_status, creative_score, greenlight_score, created_at")
          .eq("document_id", documentId)
          .order("created_at", { ascending: false })
          .limit(5);
        if (convHistory && convHistory.length > 0) {
          const priorConverged = convHistory.find(h => h.convergence_status === "converged");
          if (priorConverged) {
            const totalConverged = convHistory.filter(h => h.convergence_status === "converged").length;
            const recentStatus = convHistory[0]?.convergence_status || "Unknown";
            convergenceHistoryContext = `\n\nCONVERGENCE HISTORY: This document has been scored as CONVERGED ${totalConverged} time(s) in historical runs (last: CI=${priorConverged.creative_score}, GP=${priorConverged.greenlight_score}). Current convergence status: ${recentStatus}.\nCRITICAL RULE: If the document was previously converged, do NOT invent new blockers. The convergence status may appear as "in_progress" due to generated blockers, but the document's underlying quality has already validated as converged. Focus on:\n- Resolving any genuine structural issues (missing characters, corrupted sections)\n- Polish notes for refinement only\n- Do NOT re-raise the same issues under different note_keys\n- If all prior blockers were resolved, raise ONLY polish_notes or high_impact_notes`;
            console.log(`[dev-engine-v2][convergence-history] Injected convergence history: ${totalConverged} prior converged run(s), last CI=${priorConverged.creative_score}, GP=${priorConverged.greenlight_score}`);
          } else {
            // Document has convergence history but never converged — still useful context
            const highestCI = Math.max(...convHistory.map(h => Number(h.creative_score)).filter(s => !isNaN(s)));
            const highestGP = Math.max(...convHistory.map(h => Number(h.greenlight_score)).filter(s => !isNaN(s)));
            if (highestCI >= 60 || highestGP >= 60) {
              convergenceHistoryContext = `\n\nCONVERGENCE NOTE: This document has never reached full convergence but has achieved scores of CI=${highestCI}, GP=${highestGP} in prior runs. If the document is close to convergence (few blockers, high scores), prefer refinement over inventing new blockers.`;
              console.log(`[dev-engine-v2][convergence-history] Near-convergence context injected: best CI=${highestCI}, GP=${highestGP}`);
            }
          }
        }
      } catch (e) {
        console.warn("[dev-engine-v2] Convergence history fetch failed (non-fatal):", e);
      }

      const userPrompt = `${analyzeNecBlock}
PRODUCTION TYPE: ${effectiveProductionType}
STRATEGIC PRIORITY: ${strategicPriority || "BALANCED"}
DEVELOPMENT STAGE: ${developmentStage || "IDEA"}
PROJECT: ${project?.title || "Unknown"}
LANE: ${analyzeLane} | BUDGET: ${project?.budget_range || "Unknown"}
${prevContext}${seasonContext}${qualBinding}${canonOSContext}${effectiveProfileContext}${signalContext}${lockedDecisionsContext}${teamVoiceBlock}${supportingContext}${crossRungCanonBlock}${canonConformanceContext}${spineAlignmentBlock}${analyzeCompBlock}${episodeGridStructuralBlock}${seasonScriptStructuralBlock}${convergenceHistoryContext}

MATERIAL (${version.plaintext.length} chars total${episodeGridStructuralBlock || seasonScriptStructuralBlock ? " — sampled for scoring stability" : ""}):
${docTextForScoring}`;

      // ── Cost optimisation: tiered model selection for ANALYZE ──
      // Pro is only needed when the document is close to target CI (≥80) — fine-grained
      // scoring matters at that point. For early-stage docs (CI<80 or unknown), Flash is
      // accurate enough for directional feedback and costs 8× less.
      // Caller can pass `body.forceProModel = true` to override (used by manual re-review).
      const previousCI: number | null = (() => {
        try {
          const prevCtx = prevContext || "";
          const m = prevCtx.match(/CI=(\d+)/);
          return m ? parseInt(m[1], 10) : null;
        } catch { return null; }
      })();
      const useProForAnalyze = body.forceProModel === true || (previousCI !== null && previousCI >= 80);
      const analyzeModel = ANALYZE_MODEL; // scoring uses o4-mini for deterministic output
      console.log("[dev-engine-v2] analyze model selected", { analyzeModel, previousCI, forceProModel: body.forceProModel });

      const raw = await callAI(OPENROUTER_API_KEY, analyzeModel, systemPrompt, userPrompt, 0.0, 6000, 42);
      let parsed = await parseAIJson(OPENROUTER_API_KEY, raw);

      // ── Strict JSON retry: one deterministic recovery attempt ──
      if (!parsed || !looksLikeAnalyzeShape(parsed)) {
        console.log("[dev-engine-v2] analyze json invalid -> strict retry", { projectId, documentId, versionId: version.id });
        try {
          const raw2 = await callAI(OPENROUTER_API_KEY, analyzeModel, `${STRICT_JSON_RULES}\n\n${systemPrompt}`, userPrompt, 0.0, 6000, 42);
          const parsed2 = await parseAIJson(OPENROUTER_API_KEY, raw2);
          if (parsed2 && looksLikeAnalyzeShape(parsed2)) {
            console.log("[dev-engine-v2] analyze strict retry succeeded", { projectId });
            parsed = parsed2;
          } else {
            console.error("[dev-engine-v2] analyze strict retry failed -> returning success:false", { projectId, snippet: safeSnippet(raw2) });
            return new Response(JSON.stringify({ success: false, error: "MODEL_JSON_PARSE_FAILED", where: "analyze", attempt: 2, snippet: safeSnippet(raw2, 300), hint: "strict_retry_failed" }), {
              status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (retryErr: any) {
          console.error("[dev-engine-v2] analyze strict retry threw", { projectId, error: retryErr?.message });
          return new Response(JSON.stringify({ success: false, error: "MODEL_JSON_PARSE_FAILED", where: "analyze", attempt: 2, snippet: safeSnippet(raw, 300), hint: "strict_retry_exception" }), {
            status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Normalize: ensure scores are at top level for backward compat
      const scores = parsed.scores || {};
      if (scores.ci_score != null && parsed.ci_score == null) {
        parsed.ci_score = scores.ci_score;
        parsed.gp_score = scores.gp_score;
        parsed.gap = scores.gap;
        parsed.allowed_gap = scores.allowed_gap;
      }
      // Ensure meta is present
      if (!parsed.meta) {
        parsed.meta = { deliverable_type: effectiveDeliverable, format: effectiveFormat, development_behavior: effectiveBehavior, schema_version: SCHEMA_VERSION };
      }
      parsed.deliverable_type = effectiveDeliverable;
      parsed.development_behavior = effectiveBehavior;

      // Validate next_best_document — must be a valid deliverable type key for THIS format's ladder
      const formatLadder = getLadderForFormat(effectiveFormat) ?? getLadderForFormat("film") ?? [];
      const VALID_DELIVERABLES = new Set(formatLadder);
      if (parsed.convergence?.next_best_document) {
        const raw_nbd = parsed.convergence.next_best_document;
        const normalized_nbd = raw_nbd.toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z_]/g, "");
        if (VALID_DELIVERABLES.has(normalized_nbd)) {
          parsed.convergence.next_best_document = normalized_nbd;
        } else {
          // Try remapping to ladder-valid type
          const remapped = remapDocType(normalized_nbd, effectiveFormat);
          if (remapped) {
            parsed.convergence.next_best_document = remapped;
          } else if (docTypeMap[raw_nbd.toUpperCase()]) {
            const mapped = docTypeMap[raw_nbd.toUpperCase()];
            parsed.convergence.next_best_document = remapDocType(mapped, effectiveFormat) || mapped;
          } else {
            // Fuzzy: find best match from ladder
            const fuzzyMatch = [...VALID_DELIVERABLES].find(d => normalized_nbd.includes(d) || d.includes(normalized_nbd));
            parsed.convergence.next_best_document = fuzzyMatch || formatLadder[formatLadder.length - 1] || "script";
          }
        }
      }

      // ── Filter notes: remap or remove notes referencing out-of-ladder doc types ──
      function filterAndTimingNotes(notes: any[]): { now: any[]; deferred: any[] } {
        if (!notes) return { now: [], deferred: [] };
        const nowNotes: any[] = [];
        const deferredNotes: any[] = [];
        for (const note of notes) {
          // Default apply_timing to "now" for backward compat
          if (!note.apply_timing) note.apply_timing = "now";
          // Validate target_deliverable_type against ladder
          if (note.target_deliverable_type) {
            const remapped = remapDocType(note.target_deliverable_type, effectiveFormat);
            if (!remapped) {
              // Target not in ladder — remap to closest or drop
              note.target_deliverable_type = null;
              note.apply_timing = "now";
            } else {
              note.target_deliverable_type = remapped;
            }
          }
          if (note.apply_timing === "now") {
            nowNotes.push(note);
          } else {
            deferredNotes.push(note);
          }
        }
        return { now: nowNotes, deferred: deferredNotes };
      }

      // ── Exclude already-resolved notes from analysis output ──
      let resolvedNoteIds = new Set<string>();
      if (projectId) {
        try {
          const { data: resolved } = await supabase
            .from("resolved_notes")
            .select("note_id, note_key")
            .eq("project_id", projectId)
            .eq("status", "active");
          if (resolved) {
            for (const r of resolved) {
              if (r.note_id) resolvedNoteIds.add(r.note_id);
              if (r.note_key) resolvedNoteIds.add(r.note_key);
            }
          }
        } catch (e) {
          console.warn("[dev-engine-v2] resolved_notes query failed:", e);
        }
      }

      // Filter out resolved notes before timing filter so they don't appear as open blockers
      const resolvedFilter = (notes: any[]) =>
        (notes || []).filter((n: any) => !resolvedNoteIds.has(n.id) && !resolvedNoteIds.has(n.note_key) && !resolvedNoteIds.has(n.note_id));

      const blockersResult = filterAndTimingNotes(resolvedFilter(parsed.blocking_issues));
      const highResult = filterAndTimingNotes(resolvedFilter(parsed.high_impact_notes));
      const polishResult = filterAndTimingNotes(resolvedFilter(parsed.polish_notes));

      // Keep only NOW notes in the main arrays
      parsed.blocking_issues = blockersResult.now;
      parsed.high_impact_notes = highResult.now;
      parsed.polish_notes = polishResult.now;

      // ── LONG-TERM FIX: Semantic note_key deduplication ──
      // When generating a new note, compare its semantic content against existing
      // unresolved development_notes for the same document. If a match is found,
      // reuse the existing key instead of creating a new one (fixes note_key mutation).
      if (effectiveDeliverable === "character_bible") {
        try {
          // Fetch all existing unresolved OR recently resolved notes for this document
          const { data: existingNotes } = await supabase
            .from("development_notes")
            .select("note_key, description, severity")
            .eq("document_id", documentId)
            .or("resolved.eq.false,resolved_at.gt.now-2hours")
            .limit(50);
          if (existingNotes && existingNotes.length > 0) {
            // Simple word-overlap similarity function
            const wordOverlap = (a: string, b: string): number => {
              const wordsA = new Set((a || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
              const wordsB = new Set((b || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
              if (wordsA.size === 0 || wordsB.size === 0) return 0;
              let intersection = 0;
              for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
              const union = Math.max(wordsA.size, wordsB.size);
              return union > 0 ? intersection / union : 0;
            };
            // Also check for common thematic synonyms in descriptions
            const noteTiers = [
              { arr: parsed.blocking_issues || [], name: "blocking_issues" },
              { arr: parsed.high_impact_notes || [], name: "high_impact_notes" },
              { arr: parsed.polish_notes || [], name: "polish_notes" },
            ];
            for (const tier of noteTiers) {
              for (let i = 0; i < tier.arr.length; i++) {
                const note = tier.arr[i];
                const noteDesc = note.description || "";
                const noteKey = note.note_key || note.id || "";
                if (!noteDesc) continue;
                // Find best match among existing unresolved notes
                let bestMatch: { key: string; score: number } | null = null;
                for (const existing of existingNotes) {
                  const score = wordOverlap(noteDesc, existing.description || "");
                  if (score >= 0.4 && (!bestMatch || score > bestMatch.score)) {
                    bestMatch = { key: existing.note_key, score };
                  }
                }
                if (bestMatch) {
                  // Reuse the existing note_key — this prevents creating a new
                  // development_notes row with a different key for the same issue
                  const oldKey = noteKey;
                  tier.arr[i].note_key = bestMatch.key;
                  tier.arr[i].id = bestMatch.key;
                  tier.arr[i].note_key_deduped = true;
                  tier.arr[i].original_note_key = oldKey;
                  console.log(`[dev-engine-v2][note-key-dedup] Re-mapped note_key "${oldKey}" → "${bestMatch.key}" (word overlap: ${(bestMatch.score * 100).toFixed(0)}%)`);
                }
              }
            }
          }
        } catch (e) {
          console.warn("[dev-engine-v2] Semantic note_key dedup failed (non-fatal):", e);
        }
      }

      // Collect all deferred notes
      const allDeferred = [...blockersResult.deferred, ...highResult.deferred, ...polishResult.deferred];
      parsed.deferred_notes = allDeferred;

      // ── IEL: IDEA-STAGE STRUCTURAL VALIDATION PROVENANCE ──
      if (effectiveDeliverable === "idea") {
        const premiseBlockerKeys = (parsed.blocking_issues || [])
          .filter((n: any) => ["structural", "escalation", "lane"].includes(n.category))
          .map((n: any) => n.note_key || n.id);
        const deferredToConceptBrief = allDeferred
          .filter((n: any) => n.target_deliverable_type === "concept_brief")
          .map((n: any) => n.note_key || n.id);
        console.log(`[dev-engine-v2][IEL] idea_structural_validation_result { format: "${effectiveFormat}", premise_blockers_now: [${premiseBlockerKeys.join(",")}], deferred_to_concept_brief: [${deferredToConceptBrief.join(",")}], total_now_blockers: ${(parsed.blocking_issues || []).length}, total_deferred: ${allDeferred.length} }`);
      }

      // ── Persist deferred notes to DB ──
      if (allDeferred.length > 0 && projectId) {
        for (const dn of allDeferred) {
          try {
            await supabase.from("project_deferred_notes").upsert({
              project_id: projectId,
              created_by: user.id,
              source_doc_type: effectiveDeliverable,
              source_version_id: versionId,
              note_key: dn.note_key || dn.id,
              note_json: dn,
              target_deliverable_type: dn.target_deliverable_type || "",
              status: "open",
              last_checked_at: new Date().toISOString(),
              last_seen_in_doc_type: effectiveDeliverable,
              severity: dn.severity || "high",
              category: dn.category || null,
              due_when: { when_doc_type_active: dn.target_deliverable_type || null },
              suggested_fixes: dn.suggested_fixes || null,
            }, { onConflict: "project_id,note_key,target_deliverable_type" });
          } catch (e) {
            console.warn("[dev-engine-v2] Failed to persist deferred note:", e);
          }
        }
      }

      // ── Auto-dismiss stale notes from prior runs for this source_doc_type ──
      if (projectId) {
        try {
          const currentNoteKeys = allDeferred.map((dn: any) => dn.note_key || dn.id).filter(Boolean);
          // Dismiss old open notes for this doc type that weren't re-flagged
          if (currentNoteKeys.length > 0) {
            await supabase.from("project_deferred_notes")
              .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolution_method: "auto_stale", resolution_summary: "Auto-dismissed: not re-flagged in latest analysis" })
              .eq("project_id", projectId)
              .eq("source_doc_type", effectiveDeliverable)
              .in("status", ["open", "pinned"])
              .not("note_key", "in", `(${currentNoteKeys.join(",")})`);
          } else {
            // No new deferred notes — dismiss all old ones for this doc type
            await supabase.from("project_deferred_notes")
              .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolution_method: "auto_stale", resolution_summary: "Auto-dismissed: no notes in latest analysis" })
              .eq("project_id", projectId)
              .eq("source_doc_type", effectiveDeliverable)
              .in("status", ["open", "pinned"]);
          }
          console.log("[dev-engine-v2] Auto-dismissed stale deferred notes for", effectiveDeliverable);
        } catch (e) {
          console.warn("[dev-engine-v2] Failed to auto-dismiss stale notes:", e);
        }
      }

      // ── Load and inject carried-forward deferred notes for current deliverable ──
      if (projectId) {
        try {
          const { data: carriedNotes } = await supabase.from("project_deferred_notes")
            .select("*")
            .eq("project_id", projectId)
            .eq("target_deliverable_type", effectiveDeliverable)
            .eq("status", "open");
          if (carriedNotes && carriedNotes.length > 0) {
            parsed.carried_deferred_notes = carriedNotes.map((cn: any) => ({
              ...cn.note_json,
              deferred_id: cn.id,
              source_doc_type: cn.source_doc_type,
              originally_deferred: true,
            }));
          }
        } catch (e) {
          console.warn("[dev-engine-v2] Failed to load carried deferred notes:", e);
        }
      }

      // ── Vertical Drama: override next_best_document with gated pipeline ──
      if (effectiveFormat === "vertical-drama" && parsed.convergence) {
        // Fetch existing doc types for this project
        const { data: existingDocs } = await supabase.from("project_documents")
          .select("doc_type").eq("project_id", projectId);
        const existingDocTypes = (existingDocs || []).map((d: any) => d.doc_type).filter(Boolean);

        const vdNext = resolveVerticalDramaNextStep(existingDocTypes, effectiveSeasonCount);
        parsed.convergence.next_best_document = vdNext.nextStep;
        parsed.convergence.vertical_drama_gating = {
          missing_prerequisites: vdNext.missingPrerequisites,
          reason: vdNext.reason,
          canonical_episode_count: effectiveSeasonCount || null,
          production_type: "vertical_drama",
        };
      }

      // Enforce caps: max 5 per tier (NOW notes only)
      if (parsed.blocking_issues && parsed.blocking_issues.length > 5) parsed.blocking_issues = parsed.blocking_issues.slice(0, 5);
      if (parsed.high_impact_notes && parsed.high_impact_notes.length > 5) parsed.high_impact_notes = parsed.high_impact_notes.slice(0, 5);
      if (parsed.polish_notes && parsed.polish_notes.length > 5) parsed.polish_notes = parsed.polish_notes.slice(0, 5);

      // Ensure note_key = id for all notes
      for (const arr of [parsed.blocking_issues, parsed.high_impact_notes, parsed.polish_notes]) {
        if (arr) for (const n of arr) { if (!n.note_key) n.note_key = n.id; if (!n.id) n.id = n.note_key; }
      }

      // ── Convergence failsafe: iteration cap (character bible) ──
      const capReached = await checkDevRunIterationCap(supabase, documentId, versionId, parsed);

      // ── FALSE POSITIVE BLOCKER FILTER ──
      // Run BEFORE stability computations so blocker counts are accurate.
      parsed = filterFalsePositiveBlockers(parsed, deliverableType, effectiveFormat);

      // Blocker-based convergence override: only NOW blockers gate convergence
      const blockerCount = (parsed.blocking_issues || []).length;
      const highCount = (parsed.high_impact_notes || []).length;
      const polishCount = (parsed.polish_notes || []).length;
      if (parsed.convergence) {
        parsed.convergence.blockers_remaining = blockerCount;
        parsed.convergence.high_impact_remaining = highCount;
        parsed.convergence.polish_remaining = polishCount;
        parsed.convergence.deferred_count = allDeferred.length;
        // Override AI convergence: only NOW blockers prevent convergence
        if (blockerCount > 0 && parsed.convergence.status === "converged") {
          parsed.convergence.status = "in_progress";
          parsed.convergence.reasons = [...(parsed.convergence.reasons || []), "Blocking issues remain"];
        }
        if (blockerCount === 0 && parsed.convergence.status !== "converged") {
          // Check score thresholds still apply
          const ciOk = (parsed.ci_score || 0) >= 60;
          const gpOk = (parsed.gp_score || 0) >= 60;
          if (ciOk && gpOk) {
            parsed.convergence.status = "converged";
            if (!parsed.convergence.reasons) parsed.convergence.reasons = [];
            parsed.convergence.reasons.push("All blockers resolved");
          }
        }
      }

      // ── Convergence failsafe: CI regression check (character bible) ──
      await detectCIRegression(supabase, documentId, versionId, parsed);

      // Stability status
      parsed.stability_status = blockerCount === 0 && highCount <= 3 && polishCount <= 5
        ? "structurally_stable" : blockerCount === 0 ? "refinement_phase" : "in_progress";

      // Inject criteria_snapshot for traceability
      const criteriaSnapshot = await buildCriteriaSnapshot(supabase, projectId);
      parsed.criteria_snapshot = criteriaSnapshot;

      // ── NARRATIVE INTEGRITY ENGINE (NIE) — Phase 1 diagnostic overlay ──
      // Feature-flagged behind NIE_V1. Runs post-analyze for eligible doc types.
      if (shouldRunNIE(effectiveDeliverable)) {
        let nieEnabled = false;
        try {
          const { data: flagResult } = await supabase.rpc("is_feature_flag_enabled", { _key: "NIE_V1" });
          nieEnabled = flagResult === true;
        } catch (e) {
          console.warn("[NIE] Feature flag check failed (defaulting to off):", e);
        }

        if (nieEnabled) {
          try {
            console.log(`[NIE] Running narrative integrity evaluation for ${effectiveDeliverable}`, { projectId, documentId });
            const adjacentPack = await loadAdjacentDocPack(supabase, projectId, effectiveDeliverable, project?.assigned_lane || null);
            console.log(`[NIE] Adjacent docs loaded: upstream=${adjacentPack.upstream?.doc_type || "none"}, downstream=${adjacentPack.downstream?.doc_type || "none"}, canon=${!!adjacentPack.canon_text}`);

            const nieResult = await evaluateNarrativeIntegrity(
              callAI, parseAIJson, OPENROUTER_API_KEY, FAST_MODEL,
              effectiveDeliverable, version.plaintext.slice(0, 12000),
              adjacentPack,
            );

            parsed.narrative_integrity = nieResult;
            console.log(`[NIE] Evaluation complete: score=${nieResult.integrity_score}, state=${nieResult.integrity_state}, blockers=${nieResult.blockers.length}, warnings=${nieResult.warnings.length}`);
          } catch (nieErr: any) {
            console.error("[NIE] Evaluation failed (non-fatal):", nieErr?.message);
            parsed.narrative_integrity = { error: nieErr?.message || "evaluation_failed", engine_version: "nie_v1_phase1" };
          }
        }
      }


      // Re-verify version still exists before inserting run (guards against race condition where
      // version is deleted during the AI call which can take 30+ seconds)
      const { data: versionStillExists } = await supabase.from("project_document_versions")
        .select("id").eq("id", versionId).maybeSingle();
      if (!versionStillExists) throw new Error("Version was deleted while analysis was running — please re-select the document and try again");

      const { data: run, error: runErr } = await supabase.from("development_runs").insert({
        project_id: projectId,
        document_id: documentId,
        version_id: versionId,
        user_id: user.id,
        run_type: "ANALYZE",
        production_type: effectiveProductionType,
        strategic_priority: strategicPriority || "BALANCED",
        development_stage: developmentStage || "IDEA",
        analysis_mode: analysisMode || "DUAL",
        output_json: parsed,
        deliverable_type: effectiveDeliverable,
        development_behavior: effectiveBehavior,
        format: effectiveFormat,
        episode_target_duration_seconds: effectiveDuration || null,
        schema_version: SCHEMA_VERSION,
      }).select().single();
      if (runErr) {
        if (runErr.code === "23503") throw new Error("Version no longer exists — please re-select the document and try again");
        throw runErr;
      }

      await supabase.from("dev_engine_convergence_history").insert({
        project_id: projectId,
        document_id: documentId,
        version_id: versionId,
        user_id: user.id,
        creative_score: parsed.ci_score || 0,
        greenlight_score: parsed.gp_score || 0,
        gap: parsed.gap ?? Math.abs((parsed.ci_score || 50) - (parsed.gp_score || 50)),
        allowed_gap: parsed.allowed_gap || 25,
        convergence_status: parsed.convergence?.status || parsed.convergence_status || "Unknown",
        trajectory: parsed.trajectory,
      });

      // ── DRIFT DETECTION ──
      const extractedCore = parsed.extracted_core || {};
      let driftReport: any = { level: "none", items: [], acknowledged: false, resolved: false };

      // Get inherited_core from version
      const { data: versionMeta } = await supabase.from("project_document_versions")
        .select("inherited_core").eq("id", versionId).single();

      if (versionMeta?.inherited_core) {
        const drift = detectDrift(extractedCore, versionMeta.inherited_core as Record<string, string>);
        driftReport = { ...drift, acknowledged: false, resolved: false };

        if (drift.level !== "none") {
          // Store drift event
          await supabase.from("document_drift_events").insert({
            project_id: projectId,
            document_version_id: versionId,
            drift_level: drift.level,
            drift_items: drift.items,
          });
        }

        // Store drift snapshot on version
        await supabase.from("project_document_versions")
          .update({ drift_snapshot: driftReport })
          .eq("id", versionId);

        // Drift-aware convergence: modify status if unresolved
        if (drift.level === "major") {
          if (parsed.convergence) {
            parsed.convergence.status = "in_progress";
            parsed.convergence.reasons = [...(parsed.convergence.reasons || []), "Unresolved major structural drift detected"];
          }
        } else if (drift.level === "moderate") {
          if (parsed.convergence?.status === "converged") {
            parsed.convergence.status = "in_progress";
            parsed.convergence.reasons = [...(parsed.convergence.reasons || []), "Unacknowledged moderate drift requires resolution"];
          }
        }
      }

      // Store extracted core on version for future drift comparisons
      await supabase.from("project_document_versions")
        .update({ drift_snapshot: { ...driftReport, extracted_core: extractedCore } })
        .eq("id", versionId);

      parsed.drift_report = driftReport;
      if (seasonArchitecture) parsed.season_architecture = seasonArchitecture;

      // ── Documentary Fact Ledger Auto-population ──
      const isDocFormat = ["documentary", "documentary-series", "hybrid-documentary"].includes(effectiveFormat) ||
        effectiveDeliverable === "documentary_outline";
      if (isDocFormat && parsed.claims_list && Array.isArray(parsed.claims_list)) {
        try {
          let ledgerCreated = 0;
          for (const claim of parsed.claims_list) {
            const claimText = typeof claim === "string" ? claim : claim.claim;
            if (!claimText) continue;
            const { data: existing } = await supabase
              .from("doc_fact_ledger_items")
              .select("id")
              .eq("project_id", projectId)
              .eq("claim", claimText)
              .limit(1);
            if (!existing || existing.length === 0) {
              await supabase.from("doc_fact_ledger_items").insert({
                project_id: projectId,
                user_id: user.id,
                claim: claimText,
                evidence_type: claim.evidence_type || "unknown",
                status: claim.status || "needs_check",
              });
              ledgerCreated++;
            }
          }
          parsed.fact_ledger_metadata = {
            claims_count: parsed.claims_list.length,
            ledger_items_created: ledgerCreated,
          };
        } catch (e) {
          console.warn("[dev-engine-v2] Fact ledger upsert failed (non-fatal):", e);
        }
      }

      // ── POST-ANALYZE META_JSON STAMP ──
      // Keep meta_json.ci/gp in sync with development_runs so the UI always shows consistent scores.
      // Policy: stamp if higher. meta_json tracks the best-known score from the engine.
      {
        const ci = parsed.ci_score ?? parsed.scores?.ci_score ?? null;
        const gp = parsed.gp_score ?? parsed.scores?.gp_score ?? null;

        if (ci !== null || gp !== null) {
          try {
            const { data: versionRow } = await supabase
              .from("project_document_versions")
              .select("id, meta_json")
              .eq("id", versionId)
              .maybeSingle();

            if (versionRow) {
              const existingMeta = (versionRow.meta_json &&
                typeof versionRow.meta_json === "object" &&
                !Array.isArray(versionRow.meta_json))
                ? versionRow.meta_json : {};

              const shouldUpdateCi = ci !== null && (
                typeof existingMeta.ci !== "number" || ci > existingMeta.ci
              );
              const shouldUpdateGp = gp !== null && (
                typeof existingMeta.gp !== "number" || gp > existingMeta.gp
              );

              if (shouldUpdateCi || shouldUpdateGp) {
                const updatedMeta = {
                  ...existingMeta,
                  ...(shouldUpdateCi ? { ci } : {}),
                  ...(shouldUpdateGp ? { gp } : {}),
                  _ci_gp_stamped_at: new Date().toISOString(),
                  _ci_gp_stamped_by: "dev-engine-v2",
                  _ci_gp_score_source: "development_runs",
                };

                await supabase
                  .from("project_document_versions")
                  .update({ meta_json: updatedMeta })
                  .eq("id", versionId);

                console.log(`[dev-engine-v2] meta_json stamp: version=${versionId} ci=${ci ?? "unchanged"} gp=${gp ?? "unchanged"}`);
              }
            }
          } catch (stampErr) {
            // Non-fatal: stamp failure should not fail the analyze response
            console.warn("[dev-engine-v2] meta_json stamp failed (non-fatal):", stampErr);
          }
        }
      }

      return new Response(JSON.stringify({ run, analysis: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════
    // NOTES — tiered structured notes with tracking
    // ══════════════════════════════════════════════
    if (action === "notes") {
      const { projectId, documentId, versionId, analysisJson } = body;
      let { deliverableType } = body;
      if (!projectId || !documentId || !versionId) throw new Error("projectId, documentId, versionId required");

      // Resolve deliverableType from actual document doc_type — never assume script
      if (!deliverableType) {
        const { data: notesDocRow } = await supabase.from("project_documents")
          .select("doc_type").eq("id", documentId).maybeSingle();
        if (notesDocRow?.doc_type) {
          deliverableType = notesDocRow.doc_type;
          console.log(`[dev-engine-v2] notes: resolved deliverableType from doc_type="${deliverableType}"`);
        }
      }

      const { data: version } = await supabase.from("project_document_versions")
        .select("plaintext, meta_json").eq("id", versionId).single();
      if (!version) throw new Error("Version not found");

      // ── STAGE IDENTITY GATE — block notes on malformed stage artifacts ──
      if (deliverableType && ["idea", "concept_brief"].includes(deliverableType) && version.plaintext) {
        const sidMetaJson = version.meta_json as Record<string, any> | undefined;
        console.log(`[dev-engine-v2][notes] stage_check: deliverableType=${deliverableType} versionId=${versionId} meta_json=${JSON.stringify(sidMetaJson)}`);
        const sidResult = validateStageIdentity(deliverableType, version.plaintext, sidMetaJson);
        if (sidResult && !sidResult.pass) {
          console.error(`[dev-engine-v2][IEL] STAGE_IDENTITY_BLOCKED { action: "notes", deliverable: "${deliverableType}", violation: "${sidResult.violation}" }`);
          return new Response(JSON.stringify({
            error: `STAGE_IDENTITY_BLOCKED: ${sidResult.violation}`,
            stage_identity_blocked: true,
            violation: sidResult.violation,
            repair_hint: sidResult.repair_hint,
          }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Fetch project format so notes are format-aware (e.g. vertical drama ≠ feature film)
      const { data: notesProject } = await supabase.from("projects")
        .select("format, development_behavior, assigned_lane, budget_range, title")
        .eq("id", projectId).single();
      const notesRawFormat = notesProject?.format || "film";
      const notesEffectiveFormat = resolveFormatAlias(notesRawFormat.toLowerCase().replace(/[_ ]+/g, "-"));
      const notesFormatExp = FORMAT_EXPECTATIONS[notesEffectiveFormat] || FORMAT_EXPECTATIONS["film"];
      const notesLadder = getLadderForFormat(notesEffectiveFormat) ?? getLadderForFormat("film") ?? [];
      const notesLadderStr = notesLadder.join(", ");
      const notesProductionType = formatToProductionType[notesEffectiveFormat] || "narrative_feature";

      let analysis = analysisJson;
      if (!analysis) {
        const { data: latestRun } = await supabase.from("development_runs")
          .select("output_json").eq("version_id", versionId).eq("run_type", "ANALYZE")
          .order("created_at", { ascending: false }).limit(1).single();
        analysis = latestRun?.output_json;
      }
      if (!analysis) throw new Error("No analysis found. Run Analyze first.");

// Check previous note keys to prevent endless repetition (scoped to this version)
      const { data: prevNotes } = await supabase.from("development_notes")
        .select("note_key, severity, resolved")
        .eq("document_id", documentId)
        .eq("document_version_id", versionId);
      const previouslyResolved = new Set((prevNotes || []).filter((n: any) => n.resolved).map((n: any) => n.note_key));
      const existingUnresolved = (prevNotes || []).filter((n: any) => !n.resolved);
      const previousBlockerCount = existingUnresolved.filter((n: any) => n.severity === 'blocker').length;

      // Also query previous ANALYZE run outputs for blocker history (covers runs that generated notes)
      let prevAnalyzeBlockerKeys = new Set<string>();
      try {
        const { data: prevRuns } = await supabase.from("development_runs")
          .select("output_json")
          .eq("version_id", versionId)
          .eq("run_type", "ANALYZE")
          .order("created_at", { ascending: false })
          .limit(3);
        if (prevRuns) {
          for (const run of prevRuns) {
            if (run.output_json?.blocking_issues) {
              for (const b of run.output_json.blocking_issues) {
                const nk = b.note_key || b.id;
                if (nk) prevAnalyzeBlockerKeys.add(nk);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[dev-engine-v2] prev ANALYZE run query failed (non-fatal):", e);
      }

      let antiRepeatRule = "";
      if (previouslyResolved.size > 0) {
        antiRepeatRule = `\nPREVIOUSLY RESOLVED NOTE KEYS (do NOT re-raise as blockers unless regression detected): ${[...previouslyResolved].join(", ")}`;
      }
      // Add previously raised ANALYZE blocker keys to the anti-repeat rule
      const allKnownBlockerKeys = new Set([...previouslyResolved, ...prevAnalyzeBlockerKeys]);
      if (allKnownBlockerKeys.size > 0 && previouslyResolved.size === 0) {
        // Only from ANALYZE runs (not development_notes)
        antiRepeatRule = `\nPREVIOUSLY RAISED BLOCKER KEYS FROM ANALYZE HISTORY (do NOT re-raise as blockers unless regression detected): ${[...allKnownBlockerKeys].join(", ")}`;
      } else if (prevAnalyzeBlockerKeys.size > 0) {
        // Append ANALYZE-run keys to the existing development_notes rule
        const extraKeys = [...prevAnalyzeBlockerKeys].filter(k => !previouslyResolved.has(k));
        if (extraKeys.length > 0) {
          antiRepeatRule += `\nPREVIOUS ANALYZE BLOCKER KEYS (do NOT re-raise unless regression detected): ${extraKeys.join(", ")}`;
        }
      }
      if (previousBlockerCount === 0 && existingUnresolved.length > 0) {
        antiRepeatRule += `\nPREVIOUS ROUND HAD ZERO BLOCKERS. Do NOT invent new blockers unless drift/regression occurred. Only generate high/polish notes.`;
      }

      // ── Universal doc scope + deferral map ──
      // Defines what each doc TYPE owns (can fix now) and what it must defer downstream.
      // This is the single source of truth for note routing across all ladders.
      const DOC_SCOPE: Record<string, { owns: string; defers: { target: string; covers: string }[] }> = {
        idea: {
          owns: "premise engine viability, antagonist/opposition presence, genre declaration, format match for series",
          defers: [
            { target: "concept_brief", covers: "premise depth, logline sharpening, theme, hook clarity, tonal consistency, escalation path detail, protagonist backstory, relationship dynamics" },
            { target: "character_bible", covers: "character arc detail, character voice, relationship specifics, backstory depth" },
            { target: "market_sheet", covers: "commercial positioning, comp titles, audience targeting, revenue model, platform strategy" },
          ]
        },
        concept_brief: {
          owns: "premise depth, logline impact, theme clarity, genre positioning, tonal consistency, hook strength, escalation logic at concept level",
          defers: [
            { target: "character_bible", covers: "character arc design, voice distinctiveness, relationship dynamics, backstory specifics" },
            { target: "beat_sheet", covers: "structural beats, act breaks, turning points, pacing architecture" },
}