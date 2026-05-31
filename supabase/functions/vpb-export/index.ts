// @ts-nocheck
/**
 * vpb-export — VPB Export Engine.
 *
 * Deterministic markdown export from the assembled VPB JSON.
 * No LLM. No prose generation. Pure structured template rendering.
 *
 * POST /vpb-export
 * Body: { projectId: string, format: "markdown" }
 *
 * Returns: { projectId, format, markdown, versionNumber }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Markdown Rendering ──────────────────────────────────────────────

function mdHeading(level: number, text: string): string {
  return `${"#".repeat(level)} ${text}\n\n`;
}

function mdTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(" | ")} |\n`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |\n`;
  const body = rows.map(r => `| ${r.join(" | ")} |`).join("\n");
  return header + separator + body + "\n\n";
}

function mdBullet(items: string[]): string {
  return items.map(i => `- ${i}`).join("\n") + "\n\n";
}

function renderProjectOverview(section: any): string {
  if (!section) return "";
  let md = mdHeading(2, "Project Overview");
  md += `**Title:** ${section.title || "Untitled"}\n\n`;
  md += `**Format:** ${section.format || "N/A"}\n\n`;
  if (section.genres?.length) md += `**Genres:** ${section.genres.join(", ")}\n\n`;
  if (section.logline) md += `**Logline:** ${section.logline}\n\n`;
  if (section.premise) md += `**Premise:** ${section.premise}\n\n`;
  if (section.budgetRange) md += `**Budget:** ${section.budgetRange}\n\n`;
  if (section.tone) md += `**Tone:** ${section.tone}\n\n`;
  if (section.prestigeStyle) md += `**Prestige Style:** ${section.prestigeStyle}\n\n`;
  if (section.targetAudience) md += `**Target Audience:** ${section.targetAudience}\n\n`;
  return md;
}

function renderCharacters(characters: any[]): string {
  if (!characters?.length) return "";
  let md = mdHeading(2, `Characters (${characters.length})`);
  md += mdTable(
    ["Name", "Scenes", "Actor", "DNA"],
    characters.map(c => [
      c.name || "?",
      String(c.sceneCount || 0),
      c.actorName || "—",
      c.visualDna ? "✓" : "—",
    ])
  );
  return md;
}

function renderCast(cast: any[]): string {
  if (!cast?.length) return "";
  let md = mdHeading(2, `Cast (${cast.length})`);
  md += mdTable(
    ["Character", "Actor", "Status"],
    cast.map(c => [
      c.characterName || "?",
      c.actorName || "Uncast",
      c.bindingStatus || "—",
    ])
  );
  return md;
}

function renderLocations(locations: any[]): string {
  if (!locations?.length) return "";
  let md = mdHeading(2, `Locations (${locations.length})`);
  md += mdTable(
    ["Location", "Scenes", "Production Design"],
    locations.map(l => [
      l.name || "?",
      String(l.sceneCount || 0),
      l.pdDesign ? "✓" : "—",
    ])
  );
  return md;
}

function renderScenes(scenes: any[]): string {
  if (!scenes?.length) return "";
  let md = mdHeading(2, `Scene Breakdown (${scenes.length})`);
  for (const s of scenes) {
    md += `- **#${s.sceneNumber}** — ${s.slugline || "Untitled"}`;
    if (s.locationKey) md += ` [${s.locationKey}]`;
    if (s.characters?.length > 0) md += ` — ${s.characters.join(", ")}`;
    md += "\n";
  }
  md += "\n";
  return md;
}

function renderHeroFrames(heroFrames: any[]): string {
  if (!heroFrames?.length) return "";
  let md = mdHeading(2, `Hero Frames (${heroFrames.length})`);
  for (const hf of heroFrames) {
    md += `- **${hf.entityId || "Unnamed"}**`;
    if (hf.isPrimary) md += ` (Primary)`;
    if (hf.isActive) md += ` (Active)`;
    if (hf.imageUrl) md += ` — ${hf.imageUrl}`;
    md += "\n";
  }
  md += "\n";
  return md;
}

function renderPosters(posters: any[]): string {
  if (!posters?.length) return "";
  let md = mdHeading(2, `Posters (${posters.length})`);
  for (const p of posters) {
    md += `- **v${p.versionNumber}** — ${p.status || "unknown"}`;
    if (p.isActive) md += ` (Active)`;
    if (p.renderedUrl) md += ` — ${p.renderedUrl}`;
    md += "\n";
  }
  md += "\n";
  return md;
}

function renderProductionDesign(pd: any): string {
  if (!pd) return "";
  let md = mdHeading(2, "Production Design");
  for (const [key, items] of Object.entries(pd)) {
    const arr = items as any[];
    md += mdHeading(3, `${key.replace(/([A-Z])/g, " $1").trim()} (${arr.length})`);
    if (arr.length > 0) {
      for (const item of arr) {
        md += `- ${item.display_name || item.name || item.location_key || JSON.stringify(item).substring(0, 100)}\n`;
      }
      md += "\n";
    } else {
      md += "None yet\n\n";
    }
  }
  return md;
}

function renderGovernance(gov: any): string {
  if (!gov) return "";
  let md = mdHeading(2, "Governance");
  md += `**Overall Status:** ${gov.overallStatus || "unknown"}\n\n`;
  md += `**Blockers:** ${gov.blockerCount || 0}\n\n`;
  if (gov.lastEvaluatedAt) md += `**Last Evaluated:** ${gov.lastEvaluatedAt}\n\n`;
  if (gov.stages) {
    md += mdTable(
      ["Stage", "Status", "Stale Risk"],
      Object.entries(gov.stages).map(([name, stage]: [string, any]) => [
        name.replace(/_/g, " "),
        stage.status || "—",
        stage.staleRisk || "—",
      ])
    );
  }
  return md;
}

function renderAssetInventory(inv: any): string {
  if (!inv) return "";
  let md = mdHeading(2, "Asset Inventory");
  md += mdTable(
    ["Category", "Count"],
    Object.entries(inv)
      .filter(([k]) => !k.startsWith("_"))
      .map(([k, v]: [string, any]) => [
        k.replace(/([A-Z])/g, " $1").trim(),
        String(v),
      ])
  );
  return md;
}

function renderVisualLanguage(vl: any): string {
  if (!vl) return "## Visual Language\n\nNot yet defined\n\n";
  let md = mdHeading(2, "Visual Language");
  md += "```json\n" + JSON.stringify(vl, null, 2).substring(0, 2000) + "\n```\n\n";
  return md;
}

function renderVisualStyle(vs: any): string {
  if (!vs) return "## Visual Style\n\nNot yet defined\n\n";
  let md = mdHeading(2, "Visual Style");
  md += "```json\n" + JSON.stringify(vs, null, 2).substring(0, 2000) + "\n```\n\n";
  return md;
}

function renderWardrobe(wardrobe: any[]): string {
  if (!wardrobe?.length) return "";
  let md = mdHeading(2, `Wardrobe (${wardrobe.length})`);
  for (const w of wardrobe) {
    md += `- **${w.character_name || w.character_key || "?"}**`;
    if (w.active_states?.length) md += ` — ${w.active_states.join(", ")}`;
    md += "\n";
  }
  md += "\n";
  return md;
}

function renderLookbook(sections: any[]): string {
  if (!sections?.length) return "";
  let md = mdHeading(2, `Lookbook Sections (${sections.length})`);
  md += mdTable(
    ["Section", "Images", "Status"],
    sections.map(s => [
      s.label || s.sectionKey || "?",
      String(s.imageCount || 0),
      s.status || "—",
    ])
  );
  return md;
}

// ── Main Export Handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { projectId, format } = body;
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Load latest VPB version
    const { data: versions, error: verErr } = await sb
      .from("vpb_versions")
      .select("*")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);

    if (verErr) throw new Error(`Failed to load VPB: ${verErr.message}`);
    if (!versions || versions.length === 0) {
      return new Response(JSON.stringify({ error: "No VPB version found for this project. Run vpb-assembly-engine first." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latest = versions[0];
    const vpb = latest.vpb_json;
    const sections = vpb.sections || {};
    const meta = vpb.metadata || {};
    const prov = vpb.provenance || {};

    // ── Build Markdown ──
    let md = "";

    // Title
    md += `# Visual Production Bible\n\n`;
    md += `**Project:** ${meta.projectTitle || "Untitled"}\n\n`;
    md += `**Version:** ${latest.version_number}\n\n`;
    md += `**Generated:** ${new Date(latest.created_at || meta.generatedAt).toISOString()}\n\n`;
    md += `**Format:** ${meta.projectFormat || "N/A"}\n\n`;
    md += `**Sections:** ${latest.section_count || 0}\n\n`;
    md += `**Assets:** ${latest.asset_count || 0}\n\n`;
    md += `**Assembly Time:** ${latest.assembly_duration_ms || prov.assemblyDurationMs || "N/A"}ms\n\n`;
    md += `---\n\n`;

    // Render all sections
    md += renderProjectOverview(sections.projectOverview);
    md += renderVisualLanguage(sections.visualLanguage);
    md += renderVisualStyle(sections.visualStyle);
    md += renderProductionDesign(sections.productionDesign);
    md += renderCharacters(sections.characters);
    md += renderCast(sections.cast);
    md += renderLocations(sections.locations);
    md += renderWardrobe(sections.wardrobe);
    md += renderHeroFrames(sections.heroFrames);
    md += renderPosters(sections.posters);
    md += renderLookbook(sections.lookbookSections);
    md += renderScenes(sections.sceneBreakdown);
    md += renderGovernance(sections.governance);
    md += renderAssetInventory(sections.assetInventory);

    // Provenance
    md += `---\n\n`;
    md += `## Provenance\n\n`;
    md += `- **Engine:** ${prov.generatedBy || "vpb-assembly-engine"}\n`;
    md += `- **Assembled:** ${prov.assemblyTimestamp || "N/A"}\n`;
    md += `- **Duration:** ${prov.assemblyDurationMs || "N/A"}ms\n`;
    if (prov.sources?.length) {
      md += `- **Data Sources:**\n`;
      for (const s of prov.sources) {
        md += `  - ${s}\n`;
      }
    }
    md += `\n---\n\n`;
    md += `*Generated by IFFY Visual Production Bible — vpb-assembly-engine*\n`;

    return new Response(JSON.stringify({
      projectId,
      format: format || "markdown",
      versionNumber: latest.version_number,
      markdown: md,
      sectionCount: latest.section_count,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[vpb-export] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
