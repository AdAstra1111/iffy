        },
        treatment: {
          owns: "prose narrative quality, scene texture, atmosphere, pacing, present-tense flow, character interiority at scene level",
          defers: [
            { target: "character_bible", covers: "character arc design, backstory depth, relationship dynamics beyond what's in the treatment scenes" },
            { target: "beat_sheet", covers: "formal act structure, beat-by-beat architecture, structural completeness" },
            { target: "market_sheet", covers: "commercial positioning, comps, revenue model" },
            { target: "feature_script", covers: "dialogue craft, scene-level dramatic action, visual storytelling" },
          ]
        },
        story_outline: {
          owns: "scene-by-scene structural plan, act balance, page allocation, narrative throughline, sequence logic",
          defers: [
            { target: "character_bible", covers: "character voice, arc depth beyond outline-level" },
            { target: "feature_script", covers: "dialogue, scene dynamics, visual storytelling, prose" },
          ]
        },
        character_bible: {
          owns: "character depth, arc design, relationship dynamics, thematic integration, voice distinctiveness, pressure patterns",
          defers: [
            { target: "beat_sheet", covers: "structural beat execution, act architecture" },
            { target: "feature_script", covers: "dialogue craft, scene-level character expression" },
          ]
        },
        beat_sheet: {
          owns: "beat progression, dramatic escalation, turning points, structural completeness, act architecture, pacing blueprint",
          defers: [
            { target: "feature_script", covers: "dialogue quality, scene dynamics, visual storytelling, prose" },
            { target: "production_draft", covers: "production feasibility, department notes" },
          ]
        },
        feature_script: {
          owns: "dialogue craft, scene dynamics, pacing, character voice, visual storytelling, structural integrity at scene level",
          defers: [
            { target: "production_draft", covers: "production notes, department feasibility, scheduling implications" },
          ]
        },
        episode_script: {
          owns: "dialogue craft, scene dynamics, pacing, character voice, visual storytelling",
          defers: [
            { target: "production_draft", covers: "production notes, department feasibility" },
          ]
        },
        market_sheet: {
          owns: "audience targeting, comp titles, market gap, platform strategy, revenue model, budget alignment",
          defers: []
        },
        season_arc: {
          owns: "arc architecture, escalation logic, turning-point placement, thematic spine, character arc integration across the season",
          defers: [
            { target: "episode_grid", covers: "episode-level specifics, hook/cliffhanger design, individual episode beats" },
            { target: "character_bible", covers: "character voice, backstory depth" },
          ]
        },
        episode_grid: {
          owns: "episode-level hook quality, cliffhanger design, escalation curve across episodes, arc position accuracy",
          defers: [
            { target: "vertical_episode_beats", covers: "within-episode beat detail, moment-by-moment construction" },
          ]
        },
        vertical_episode_beats: {
          owns: "beat specificity within episodes, hook-first mandate, cliffhanger quality, retention mechanics",
          defers: [
            { target: "season_script", covers: "dialogue, scene dynamics, prose" },
          ]
        },
      };

      const scope = DOC_SCOPE[deliverableType as string];
      const scopeBlock = scope
        ? `DOC SCOPE — WHAT THIS DOCUMENT OWNS:\n${scope.owns}\n\nDEFERRAL RULES — do NOT raise notes for these in this doc, set apply_timing accordingly:\n${scope.defers.map(d => `- apply_timing="next_doc", target_deliverable_type="${d.target}": ${d.covers}`).join("\n")}\n${scope.defers.length === 0 ? "- This is a terminal document — no deferral. All notes are now." : ""}`
        : `DOC SCOPE: Evaluate relative to the document's stated purpose. Use apply_timing="now" only for issues resolvable in this document.`;

      // ── Load upstream deferred notes (carried forward from previous docs) ──
      // When a doc opens, check if upstream docs in the same project deferred notes to this type.
      // Inject as context so this doc's notes engine knows what's expected and doesn't re-raise
      // them as surprises — they're planned work, not new findings.
      let upstreamDeferredBlock = "";
      try {
        // Legacy: read from development_notes (upstream deferred notes)
        const { data: upstreamDeferred } = await supabase
          .from("development_notes")
          .select("note_key, description, severity, target_deliverable_type, why_it_matters")
          .eq("project_id", projectId)
          .eq("target_deliverable_type", deliverableType)
          .eq("resolved", false);

        // Modern: also read from project_notes for this doc type
        const { data: modernNotes } = await supabase
          .from("project_notes")
          .select("id, title, summary, category, severity, doc_type, status")
          .eq("project_id", projectId)
          .eq("doc_type", deliverableType)
          .in("status", ["open", "in_progress"]);

        // Merge both sources into a unified deferred notes list
        const allDeferred: { note_key: string; description: string; severity: string; source: string }[] = [];
        if (upstreamDeferred && upstreamDeferred.length > 0) {
          for (const n of upstreamDeferred) {
            allDeferred.push({ note_key: n.note_key, description: n.description, severity: n.severity, source: "legacy" });
          }
        }
        if (modernNotes && modernNotes.length > 0) {
          for (const n of modernNotes) {
            allDeferred.push({ note_key: n.title || n.id, description: n.summary || "", severity: n.severity || "med", source: "project_notes" });
          }
        }

        if (allDeferred.length > 0) {
          const deferredLines = allDeferred.map((n) =>
            `- [${n.severity}] ${n.note_key}: ${n.description}`
          ).join("\n");
          upstreamDeferredBlock = `\n\nNOTES CARRIED FORWARD FROM UPSTREAM DOCUMENTS (these were deferred here by earlier stages — they are EXPECTED work for this document, not new findings):\n${deferredLines}\nTreat these as pre-known issues. If this document has addressed them, mark resolved. If not, raise them as now-blockers with the same note_key.`;
        }
      } catch (e) {
        console.warn("[dev-engine-v2] upstream deferred notes load failed (non-fatal):", e);
      }

      const notesSystem = `You are IFFY. Generate structured development notes in three tiers, with DECISION OPTIONS for blockers and high-impact notes.

PRODUCTION TYPE: ${notesProductionType}
${notesFormatExp}

EDITORIAL SCOPE LOCK: You are operating in EDITORIAL MODE for a ${notesEffectiveFormat} project.
- Do NOT apply feature film pacing logic or structure to non-feature formats.
- Do NOT penalise a vertical drama for not being a feature film.
- Score and note relative to the declared format and its ladder.
- Valid document types for this format: ${notesLadderStr}
- Do NOT reference document types outside this ladder.

${scopeBlock}
Return ONLY valid JSON:
{
  "protect": ["non-negotiable items to preserve"],
  "blocking_issues": [
    {
      "id": "stable_key", "category": "structural|character|escalation|lane|packaging|risk|pacing|hook|cliffhanger",
      "description": "...", "why_it_matters": "...", "severity": "blocker",
      "apply_timing": "now|next_doc|later",
      "target_deliverable_type": "deliverable type if next_doc or later, null if now",
      "defer_reason": "why deferred, if not now",
      "decisions": [
        {
          "option_id": "B1-A",
          "title": "short action title (max 8 words)",
          "what_changes": ["list of story elements that change"],
          "creative_tradeoff": "one sentence on creative cost/benefit",
          "commercial_lift": 0-20
        }
      ],
      "recommended": "option_id of recommended choice"
    }
  ],
  "high_impact_notes": [
    {
      "id": "stable_key", "category": "...", "description": "...", "why_it_matters": "...", "severity": "high",
      "apply_timing": "now|next_doc|later",
      "target_deliverable_type": "deliverable type if next_doc or later, null if now",
      "defer_reason": "why deferred, if not now",
      "decisions": [
        {
          "option_id": "H1-A",
          "title": "short action title",
          "what_changes": ["list of story elements that change"],
          "creative_tradeoff": "one sentence",
          "commercial_lift": 0-15
        }
      ],
      "recommended": "option_id of recommended choice"
    }
  ],
  "polish_notes": [
    {"id": "stable_key", "category": "...", "description": "...", "why_it_matters": "...", "severity": "polish", "apply_timing": "now|next_doc|later", "target_deliverable_type": null}
  ],
  "global_directions": [
    {"id": "G1", "direction": "overarching creative direction", "why": "rationale"}
  ],
  "rewrite_plan": ["what will change in next rewrite — max 5 items"],
  "carried_forward": [
    {"target": "concept_brief", "count": 2, "summary": "Protagonist backstory depth, escalation path specifics"},
    {"target": "character_bible", "count": 1, "summary": "Character arc design for secondary cast"}
  ]
}

carried_forward RULES:
- List every doc type that has deferred notes, with a count and one-sentence summary of what's being deferred.
- Only include targets that actually have deferred notes from this run.
- If nothing is deferred, return carried_forward as an empty array.
- This is shown to the user as: "X notes carried forward to [doc]" — so make the summary useful and specific.

DECISION RULES:
- Every blocker MUST have exactly 2-3 decisions (resolution options). Each option represents a different creative strategy.
- High-impact notes SHOULD have 2 decisions where meaningful. If only one path exists, provide 1 decision.
- Polish notes do NOT need decisions.
- option_id format: B{n}-{letter} for blockers, H{n}-{letter} for high. Letters are A, B, C.
- what_changes: list 2-4 specific story elements affected.
- creative_tradeoff: honest one-sentence assessment of the creative cost or benefit.
- commercial_lift: integer 0-20 estimating approximate GP improvement if applied.
- recommended: pick the option that best balances creative integrity with commercial viability.
- global_directions: 1-3 overarching tonal/strategic directions that apply across all notes.

GENERAL RULES:
- Each id and note_key must be identical, stable, descriptive snake_case keys (e.g. "weak_act2_midpoint").
- blocking_issues: ONLY items fundamentally preventing the document from working. Max 5.
- high_impact_notes: Significant but non-blocking improvements. Max 5.
- polish_notes: Optional refinements. Max 5.
- Sort within each tier by structural importance.
|- Do NOT re-raise previously resolved issues as blockers.
|- If an existing note_key persists, use the same key — do NOT rephrase under a new key.
|- CONVERGENCE & ANTI-INVENT RULES:
  • If the document convergence status is "converged" or close to converged (few blockers, CI >= 60, GP >= 60), do NOT invent new blockers. The goal at this stage is refinement, not disruption.
  • Only raise a blocker if there is a genuine, unresolved structural or narrative issue — not because the LLM always generates some blockers.
  • If all prior notes are resolved and the document is approaching convergence, prefer high_impact_notes or polish_notes over inventing new blocking_issues.
  • Keep note keys stable across runs — re-raising the same issue under a different key is churn. Use the same note_key for the same issue.
${deliverableType === "treatment" && notesEffectiveFormat === "film" ? `|- ACT BISECTION AWARENESS: Act 2A + Act 2B within a 3-act film structure is a MIDPOINT SPLIT, NOT a fourth act. Do NOT flag 2A/2B as "too many acts" or "act structure confusion." This is a standard structural choice for feature films where the midpoint divides Act 2. Do NOT suggest collapsing 2A and 2B into a single Act 2 — that is a distinct creative choice, not a structural error. Genuine 4-act projects (e.g. limited series arcs, non-standard formats) should remain unaffected; the rule is specifically about not misreading bisection as a 4th act.${antiRepeatRule}` : `${deliverableType !== "treatment" || notesEffectiveFormat !== "film" ? `|- CONVERGENCE RULES:${antiRepeatRule}` : ""}`}

${(() => {
  const docTypeNoteScopes: Record<string, string> = {
    character_bible: `DOCUMENT TYPE: CHARACTER BIBLE
|- Evaluate character completeness, arc design, voice distinctiveness, relationship dynamics, thematic integration, and backstory depth.
|- Valid note categories: "character_depth|arc_clarity|voice_distinctiveness|relationship_dynamics|backstory_consistency|thematic_integration|missing_character|cast_balance"
|- Do NOT raise notes about scene structure, pacing, dialogue craft, act breaks, hooks, or cliffhangers — those are script concerns.
|- Flag missing characters or underdeveloped arcs as blockers.`,
    season_arc: `DOCUMENT TYPE: SEASON ARC
- Evaluate arc architecture, escalation logic, turning-point placement, thematic spine, and character arc integration.
- Valid note categories: "arc_structure|escalation|turning_points|character_arc_integration|thematic_spine|series_engine|season_resolution"
- Do NOT raise dialogue or scene-level notes.`,
    episode_grid: `DOCUMENT TYPE: EPISODE GRID
- Evaluate structural completeness, hook specificity, escalation curve, cliffhanger quality, and episode-count alignment.
- Valid note categories: "hook_quality|cliffhanger_strength|escalation_curve|arc_position|episode_count_alignment|core_move_clarity|episode_progress"
- IMPORTANT: Missing episodes during iterative development are PROGRESS indicators, not blockers. Only flag as blocker if episodes are structurally corrupted, collapsed into ranges, or contain summarization language.`,
    format_rules: `DOCUMENT TYPE: FORMAT RULES
- Evaluate structural rule clarity, duration compliance, episode template completeness, and production constraint specificity.
- Valid note categories: "duration_spec|episode_template|structural_rules|platform_spec|production_constraints"
- Do NOT raise narrative or character notes.`,
    market_sheet: `DOCUMENT TYPE: MARKET SHEET
- Evaluate commercial viability, comp titles, audience targeting, platform strategy, and revenue model.
- Valid note categories: "comp_quality|audience_specificity|market_gap|platform_strategy|revenue_model|budget_alignment"
- Do NOT raise creative or narrative notes.`,
    concept_brief: `DOCUMENT TYPE: CONCEPT BRIEF
- Evaluate premise strength, theme clarity, genre positioning, tonal consistency, and logline impact.
- Valid note categories: "premise_strength|theme_clarity|genre_positioning|tonal_consistency|logline_impact|hook_strength"`,
    idea: `DOCUMENT TYPE: IDEA
- An idea is a logline + premise engine + genre declaration. It is NOT a concept brief or treatment.
- Valid note categories: "concept_originality|hook_strength|commercial_potential|development_clarity|premise_engine|antagonist_force"
- apply_timing="now" ONLY for: premise engine completely absent, antagonist/opposition completely absent, genre directly contradicted by premise, series format mismatch.
- apply_timing="next_doc" + target_deliverable_type="concept_brief" for: escalation path detail, protagonist backstory, relationship dynamics, theme integration, market hook sharpening.
- apply_timing="next_doc" + target_deliverable_type="character_bible" for: character depth, arc detail, voice.
- apply_timing="next_doc" + target_deliverable_type="market_sheet" for: commercial positioning, comps, revenue model.
- apply_timing="next_doc" + target_deliverable_type="beat_sheet" for: structural detail, act breaks, turning points.
- Do NOT generate more than 2 now-blockers for an idea that has a protagonist, an opposition force, and a working premise engine. If those three exist, it should have ZERO now-blockers.`,
  };
  return docTypeNoteScopes[deliverableType as string] || `DOCUMENT TYPE: ${(deliverableType || "unknown").toUpperCase()}
- Evaluate relative to the document's stated purpose. Use appropriate categories for this document type.
- Do NOT apply script/screenplay evaluation criteria unless this is a script document.`;
})()}`;

      // ── Canon OS injection for notes (full canon fields) ──
      let notesCanonBlock = "";
      try {
        const { data: notesProj } = await supabase.from("projects")
          .select("canon_version_id").eq("id", projectId).single();
        let notesCj: any = null;
        if (notesProj?.canon_version_id) {
          const { data: cVer } = await supabase.from("project_canon_versions")
            .select("canon_json").eq("id", notesProj.canon_version_id).maybeSingle();
          notesCj = cVer?.canon_json;
        }
        // Fallback to project_canon table
        if (!notesCj) {
          const { data: canonRow } = await supabase.from("project_canon")
            .select("canon_json").eq("project_id", projectId).maybeSingle();
          notesCj = canonRow?.canon_json;
        }
        if (notesCj) {
          const parts: string[] = [];
          const cMin = typeof notesCj.episode_length_seconds_min === "number" ? notesCj.episode_length_seconds_min : null;
          const cMax = typeof notesCj.episode_length_seconds_max === "number" ? notesCj.episode_length_seconds_max : null;
          const cCount = typeof notesCj.episode_count === "number" ? notesCj.episode_count : null;
          if (notesCj.logline && typeof notesCj.logline === "string" && notesCj.logline.trim()) parts.push(`Logline: ${notesCj.logline}`);
          if (notesCj.premise && typeof notesCj.premise === "string" && notesCj.premise.trim()) parts.push(`Premise: ${notesCj.premise}`);
          if (Array.isArray(notesCj.characters) && notesCj.characters.length > 0) {
            const charLines = notesCj.characters.filter((c: any) => c.name?.trim()).map((c: any) => `  - ${c.name}: ${[c.role, c.goals].filter(Boolean).join("; ")}`);
            if (charLines.length > 0) parts.push(`Characters:\n${charLines.join("\n")}`);
          }
          if (cCount) parts.push(`Episode count: ${cCount}`);
          if (cMin != null && cMax != null) parts.push(`Episode duration range: ${cMin}–${cMax}s (use this range, not 180s or any other hardcoded value)`);
          else if (cMin != null) parts.push(`Episode duration: ${cMin}s`);
          if (notesCj.format) parts.push(`Format: ${notesCj.format}`);
          if (notesCj.tone_style && typeof notesCj.tone_style === "string" && notesCj.tone_style.trim()) parts.push(`Tone: ${notesCj.tone_style}`);
          if (parts.length > 0) {
            notesCanonBlock = `\n\nCANON OS (authoritative — do not contradict):\n${parts.join("\n")}`;
          }
        }
        // If no canon content established, inject warning
        if (!notesCanonBlock) {
          notesCanonBlock = `\n\nCANON OS: No canonical logline, premise, or characters established. Reference document content as "per the document" not as established canon.`;
        }
      } catch (_e) { /* non-fatal */ }

      // ── NEC Guardrail injection for notes ──
      const notesNecBlock = await loadNECGuardrailBlock(supabase, projectId);

      const userPrompt = `ANALYSIS:\n${JSON.stringify(analysis)}${notesCanonBlock}${notesNecBlock}${upstreamDeferredBlock}\n\nMATERIAL (${version.plaintext.length} chars total):\n${version.plaintext}`;
      const raw = await callAI(OPENROUTER_API_KEY, BALANCED_MODEL, notesSystem, userPrompt, 0.25, 6000);
      let parsed = await parseAIJson(OPENROUTER_API_KEY, raw);
      if (!parsed) {
        console.error("[dev-engine-v2] notes: parseAIJson returned null", raw.slice(0, 300));
        return new Response(JSON.stringify({ success: false, error: "MODEL_JSON_PARSE_FAILED", where: "notes", snippet: raw.slice(0, 300) }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Backward compat: build actionable_notes from tiered notes
      // Default apply_timing to "now" if missing (backward compat), then normalise
      const normaliseNotesTiming = (notes: any[], severity: string) => notes.map((n: any) => {
        if (!n.apply_timing) n.apply_timing = "now";
        if (n.apply_timing !== "now" && n.apply_timing !== "next_doc" && n.apply_timing !== "later") n.apply_timing = "now";
        return n;
      });
      const allTieredNotes = [
        ...normaliseNotesTiming(parsed.blocking_issues || [], "blocker").map((n: any) => ({ ...n, impact: "high", convergence_lift: 10, severity: "blocker" })),
        ...normaliseNotesTiming(parsed.high_impact_notes || [], "high").map((n: any) => ({ ...n, impact: "high", convergence_lift: 5, severity: "high" })),
        ...normaliseNotesTiming(parsed.polish_notes || [], "polish").map((n: any) => ({ ...n, impact: "low", convergence_lift: 1, severity: "polish" })),
      ];
      // ── Compute carried_forward authoritatively from actual note timing ──
      // Group all next_doc/later notes by target and compute summary.
      // This overrides/supplements whatever the LLM returned in carried_forward.
      const deferredByTarget = new Map<string, any[]>();
      for (const note of allTieredNotes) {
        if (note.apply_timing === "next_doc" || note.apply_timing === "later") {
          const target = note.target_deliverable_type || "unspecified";
          if (!deferredByTarget.has(target)) deferredByTarget.set(target, []);
          deferredByTarget.get(target)!.push(note);
        }
      }
      const carriedForward = Array.from(deferredByTarget.entries()).map(([target, notes]) => ({
        target,
        count: notes.length,
        summary: notes.map((n: any) => n.description?.split(".")[0] || n.id).slice(0, 3).join("; "),
        note_keys: notes.map((n: any) => n.id).filter(Boolean),
      }));
      parsed.carried_forward = carriedForward;

      // now_notes: only notes with apply_timing="now" (what user should actually apply)
      const nowNotes = allTieredNotes.filter(n => n.apply_timing === "now");
      parsed.now_notes_count = nowNotes.length;
      parsed.has_now_notes = nowNotes.length > 0;

      parsed.actionable_notes = allTieredNotes.map(n => ({
        category: n.category,
        note: n.description,
        impact: n.impact,
        convergence_lift: n.convergence_lift,
        severity: n.severity,
        id: n.id,
        why_it_matters: n.why_it_matters,
        apply_timing: n.apply_timing,
        target_deliverable_type: n.target_deliverable_type || null,
      }));
      parsed.prioritized_moves = parsed.actionable_notes;

      // Track notes in development_notes table
      const currentNoteKeys = new Set(allTieredNotes.map((n: any) => n.id).filter(Boolean));

      // Mark previously unresolved notes that are no longer present as resolved.
      // IMPORTANT: class_a_spine_* notes are excluded from auto-resolution here because
      // they are managed by the dedicated Class A Spine Check pass (Phase 3), not by
      // LLM reviewer output presence/absence. The Class A pass has its own DB-level
      // deduplication and only resolves these notes when the spine contradiction is
      // actually fixed in the document. Auto-resolving them here would cause false
      // clearances whenever the general reviewer simply omits the same note key.
      for (const prev of existingUnresolved) {
        if (prev.note_key.startsWith('class_a_spine_')) continue;
        if (!currentNoteKeys.has(prev.note_key)) {
          await supabase.from("development_notes")
            .update({ resolved: true, resolved_in_version: versionId })
            .eq("note_key", prev.note_key)
            .eq("document_id", documentId)
            .eq("document_version_id", versionId)
            .eq("resolved", false);
        }
      }

      // Check for regressions (previously resolved notes that reappear)
      for (const note of allTieredNotes) {
        if (note.id && previouslyResolved.has(note.id)) {
          // Regressed — mark old resolved entry
          await supabase.from("development_notes")
            .update({ regressed: true })
            .eq("note_key", note.id)
            .eq("document_id", documentId)
            .eq("document_version_id", versionId)
            .eq("resolved", true);
        }
      }

      // Insert new note records (deduplicated by note_key within this version)
      // FIX 5: Normalize note_source — only valid spine provenance survives
      const VALID_SPINE_SOURCES = new Set(["spine_alignment", "spine_drift"]);
      const SPINE_COMPATIBLE_CATEGORIES = new Set(["spine_alignment", "spine_drift"]);

      // Deduplicate by note_key within this version — only keep first occurrence
      const seenNoteKeys = new Set<string>();
      let noteInserts = allTieredNotes
        .filter((n: any) => n.id)
        .filter((n: any) => {
          if (seenNoteKeys.has(n.id)) return false;
          seenNoteKeys.add(n.id);
          return true;
        })
        .map((n: any) => {
          let noteSource = n.note_source || null;
          // Strip invalid spine provenance
          if (noteSource && VALID_SPINE_SOURCES.has(noteSource) && !SPINE_COMPATIBLE_CATEGORIES.has(n.category || "")) {
            noteSource = null;
          }
          if (noteSource && !VALID_SPINE_SOURCES.has(noteSource)) {
            noteSource = null;
          }
          return {
            project_id: projectId,
            document_id: documentId,
            document_version_id: versionId,
            note_key: n.id,
            category: n.category,
            severity: n.severity,
            description: n.description,
            why_it_matters: n.why_it_matters,
            note_source: noteSource,
            apply_timing: n.apply_timing || "now",
            target_deliverable_type: n.target_deliverable_type || null,
          };
        });
      if (noteInserts.length > 0) {
        // ── PHASE 1A — CROSS-VERSION NOTE KEY DEDUPLICATION ──
        // Prevent the same note_key from appearing at multiple severity levels.
        const { data: existingNotes } = await supabase
          .from("development_notes")
          .select("note_key, severity")
          .eq("document_id", documentId)
          .eq("resolved", false);
        
        const existingSeverityByKey: Record<string, string> = {};
        if (existingNotes) {
          for (const en of existingNotes) {
            const key = en.note_key;
            const existingSev = existingSeverityByKey[key];
            if (!existingSev || severityWeight(en.severity) > severityWeight(existingSev)) {
              existingSeverityByKey[key] = en.severity;
            }
          }
        }

        const SEVERITY_ORDER = ["blocker", "high", "polish"];
        function severityWeight(s: string): number {
          const idx = SEVERITY_ORDER.indexOf(s);
          return idx >= 0 ? idx : 99;
        }

        // Filter out duplicates that are lower or equal severity than existing
        const dedupedInserts: typeof noteInserts = [];
        let dupCount = 0;
        for (const note of noteInserts) {
          const existingSev = existingSeverityByKey[note.note_key];
          if (existingSev && severityWeight(note.severity) <= severityWeight(existingSev)) {
            dupCount++;
            console.log(`[notes] NOTE_DEDUP: skipping ${note.note_key} (${note.severity}) — existing ${existingSev} unresolved for document ${documentId}`);
          } else {
            dedupedInserts.push(note);
          }
        }
        if (dupCount > 0) {
          console.log(`[notes] NOTE_DEDUP: suppressed ${dupCount} duplicate note inserts for document ${documentId}`);
        }
        noteInserts = dedupedInserts;
      }

      // ── PHASE 1B — UNIVERSAL NOTE DETECTION & BLOCKER NORMALIZATION ──
      if (noteInserts.length > 0) {
        const UNIVERSAL_PATTERNS = [
          /could be more (distinctive|specific|vivid|detailed|developed|pronounced)/i,
          /could be (clarified|deepened|strengthened|sharpened|enhanced|refined)/i,
          /could be further (elaborated|developed|explored|expanded)/i,
          /(could|would) benefit from (more|additional|further)/i,
          /could be (tightened|trimmed|streamlined)/i,
          /could (strengthen|deepen|enhance|improve|sharpen)/i,
          /consider (deepening|strengthening|enhancing|clarifying|expanding)/i,
          /might benefit from (more|additional|greater)/i,
          /^(enhance|strengthen|deepen|sharpen|refine|tighten|increase|improve) (the|this|its|character|scene|script|visual|dialogue|pacing|thematic)/i,
          /^(increase|improve) (the|its|this)/i,
        ];
        
        const NOT_A_BLOCKER_PATTERNS = [
          /formatting|formatti?n?g/i,
          /(minor|slight).*(format|style)/i,
          /could be more (distinctive|specific)/i,
        ];

        let universalCount = 0;
        let blockerDemotedCount = 0;
        
        const normalizedInserts: typeof noteInserts = [];
        for (const note of noteInserts) {
          const desc = note.description || "";
          let severity = note.severity;
          let modified = false;

          for (const pat of UNIVERSAL_PATTERNS) {
            if (pat.test(desc)) {
              if (severity === "blocker") {
                severity = "high";
                blockerDemotedCount++;
                modified = true;
                console.log(`[notes] UNIVERSAL_NOTE_DEMOTION: ${note.note_key} (blocker→high)`);
              } else if (severity === "high") {
                severity = "polish";
                modified = true;
                console.log(`[notes] UNIVERSAL_NOTE_DEMOTION: ${note.note_key} (high→polish)`);
              } else {
                console.log(`[notes] UNIVERSAL_NOTE_DISCARDED: ${note.note_key} (polish) — matched universal pattern`);
                universalCount++;
                modified = true;
                continue;
              }
              universalCount++;
            }
          }

          if (!modified && severity === "blocker") {
            for (const pat of NOT_A_BLOCKER_PATTERNS) {
              if (pat.test(desc)) {
                severity = "high";
                blockerDemotedCount++;
                modified = true;
                console.log(`[notes] BLOCKER_DEMOTED: ${note.note_key} (→high)`);
              }
            }
          }

          normalizedInserts.push({ ...note, severity });
        }
        
        if (universalCount > 0) {
          console.log(`[notes] UNIVERSAL_NOTE_SUPPRESSED: ${universalCount} universal notes demoted/discarded`);
        }
        if (blockerDemotedCount > 0) {
          console.log(`[notes] BLOCKER_DEMOTION_COUNT: ${blockerDemotedCount} blockers demoted to high`);
        }
        
        // ── PHASE 2A — NOTE CHURN TELEMETRY ──
        const churnCountByKey: Record<string, number> = {};
        if (existingNotes) {
          for (const en of existingNotes) {
            churnCountByKey[en.note_key] = (churnCountByKey[en.note_key] || 0) + 1;
          }
        }
        for (const n of normalizedInserts) {
          if (existingSeverityByKey[n.note_key]) {
            churnCountByKey[n.note_key] = (churnCountByKey[n.note_key] || 0) + 1;
          }
        }
        const churningKeys = Object.entries(churnCountByKey).filter(([,c]) => c >= 3);
        if (churningKeys.length > 0) {
          console.log(`[notes][TEL] NOTE_CHURN { document_id: \"${documentId}\", churning_keys: [${churningKeys.map(([k,c]) => `\"${k}\":${c}`).join(', ')}], total_churning: ${churningKeys.length} }`);
        }
        
        noteInserts = normalizedInserts;
      }

      // ── CONSTRAINT SOLVER: Upsert note states + detect conflicts + decision sets ──
      let enrichedNotes: any[] = [];
      let decisionSets: any[] = [];
      let suppressedCount = 0;

      try {
        // Fetch previous version text for diff-gating
        const { data: prevVersionRow } = await supabase.from("project_document_versions")
          .select("id, plaintext").eq("document_id", documentId)
          .order("version_number", { ascending: false }).limit(2);
        const prevVersion = (prevVersionRow || []).find((v: any) => v.id !== versionId);
        const prevVersionText = prevVersion?.plaintext || "";
        const prevVersionId = prevVersion?.id || null;

        // Fetch existing state canon_hash for comparison
        const { data: prevStateRow } = await supabase.from("project_dev_note_state")
          .select("canon_hash").eq("project_id", projectId).eq("doc_type", deliverableType)
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();

        // Fetch canon inputs for hash
        const { data: bibleDoc } = await supabase.from("project_documents")
          .select("plaintext, extracted_text").eq("project_id", projectId).eq("doc_type", "character_bible").maybeSingle();
        const { data: gridDoc } = await supabase.from("project_documents")
          .select("plaintext, extracted_text").eq("project_id", projectId).eq("doc_type", "episode_grid").maybeSingle();
        const bibleText = bibleDoc?.plaintext || bibleDoc?.extracted_text || "";
        const gridText = gridDoc?.plaintext || gridDoc?.extracted_text || "";
        const canonHash = hashCanonInputs(bibleText, gridText, "");
        const prevCanonHash = prevStateRow?.canon_hash || null;

        // Resolve episode number from the document record if available
        const { data: docRow } = await supabase.from("project_documents")
          .select("doc_type, episode_number").eq("id", documentId).maybeSingle();
        // Use episode_number column if document is episode-specific, else null
        const episodeNumber: number | null = (docRow as any)?.episode_number ?? null;

        // Upsert each note state
        for (const note of allTieredNotes) {
          try {
            // Runtime pressure for soft notes
            const descLower = (note.description || note.note || "").toLowerCase();
            if (note.category === "pacing" || descLower.includes("runtime") || descLower.includes("length") || descLower.includes("duration")) {
              note.objective = "runtime";
            }
            note.intent_label = note.objective || note.category || "";
            // Fix: constraint_key must not default to note ID — use anchor/category
            const inferredAnchor = inferNoteAnchor(note);
            note.constraint_key = note.constraint_key || note.canon_ref_key ||
              (inferredAnchor ? `anchor:${inferredAnchor}` : null) ||
              (note.category ? `cat:${note.category}` : "general");

            const result = await upsertNoteState(supabase, {
              projectId,
              docType: deliverableType,
              episodeNumber,
              note,
              versionId,
              prevVersionText,
              prevVersionId,
              newVersionText: version.plaintext,
              canonHash,
              prevCanonHash,
            });

            // Update canon_hash on the state row
            if (result.state?.id) {
              await supabase.from("project_dev_note_state").update({
                canon_hash: canonHash,
                intent_label: note.intent_label || null,
                objective: note.objective || null,
                constraint_key: note.constraint_key || null,
              }).eq("id", result.state.id);
            }

            if (result.suppressed) {
              suppressedCount++;
              continue;
            }

        // Runtime policy: auto-waive soft runtime notes when escalation score is high
        if (note.objective === "runtime" && note.tier !== "hard") {
          // Fix: use correct path — analysis may store gp_score at top level or under scores
          const gpScore = analysis?.gp_score ?? analysis?.scores?.gp ?? analysis?.scores?.gp_score ?? null;
          const escalationOk = gpScore !== null && gpScore >= 70;
              if (escalationOk && result.state) {
                try {
                  await supabase.from("project_dev_note_state").update({
                    status: "waived",
                    waive_reason: "Auto-waived: escalation score is high; trim in edit",
                  }).eq("id", result.state.id);
                } catch (_e) { /* non-fatal */ }
                suppressedCount++;
                continue;
              }
            }

            enrichedNotes.push({
              ...note,
              note_fingerprint: result.fingerprint,
              note_cluster_id: result.clusterId,
              tier: result.state?.tier || note.tier || "soft",
              severity_score: result.state?.severity || 0.5,
              status: result.state?.status || "open",
              times_seen: result.state?.times_seen || 1,
              witness_json: result.state?.witness_json || null,
              conflict_json: result.state?.conflict_json || null,
              scope_json: result.state?.scope_json || {},
              anchor: result.state?.anchor || null,
              objective: note.objective || null,
              intent_label: note.intent_label || null,
              constraint_key: note.constraint_key || null,
            });
          } catch (e) {
            console.warn("[dev-engine-v2] Note state upsert failed (non-fatal):", e);
            enrichedNotes.push({ ...note });
          }
        }

        // Detect conflicts and create decision sets
        const conflicts = detectConflicts(enrichedNotes);
        if (conflicts.length > 0) {
          decisionSets = await upsertDecisionSets(supabase, projectId, deliverableType, episodeNumber, enrichedNotes, conflicts);
        }

        // Detect loop bundles from enriched notes
        const noteBundles = detectBundles(enrichedNotes);

        // Attach fingerprint metadata to parsed output arrays
        const fpMap: Record<string, any> = {};
        for (const en of enrichedNotes) { fpMap[en.id || en.note_key] = en; }
        for (const arr of [parsed.blocking_issues, parsed.high_impact_notes, parsed.polish_notes]) {
          if (arr) for (const n of arr) {
            const en = fpMap[n.id || n.note_key];
            if (en) {
              n.note_fingerprint = en.note_fingerprint;
              n.note_cluster_id = en.note_cluster_id;
              n.tier = en.tier;
              n.times_seen = en.times_seen;
              n.witness_json = en.witness_json;
              n.conflict_json = en.conflict_json;
              n.objective = en.objective;
              n.intent_label = en.intent_label;
              n.constraint_key = en.constraint_key;
              n.status = en.status;
            }
          }
        }

        // Mute notes that are part of open decision sets
        const mutedFingerprints = new Set<string>();
        for (const ds of decisionSets) {
          if (ds.status === "open") {
            for (const fp of ds.note_fingerprints) mutedFingerprints.add(fp);
          }
        }

        parsed.bundles = noteBundles;
        parsed.decision_sets = decisionSets;
        parsed.suppressed_count = suppressedCount;
        parsed.muted_by_decision = [...mutedFingerprints];
      } catch (e) {
        console.warn("[dev-engine-v2] Constraint solver failed (non-fatal):", e);
      }

      // ── FALSE POSITIVE BLOCKER FILTER ──
      // Run BEFORE stability computations so blocker counts are accurate.
      parsed = filterFalsePositiveBlockers(parsed, deliverableType, notesEffectiveFormat);

      // Compute resolution summary
      const resolvedCount = existingUnresolved.filter(n => !currentNoteKeys.has(n.note_key)).length;
      const regressedCount = allTieredNotes.filter((n: any) => n.id && previouslyResolved.has(n.id)).length;
      parsed.resolution_summary = {
        resolved: resolvedCount,
        regressed: regressedCount,
        suppressed: suppressedCount,
        blockers_remaining: (parsed.blocking_issues || []).length,
        high_impact_remaining: (parsed.high_impact_notes || []).length,
        polish_remaining: (parsed.polish_notes || []).length,
      };

      // Stability status
      const blockerCount = (parsed.blocking_issues || []).length;
      const highCount = (parsed.high_impact_notes || []).length;
      const polishCount = (parsed.polish_notes || []).length;
      parsed.stability_status = blockerCount === 0 && highCount <= 3 && polishCount <= 5
        ? "structurally_stable" : blockerCount === 0 ? "refinement_phase" : "in_progress";

      // ── SPINE CHECKS: Class A + Class B — parallel inference pass ──
      // Fetches spine state once; runs Class A (constitutional) and Class B (bounded modulation)
      // inference concurrently via Promise.allSettled. Post-processes results sequentially.
      //
      // Class A: story_engine + protagonist_arc — exact spec-fidelity, blocker notes.
      // Class B: pressure_system + central_conflict + resolution_type + stakes_class
      //          — structural replacement only, high-impact notes (not blockers).
      //
      // Eligible doc types: CLASS_A_SPINE_CHECK_DOC_TYPES (same for both classes).
      // Fail-closed per class: Promise.allSettled ensures one failure does not cancel the other.
      // Both failures: outer catch handles; no corruption of main notes result.
      //
      // Runtime: parallel reduces combined inference from ~26s to ~13s.
      // Platform idle timeout: 150s (free plan) / 400s (paid plan). No config.toml override available.
      // spine_revalidate (analyze + notes): ~26s + ~34s ≈ 60s — well within platform ceiling.
      let classASpineNotes: any[] = [];
      try {
        const spineCheckDocType = deliverableType || "";
        if (CLASS_A_SPINE_CHECK_DOC_TYPES.has(spineCheckDocType)) {
          const spineCheckState = await getSpineState(supabase, projectId);
          if ((spineCheckState.state === 'locked' || spineCheckState.state === 'locked_amended') && spineCheckState.spine) {
            const spine = spineCheckState.spine;

            // ── L4.7: Parse sections once (hoisted) — used for both context window shift and L4.5 write-time verification ──
            // Fail-closed: stays [] if doc type is unsupported or parse throws.
            let spineCheckSections: import("../../_shared/sectionRepairEngine.ts").SectionBoundary[] = [];
            try {
              if (isSectionRepairSupported(spineCheckDocType)) {
                spineCheckSections = parseSections(version.plaintext, spineCheckDocType);
              }
            } catch (_sectionParseErr) {
              // Non-fatal — L4.5 verification falls back to verified=false for all units
            }

            // ── L4.7: Shift validator context window to first canonical narrative section ──
            // Skips preamble (logline/premise/__preamble) so the model's 3K front window
            // starts inside the narrative acts rather than the document header.
            // If no canonical section is found, falls back to full plaintext (original behavior).
            const SPINE_PREAMBLE_KEYS = new Set(['__preamble', 'logline', 'premise']);
            const firstNarrativeSection = spineCheckSections
              .filter(s => !SPINE_PREAMBLE_KEYS.has(s.section_key))
              .sort((a, b) => a.start_line - b.start_line)[0] ?? null;
            let spineValidatorText = version.plaintext;
            if (firstNarrativeSection && firstNarrativeSection.start_line > 1) {
              const docLines = version.plaintext.split('\n');
              spineValidatorText = docLines.slice(firstNarrativeSection.start_line - 1).join('\n');
              console.log(`[dev-engine-v2] L4.7: context window shifted — section="${firstNarrativeSection.section_key}" start_line=${firstNarrativeSection.start_line} trimmed=${version.plaintext.length - spineValidatorText.length} chars`);
            }

            const hasClassAAxes = !!(spine.story_engine || spine.protagonist_arc);
            const classBUserPrompt = CLASS_B_SPINE_CHECK_AXES.some((ax) => (spine as any)[ax])
              ? buildClassBSpineCheckUserPrompt(spine, spineCheckDocType, spineValidatorText, notesProject?.title, notesProject?.assigned_lane)
              : null;
            const hasClassBAxes = !!classBUserPrompt;

            if (hasClassAAxes || hasClassBAxes) {
              console.log("[dev-engine-v2] Spine checks: parallel Class A+B", { projectId, hasClassAAxes, hasClassBAxes, state: spineCheckState.state });

              // ── Parallel LLM inference ──
              // Class A and Class B check the same document against different axes with different
              // prompts. They are fully independent — no data flows between them during inference.
              const [classAInference, classBInference] = await Promise.allSettled([
                hasClassAAxes
                  ? (async () => {
                      const classAUser = buildClassASpineCheckUserPrompt(spine, spineCheckDocType, spineValidatorText, notesProject?.title, notesProject?.assigned_lane);
                      const raw = await callAI(OPENROUTER_API_KEY, FAST_MODEL, buildClassASpineCheckSystemPrompt(), classAUser, 0.1, 2000);
                      const p = await parseAIJson(OPENROUTER_API_KEY, raw);
                      return parseClassASpineCheckOutput(p);
                    })()
                  : Promise.resolve(null),
                hasClassBAxes
                  ? (async () => {
                      const raw = await callAI(OPENROUTER_API_KEY, FAST_MODEL, buildClassBSpineCheckSystemPrompt(), classBUserPrompt!, 0.1, 2000);
                      const p = await parseAIJson(OPENROUTER_API_KEY, raw);
                      return parseClassBSpineCheckOutput(p);
                    })()
                  : Promise.resolve(null),
              ]);

              if (classAInference.status === 'rejected') {
                console.warn('[dev-engine-v2] Class A spine check inference failed (non-fatal):', (classAInference as PromiseRejectedResult).reason?.message);
              }
              if (classBInference.status === 'rejected') {
                console.warn('[dev-engine-v2] Class B spine check inference failed (non-fatal):', (classBInference as PromiseRejectedResult).reason?.message);
              }

              const classAResult = classAInference.status === 'fulfilled' ? classAInference.value : null;
              const classBResult = classBInference.status === 'fulfilled' ? classBInference.value : null;

              // ── Post-process Class A results (sequential DB writes) ──
              if (classAResult) {
                for (const check of classAResult.checks) {
                  if (check.status === 'contradicted' && check.suggested_note) {
                    const noteKey = `class_a_spine_${check.axis}`;
                    // DB-level dedupe — check development_notes for existing unresolved row
                    try {
                      const { data: existingDbNote } = await supabase
                        .from("development_notes")
                        .select("id")
                        .eq("project_id", projectId)
                        .eq("document_id", documentId)
                        .eq("note_key", noteKey)
                        .eq("resolved", false)
                        .limit(1)
                        .maybeSingle();
                      if (existingDbNote) {
                        console.log("[dev-engine-v2] Class A spine check: skipping duplicate (DB)", { noteKey });
                        continue;
                      }
                    } catch (dedupeErr: any) {
                      console.warn("[dev-engine-v2] Class A dedupe check failed (non-fatal):", dedupeErr?.message);
                    }
                    const spineNote = {
                      project_id: projectId,
                      document_id: documentId,
                      document_version_id: versionId,
                      note_key: noteKey,
                      category: 'spine_drift',
                      severity: 'blocker',
                      description: `${check.suggested_note.title}. ${check.suggested_note.instruction}`,
                      why_it_matters: check.evidence,
                      note_source: 'spine_drift',
                    };
                    classASpineNotes.push(spineNote);
                  }
                }
                if (classASpineNotes.length > 0) {
                  await supabase.from("development_notes").insert(classASpineNotes);
                  console.log("[dev-engine-v2] Class A spine check: inserted notes", { count: classASpineNotes.length });
                  if (!parsed.blocking_issues) parsed.blocking_issues = [];
                  for (const sn of classASpineNotes) {
                    parsed.blocking_issues.push({
                      id: sn.note_key, note_key: sn.note_key, category: sn.category,
                      severity: sn.severity, description: sn.description,
                      why_it_matters: sn.why_it_matters, note_source: sn.note_source,
                      apply_timing: 'now', target_deliverable_type: null,
                    });
                  }
                } else {
                  console.log("[dev-engine-v2] Class A spine check: all axes aligned or unclear");
                }
                parsed.class_a_spine_check = classAResult;
                // ── Atomic Stage 1: Persist Class A narrative_units ──
                try {
                  const classAUnits = classAResult.checks.map((check: any) => {
                    // L4.5: extraction-time verbatim quote verification
                    const vq = check.verbatim_quote || null;
                    let vqVerified = false;
                    let vqSectionKey: string | null = null;
                    let vqLineStart: number | null = null;
                    let vqLineEnd: number | null = null;
                    let vqMatchMethod: 'exact' | 'none' = 'none';
                    if (vq && spineCheckSections.length > 0) {
                      const ps = findVerbatimInSections(spineCheckSections, vq);
                      vqVerified    = ps.verified;
                      vqSectionKey  = ps.section_key;
                      vqLineStart   = ps.line_start;
                      vqLineEnd     = ps.line_end;
                      vqMatchMethod = ps.match_method;
                    }
                    return {
                      project_id: projectId,
                      unit_type: check.axis,
                      unit_key: `${versionId}::${check.axis}`,
                      payload_json: {
                        evidence_excerpt: check.evidence || null,
                        verbatim_quote: vq,
                        verbatim_quote_verified: vqVerified,                // L4.5
                        verbatim_quote_match_section_key: vqSectionKey,     // L4.5
                        verbatim_quote_match_line_start: vqLineStart,       // L4.5
                        verbatim_quote_match_line_end: vqLineEnd,           // L4.5
                        verbatim_quote_match_method: vqMatchMethod,         // L4.5
                        spine_value: (spine as any)[check.axis] || null,
                        contradiction_note: check.status === 'contradicted' && check.suggested_note
                          ? `${check.suggested_note.title}. ${check.suggested_note.instruction}` : null,
                      },
                      source_doc_type: spineCheckDocType,
                      source_doc_version_id: versionId,
                      confidence: check.confidence ?? 50,
                      extraction_method: 'class_a_inference',
                      status: check.status === 'contradicted' ? 'contradicted' : check.status === 'aligned' ? 'aligned' : 'active',
                      stale_reason: null,
                    };
                  });
                  if (classAUnits.length > 0) {
                    const { error: nuErr } = await supabase
                      .from('narrative_units')
                      .upsert(classAUnits, { onConflict: 'project_id,unit_type,unit_key' });
                    if (nuErr) console.warn('[dev-engine-v2] Class A narrative_units upsert failed (non-fatal):', nuErr.message);
                    else console.log('[dev-engine-v2] Class A narrative_units persisted', { count: classAUnits.length });
                  }
                } catch (nuError: any) {
                  console.warn('[dev-engine-v2] Class A narrative_units persistence failed (non-fatal):', nuError?.message);
                }
              } else if (hasClassAAxes) {
                console.warn("[dev-engine-v2] Class A spine check: output parse failed (non-fatal)");
              }

              // ── Post-process Class B results (sequential DB writes) ──
              if (classBResult) {
                for (const check of classBResult.checks) {
                  if (check.status === 'contradicted' && check.suggested_note) {
                    const bNoteKey = `class_b_spine_${check.axis}`;
                    try {
                      const { data: existingBNote } = await supabase
                        .from("development_notes")
                        .select("id")
                        .eq("project_id", projectId)
                        .eq("document_id", documentId)
                        .eq("note_key", bNoteKey)
                        .eq("resolved", false)
                        .limit(1)
                        .maybeSingle();
                      if (existingBNote) {
                        console.log("[dev-engine-v2] Class B spine check: skipping duplicate (DB)", { bNoteKey });
                        continue;
                      }
                    } catch (_bDedupeErr: any) { /* proceed with insert */ }
                    const bNote = {
                      project_id: projectId, document_id: documentId,
                      document_version_id: versionId, note_key: bNoteKey,
                      category: 'spine_drift', severity: 'high',
                      description: `${check.suggested_note.title}. ${check.suggested_note.instruction}`,
                      why_it_matters: check.evidence, note_source: 'spine_alignment',
                    };
                    await supabase.from("development_notes").insert(bNote);
                    console.log("[dev-engine-v2] Class B spine check: inserted note", { bNoteKey });
                    if (!parsed.high_impact_notes) parsed.high_impact_notes = [];
                    parsed.high_impact_notes.push({
                      id: bNoteKey, note_key: bNoteKey, category: 'spine_drift', severity: 'high',
                      description: bNote.description, why_it_matters: check.evidence,
                      note_source: 'spine_alignment', apply_timing: 'now', target_deliverable_type: null,
                    });
                  }
                }
                // Persist Class B narrative_units
                // spineCheckSections already populated above (single parse, shared)
                const classBUnits = classBResult.checks.map((check) => {
                  // L4.5: extraction-time verbatim quote verification (reuses spineCheckSections)
                  const bVq = check.verbatim_quote || null;
                  let bVqVerified = false;
                  let bVqSectionKey: string | null = null;
                  let bVqLineStart: number | null = null;
                  let bVqLineEnd: number | null = null;
                  let bVqMatchMethod: 'exact' | 'none' = 'none';
                  if (bVq && spineCheckSections.length > 0) {
                    const bPs = findVerbatimInSections(spineCheckSections, bVq);
                    bVqVerified    = bPs.verified;
                    bVqSectionKey  = bPs.section_key;
                    bVqLineStart   = bPs.line_start;
                    bVqLineEnd     = bPs.line_end;
                    bVqMatchMethod = bPs.match_method;
                  }
                  return {
                    project_id: projectId,
                    unit_type: check.axis,
                    unit_key: `${versionId}::${check.axis}`,
                    payload_json: {
                      evidence_excerpt: check.evidence || null,
                      verbatim_quote: bVq,
                      verbatim_quote_verified: bVqVerified,                // L4.5
                      verbatim_quote_match_section_key: bVqSectionKey,     // L4.5
                      verbatim_quote_match_line_start: bVqLineStart,       // L4.5
                      verbatim_quote_match_line_end: bVqLineEnd,           // L4.5
                      verbatim_quote_match_method: bVqMatchMethod,         // L4.5
                      spine_value: (spine as any)[check.axis] || null,
                      contradiction_note: check.status === 'contradicted' && check.suggested_note
                        ? `${check.suggested_note.title}. ${check.suggested_note.instruction}` : null,
                    },
                    source_doc_type: spineCheckDocType,
                    source_doc_version_id: versionId,
                    confidence: check.confidence ?? 50,
                    extraction_method: 'class_b_inference',
                    status: check.status === 'contradicted' ? 'contradicted' : check.status === 'aligned' ? 'aligned' : 'active',
                    stale_reason: null,
                  };
                });
                if (classBUnits.length > 0) {
                  const { error: bUnitErr } = await supabase
                    .from('narrative_units')
                    .upsert(classBUnits, { onConflict: 'project_id,unit_type,unit_key' });
                  if (bUnitErr) console.warn('[dev-engine-v2] Class B narrative_units upsert failed (non-fatal):', bUnitErr.message);
                  else console.log('[dev-engine-v2] Class B narrative_units persisted', { count: classBUnits.length });
                }
                parsed.class_b_spine_check = classBResult;
              } else if (hasClassBAxes) {
                console.warn("[dev-engine-v2] Class B spine check: output parse failed (non-fatal)");
              }
            }
          }
        }
      } catch (spineCheckErr: any) {
        console.warn("[dev-engine-v2] Spine checks failed (non-fatal):", spineCheckErr?.message);
        // Fail closed — does not corrupt main notes result
      }

      // FIX 2: Recompute stability_status after Class A notes may have been appended
      {
        const finalBlockerCount = (parsed.blocking_issues || []).length;
        const finalHighCount = (parsed.high_impact_notes || []).length;
        const finalPolishCount = (parsed.polish_notes || []).length;
        parsed.stability_status = finalBlockerCount === 0 && finalHighCount <= 3 && finalPolishCount <= 5
          ? "structurally_stable" : finalBlockerCount === 0 ? "refinement_phase" : "in_progress";
        // Also update resolution_summary blocker count
        if (parsed.resolution_summary) {
          parsed.resolution_summary.blockers_remaining = finalBlockerCount;
        }
      }

      const { data: run, error: runErr } = await supabase.from("development_runs").insert({
        project_id: projectId,
        document_id: documentId,
        version_id: versionId,
        user_id: user.id,
        run_type: "NOTES",
        output_json: parsed,
      }).select().single();
      if (runErr) {
        if (runErr.code === "23503") throw new Error("Version no longer exists — please re-select the document and try again");
        throw runErr;
      }

      return new Response(JSON.stringify({
        success: true,
        projectId,
        documentId,
        documentType: deliverableType,
        versionId,
        status: 'completed',
        operationType: 'notes',
        updatedAt: run?.created_at || new Date().toISOString(),
        run,
        notes: parsed,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════
    // OPTIONS — generate 2-4 decision options per blocker/high-impact note
    // ══════════════════════════════════════════════
    if (action === "options") {
      const { projectId, documentId, versionId, analysisJson, notesJson, deliverableType, developmentBehavior, format: reqFormat } = body;
      if (!projectId || !documentId || !versionId) throw new Error("projectId, documentId, versionId required");

      const { data: version } = await supabase.from("project_document_versions")
        .select("plaintext").eq("id", versionId).single();
      if (!version) throw new Error("Version not found");

      // Fetch latest analysis + notes if not provided
      let analysis = analysisJson;
      if (!analysis) {
        const { data: latestRun } = await supabase.from("development_runs")
          .select("output_json").eq("version_id", versionId).eq("run_type", "ANALYZE")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        analysis = latestRun?.output_json;
      }
      let notes = notesJson;
      if (!notes) {
        const { data: latestNotes } = await supabase.from("development_runs")
          .select("output_json").eq("version_id", versionId).eq("run_type", "NOTES")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        notes = latestNotes?.output_json;
      }

      const blockers = notes?.blocking_issues || analysis?.blocking_issues || [];
      const highImpact = notes?.high_impact_notes || analysis?.high_impact_notes || [];
      const protect = notes?.protect || analysis?.protect || [];

      const optionsSystem = `You are IFFY. For each blocker and high-impact note, generate 2-4 concrete resolution options.

Return ONLY valid JSON:
{
  "decisions": [
    {
      "note_id": "matching stable_key from the note",
      "severity": "blocker" | "high" | "medium" | "low",
      "note": "original note description",
      "options": [
        {
          "option_id": "B1-A",
          "title": "short action title (max 8 words)",
          "what_changes": ["list of 2-4 story elements that change"],
          "tradeoffs": "one sentence on creative cost/benefit",
          "creative_risk": "low" | "med" | "high",
          "commercial_lift": 0-20
        }
      ],
      "recommended_option_id": "option_id of recommended choice"
    }
  ],
  "global_directions": [
    {"id": "G1", "direction": "overarching creative direction", "why": "rationale"}
  ]
}

RULES:
- Every blocker MUST have exactly 2-4 options.
- High-impact notes SHOULD have 2-3 options.
- option_id format: B{n}-{letter} for blockers, H{n}-{letter} for high. Letters A, B, C, D.
- what_changes: list 2-4 specific story elements affected.
- tradeoffs: honest one-sentence assessment of creative cost/benefit.
- creative_risk: "low", "med", or "high" — how much creative DNA changes.
- commercial_lift: integer 0-20 estimating GP improvement. (This is an estimate — actual lift may differ. Verify after application.)
- pressure_tradeoff (OPTIONAL): {"gains": ["clarity"|"propulsion"|"atmosphere"|"structural"|"emotional"|"commercial"], "risks": [...]} — which narrative pressure dimension this option improves and which it may compress. Include only for dimensional tradeoffs, not trivial fixes.
- recommended_option_id: best balance of creative integrity and commercial viability.
- global_directions: 1-3 overarching tonal/strategic directions.
- Keep options genuinely distinct — not minor variations of the same fix.
- EVERY blocker in the input MUST appear as a decision with severity="blocker".
|- NEVER generate decisions about document destination, routing, or storage. Do NOT ask "Which document should receive..." — export/packaging flows produce artifacts, they don't overwrite source documents.
|- NEVER offer options like "Create new Pitch Deck" or "Store in Concept Brief" — these are document-routing questions that don't belong in creative decisions.
|- FALSE POSITIVE FILTER: If a blocker's description or why_it_matters mentions "Act 2a", "Act 2b", "2a/2b", "act structure confusion", or "too many acts" in the context of a feature film treatment — SKIP this blocker entirely. Do NOT generate decisions for it. Act 2 bisection into Act 2a and Act 2b is a valid and common convention in feature film treatments. These are false positives, not real blockers.`;

      const notesForPrompt = [
        ...blockers.map((n: any, i: number) => ({ index: i + 1, id: n.id, severity: "blocker", description: n.description, why_it_matters: n.why_it_matters })),
        ...highImpact.map((n: any, i: number) => ({ index: blockers.length + i + 1, id: n.id, severity: "high", description: n.description, why_it_matters: n.why_it_matters })),
      ];

      const userPrompt = `PROTECT ITEMS:\n${JSON.stringify(protect)}

ANALYSIS SUMMARY:\n${analysis?.executive_snapshot || analysis?.verdict || "No analysis available"}

NOTES REQUIRING DECISIONS:\n${JSON.stringify(notesForPrompt)}

MATERIAL:\n${version.plaintext}`;

      const raw = await callAI(OPENROUTER_API_KEY, BALANCED_MODEL, optionsSystem, userPrompt, 0.3, 12000).catch((err: any) => {
        console.error("[dev-engine-v2] options: callAI failed:", err?.message);
        throw new Error(`AI call failed: ${err?.message || "Unknown AI error"}`);
      });
      const parsed = await parseAIJson(OPENROUTER_API_KEY, raw).catch((err: any) => {
        console.error("[dev-engine-v2] options: parseAIJson failed:", err?.message, "raw:", raw?.slice(0, 300));
        throw new Error(`Failed to parse AI response: ${err?.message || "Parse error"}`);
      });
      if (!parsed) {
        console.warn("[dev-engine-v2] options: parseAIJson returned null — falling back to inline note decisions", raw?.slice(0, 300));
        // Graceful fallback: build decisions from inline note decisions
        const inlineDecisions: any[] = [];
        for (const n of [...blockers, ...highImpact]) {
          if (n.decisions?.length > 0) {
            inlineDecisions.push({
              note_id: n.stable_key || n.id || n.note_key,
              severity: n.severity || (blockers.includes(n) ? "blocker" : "high"),
              note: n.description || n.note,
              options: n.decisions.map((d: any, i: number) => ({
                option_id: d.option_id || `${n.stable_key || n.id}-${String.fromCharCode(65 + i)}`,
                title: d.title || d.description || `Option ${i + 1}`,
                what_changes: Array.isArray(d.what_changes) ? d.what_changes : (d.text ? [d.text] : []),
                tradeoffs: d.tradeoffs || "",
                creative_risk: d.creative_risk || "med",
                commercial_lift: typeof d.commercial_lift === "number" ? d.commercial_lift : 0,
              })),
              recommended_option_id: n.recommended_option_id || n.recommended,
            });
          }
        }
        if (inlineDecisions.length > 0) {
          const fallbackResponse = {
            decisions: inlineDecisions,
            global_directions: notes?.global_directions || [],
          };
          // Store as OPTIONS run
          const { data: fallbackRun, error: fallbackErr } = await supabase.from("development_runs").insert({
            project_id: projectId,
            document_id: documentId,
