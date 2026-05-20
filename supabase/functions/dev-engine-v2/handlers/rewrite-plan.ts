          }
        }
        return null;
      }

      let chunkMeta: Array<{ chunk_index: number; chunk_key: string; label: string; episode_start?: number | null; episode_end?: number | null; section_id?: string | null }> =
        chunkTexts.map((chunkText, i) => {
          const sectionLabel = SECTIONED_PLAN_TYPES.has(sourceDocType)
            ? (extractSectionLabelFromChunk(chunkText) || `Chunk ${i + 1}`)
            : `Chunk ${i + 1}`;
          return {
            chunk_index: i,
            chunk_key: `chunk_${String(i + 1).padStart(2, "0")}`,
            label: sectionLabel,
          };
        });
      let strategy = SECTIONED_PLAN_TYPES.has(sourceDocType) ? "sectioned" : "legacy_slugline";
      let resolvedEpisodeCount: number | null = null;

      if (isLargeRiskDocType(sourceDocType)) {
        try {
          const episodeBlocks = parseEpisodeBlocks(fullText);
          const episodeMap = new Map<number, string>(episodeBlocks.map((b) => [b.episodeNumber, b.text]));
          const maxEpisodeInSource = episodeBlocks.reduce((max, b) => Math.max(max, b.episodeNumber), 0);

          const { data: projectRow } = await supabase.from("projects")
            .select("season_episode_count")
            .eq("id", projectId)
            .maybeSingle();

          const canonicalEpisodeCount = Number(projectRow?.season_episode_count || 0);
          resolvedEpisodeCount = canonicalEpisodeCount > 0
            ? canonicalEpisodeCount
            : (maxEpisodeInSource > 0 ? maxEpisodeInSource : null);

          if (resolvedEpisodeCount && resolvedEpisodeCount > 0) {
            const plan = chunkPlanFor(sourceDocType, {
              episodeCount: resolvedEpisodeCount,
              sceneCount: null,
            });

            if (plan.strategy === "episodic_indexed") {
              strategy = "episodic_indexed";
              chunkMeta = plan.chunks.map((chunk) => ({
                chunk_index: chunk.chunkIndex,
                chunk_key: chunk.chunkKey,
                label: chunk.label,
                episode_start: chunk.episodeStart ?? null,
                episode_end: chunk.episodeEnd ?? null,
                section_id: chunk.sectionId ?? null,
              }));

              chunkTexts = plan.chunks.map((chunk) => {
                const start = chunk.episodeStart ?? 0;
                const end = chunk.episodeEnd ?? 0;
                const parts: string[] = [];
                for (let ep = start; ep <= end; ep++) {
                  const block = episodeMap.get(ep);
                  if (block) {
                    parts.push(block);
                  } else {
                    parts.push(`## EPISODE ${ep}\n[MISSING IN SOURCE — regenerate this episode fully.]`);
                  }
                }
                return parts.join("\n\n").trim();
              });
            }
          }
        } catch (episodicPlanErr: any) {
          console.warn(`[dev-engine-v2] rewrite-plan episodic chunking fallback: ${episodicPlanErr?.message || episodicPlanErr}`);
        }
      }

      if (chunkTexts.length === 0) {
        chunkTexts = [fullText];
        chunkMeta = [{ chunk_index: 0, chunk_key: "chunk_01", label: "Chunk 1" }];
        strategy = "legacy_slugline";
      }

      // ── Context Parity: resolve narrative context + constraint pack at plan time ──
      let narrativeBlock = "";
      let narrativeResolverHash = "";
      let narrativeCounts: Record<string, number> = {};
      let constraintPackBlock = "";
      try {
        const { data: projForCtx } = await supabase.from("projects")
          .select("assigned_lane, format")
          .eq("id", projectId)
          .maybeSingle();
        const planLane = projForCtx?.assigned_lane || "independent-film";
        const planFormat = projForCtx?.format || "film";

        const narrativeCtx = await resolveNarrativeContext(supabase, projectId, {
          lane: planLane,
          format: planFormat,
          includeSignals: true,
        });
        narrativeBlock = buildNarrativeContextBlock(narrativeCtx);
        narrativeResolverHash = narrativeCtx.metadata.resolverHash;
        narrativeCounts = narrativeCtx.metadata.counts;

        constraintPackBlock = await loadConstraintPack(supabase, projectId);

        console.log(`[dev-engine-v2] rewrite-plan: stored_context_pack hash=${narrativeResolverHash} narrative_chars=${narrativeBlock.length} constraint_chars=${constraintPackBlock.length} signals=${narrativeCounts.signals ?? 0} decisions=${narrativeCounts.decisions ?? 0} canonChars=${narrativeCounts.canonChars ?? 0} nec=${narrativeCounts.nec_pref ?? 0}/${narrativeCounts.nec_max ?? 0}`);
      } catch (ctxErr: any) {
        console.warn(`[dev-engine-v2] rewrite-plan: context pack resolution failed (proceeding without):`, ctxErr?.message || ctxErr);
      }

      // ── STALE NOTE FILTER: auto-resolve notes whose content no longer exists in the doc ──
      let freshNotes = approvedNotes || [];
      if (Array.isArray(approvedNotes) && approvedNotes.length > 0 && fullText.trim().length > 100) {
        const STALE_STOP = new Set(["the","and","for","with","not","but","are","was","had","has","its","all","can","you","out","did","get","got","say","see","way","new","now","how","why","use","own","our","two","may","set","put","end","let","try","ask","too","any","old","off","per","big","far","yet","add","run","won","buy","cut","hit","fix","via","ago","lot","bad","top","low","due","per","non","nor","key","per","via","red","hot","ago","lot","bad","top","low","due","non","nor","key"]);
        const staleIds: string[] = [];
        const kept: any[] = [];
        const fullTextLower = fullText.toLowerCase();
        for (const note of approvedNotes) {
          if (note.category === "user_direction" || note.category === "direction") { kept.push(note); continue; }
          const rawText = [note.note, note.title, note.summary, note.note_key, note.resolution_directive, note.description, ...(Array.isArray(note.selectedOptions) ? note.selectedOptions : [])].filter(Boolean).join(" ").toLowerCase();
          const terms = [...new Set(rawText.replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter((w: string) => w.length > 2 && !STALE_STOP.has(w)))];
          if (terms.length === 0) { kept.push(note); continue; }
          terms.some((t: string) => fullTextLower.includes(t)) ? kept.push(note) : note.id && typeof note.id === "string" && note.id.length > 10 && staleIds.push(note.id);
        }
        if (staleIds.length > 0) {
          try {
            await supabase.from("project_notes").update({ status: "resolved", resolved_by: "auto_stale_detection", resolved_at: new Date().toISOString() }).in("id", staleIds);
            console.log(`[dev-engine-v2] stale_note: auto-resolved ${staleIds.length} notes: ${staleIds.join(",")}`);
          } catch (e: any) { console.warn(`[dev-engine-v2] stale_note: resolve failed (non-fatal):`, e.message); }
        }
        freshNotes = kept;
        if (staleIds.length > 0 || kept.length !== approvedNotes.length) {
          console.log(`[dev-engine-v2] stale_note: ${approvedNotes.length} in → ${kept.length} kept, ${staleIds.length} stale`);
        }
      }

      const { data: planRun } = await supabase.from("development_runs").insert({
        project_id: projectId,
        document_id: documentId,
        version_id: versionId,
        user_id: user.id,
        run_type: "REWRITE_PLAN",
        output_json: {
          total_chunks: chunkTexts.length,
          chunk_char_counts: chunkTexts.map(c => c.length),
          original_char_count: fullText.length,
          approved_notes: freshNotes,
          protect_items: protectItems || [],
          chunk_texts: chunkTexts,
          doc_type: sourceDocType,
          strategy,
          episode_count: resolvedEpisodeCount,
          chunk_meta: chunkMeta,
          narrative_block: narrativeBlock || null,
          narrative_resolver_hash: narrativeResolverHash || null,
          narrative_counts: Object.keys(narrativeCounts).length > 0 ? narrativeCounts : null,
          constraint_pack_block: constraintPackBlock || null,
        },
      }).select().single();

      return new Response(JSON.stringify({
        planRunId: planRun!.id,
        totalChunks: chunkTexts.length,
        originalCharCount: fullText.length,
        strategy: strategy || "legacy_slugline",
        chunkMeta: chunkMeta || [],
        episodeCount: resolvedEpisodeCount || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── REWRITE-CHUNK (chunked rewrite step 2) ──
    if (action === "rewrite-chunk") {
      const { planRunId, chunkIndex, previousChunkEnding } = body;
      if (!planRunId || chunkIndex === undefined) throw new Error("planRunId, chunkIndex required");

      const { data: planRun } = await supabase.from("development_runs")
        .select("output_json").eq("id", planRunId).single();
      if (!planRun) throw new Error("Plan run not found");

      const plan = planRun.output_json as any;
      const chunkText = plan?.chunk_texts?.[chunkIndex];
      if (chunkText === undefined) throw new Error(`Chunk ${chunkIndex} not found`);

      // ── Context Parity: extract stored narrative context from plan ──
      let chunkNarrativeBlock = plan?.narrative_block || "";
      let chunkConstraintBlock = plan?.constraint_pack_block || "";
      let fallbackResolve = false;

      if (!chunkNarrativeBlock) {
        // Backwards compatibility: old plans without narrative_block — resolve on the fly
        try {
          const { data: planDoc } = await supabase.from("development_runs")
            .select("project_id").eq("id", planRunId).single();
          const fallbackProjectId = planDoc?.project_id;
          if (fallbackProjectId) {
            const { data: projForFallback } = await supabase.from("projects")
              .select("assigned_lane, format")
              .eq("id", fallbackProjectId)
              .maybeSingle();
            const fbLane = projForFallback?.assigned_lane || "independent-film";
            const fbFormat = projForFallback?.format || "film";
            const fbCtx = await resolveNarrativeContext(supabase, fallbackProjectId, {
              lane: fbLane, format: fbFormat, includeSignals: true,
            });
            chunkNarrativeBlock = buildNarrativeContextBlock(fbCtx);
            chunkConstraintBlock = await loadConstraintPack(supabase, fallbackProjectId);
            fallbackResolve = true;
            console.warn(`[dev-engine-v2] rewrite-chunk: fallback_resolve_in_chunk=true (old plan missing narrative_block) hash=${fbCtx.metadata.resolverHash} narrative_chars=${chunkNarrativeBlock.length}`);
          }
        } catch (fbErr: any) {
          console.warn(`[dev-engine-v2] rewrite-chunk: fallback resolve failed:`, fbErr?.message || fbErr);
        }
      }

      // ── Season Scope Injection: load upstream season docs for season_script chunked rewrite ──
      const rawChunkDocType = plan?.doc_type;
      const docType = (rawChunkDocType && rawChunkDocType !== "script")
        ? rawChunkDocType
        : resolveScriptTypeForFormat(plan?.format || null);


      // ── CHARACTER FACTS BLOCK for chunked rewrite (F1 fix):
      // Inject protagonist/antagonist/Former Ally facts into both system prompt
      // and user prompt so the model has authoritative character identity during rewrite.
      let characterFactsBlock = "";
      if (docType === "story_outline" || docType === "beat_sheet" || docType === "treatment") {
        try {
          let cfProjectId = plan?.project_id;
          if (!cfProjectId) {
            const { data: planRunRow } = await supabase.from("development_runs")
              .select("project_id").eq("id", planRunId).maybeSingle();
            cfProjectId = planRunRow?.project_id;
          }
          if (cfProjectId) {
            const { data: cfCanonRow } = await supabase
              .from("project_canon").select("canon_json").eq("project_id", cfProjectId).maybeSingle();
            const cfCanon = cfCanonRow?.canon_json || {};
            const cfParts: string[] = [];
            if (cfCanon.protagonist && typeof cfCanon.protagonist === "string" && cfCanon.protagonist.trim()) {
              cfParts.push(`Protagonist: ${cfCanon.protagonist.trim()}`);
            } else if (Array.isArray(cfCanon.characters) && cfCanon.characters.length > 0) {
              const cfProtag = cfCanon.characters.find((c: any) =>
                c && (c.role === "protagonist" || c.role === "main_protagonist" || c.role === "primary_protagonist"));
              if (cfProtag?.name) cfParts.push(`Protagonist: ${cfProtag.name}`);
            }
            if (Array.isArray(cfCanon.characters) && cfCanon.characters.length > 0) {
              const antagonists = cfCanon.characters.filter((c: any) =>
                c && (c.role === "antagonist" || c.role === "main_antagonist" || c.role === "villain" ||
                  c.relationship === "enemy" || c.relationship === "adversary" ||
                  (Array.isArray(c.relationships) && c.relationships.some((r: any) => r.type === "enemy"))));
              for (const ant of antagonists) {
                const rel = ant.relationship ||
                  (Array.isArray(ant.relationships) && ant.relationships.find((r: any) => r.type === "enemy")?.type) || "enemy";
                cfParts.push(`Antagonist: ${ant.name} (relationship: ${rel})`);
                cfParts.push(`${ant.name} is an ENEMY of the protagonist — ${ant.want || ant.fatal_flaw || "antagonist"}`);
              }
              const formerAllies = cfCanon.characters.filter((c: any) =>
                c && (c.relationship === "former_ally" || c.relationship === "frenemy" ||
                  (Array.isArray(c.relationships) && c.relationships.some((r: any) => r.type === "former_ally"))));
              for (const fa of formerAllies) {
                const rel = fa.relationship || "former_ally";
                cfParts.push(`Former Ally: ${fa.name} (relationship: ${rel})`);
              }
            }
            if (cfParts.length > 0) {
              characterFactsBlock = `\n\nCHARACTER FACTS (CANONICAL — do not contradict these in the rewrite):\n${cfParts.join("\n")}`;
            }
          }
        } catch (cfErr: any) {
          console.warn("[dev-engine-v2] rewrite-chunk: characterFactsBlock build failed (non-fatal):", cfErr?.message);
        }
      }

      let seasonScopeBlock = "";
      if (docType === "season_script") {
        try {
          const { data: planDoc } = await supabase.from("development_runs")
            .select("project_id").eq("id", planRunId).single();
          const scopeProjectId = planDoc?.project_id;
          if (scopeProjectId) {
            const coreDocs = await fetchCoreDocs(supabase, scopeProjectId);
            const scopeParts: string[] = [];
            if (coreDocs.seasonArc) {
              scopeParts.push(`## SEASON ARC (CANONICAL — USE AS AUTHORITATIVE STRUCTURE)\n${coreDocs.seasonArc.slice(0, 4000)}`);
            }
            if (coreDocs.characterBible) {
              scopeParts.push(`## CHARACTER BIBLE (CANONICAL — USE THESE CHARACTERS ONLY)\n${coreDocs.characterBible.slice(0, 4000)}`);
            }
            if (coreDocs.formatRules) {
              scopeParts.push(`## FORMAT RULES (MANDATORY)\n${coreDocs.formatRules.slice(0, 2000)}`);
            }
            if (coreDocs.episodeGrid) {
              scopeParts.push(`## EPISODE GRID (CANONICAL EPISODE STRUCTURE)\n${coreDocs.episodeGrid.slice(0, 3000)}`);
            }
            if (scopeParts.length > 0) {
              seasonScopeBlock = `\n\n# SEASON SCOPE CONTEXT (BINDING)\n${scopeParts.join("\n\n")}`;
