const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const srk = env.split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY")).split("=")[1].trim().replace(/"/g, "");
const sb = createClient("https://hdfderbphdobomkdjypc.supabase.co", srk);

const PID = "8a62605d-a239-438d-9b31-7c83429cb17c";

async function main() {
  // Check narrative_entities
  const { data: entities } = await sb.from("narrative_entities").select("id, entity_name, entity_type").eq("project_id", PID).limit(10);
  console.log("narrative_entities:", entities?.length || 0);
  if (entities?.length) entities.forEach(e => console.log("  " + e.entity_type + ": " + e.entity_name));
  
  // Check project_canon
  const { data: canon } = await sb.from("project_canon").select("canon_json").eq("project_id", PID).maybeSingle();
  console.log("\nproject_canon:", !!canon?.canon_json);
  
  // Check character_visual_dna
  const { data: dna } = await sb.from("character_visual_dna").select("character_name").eq("project_id", PID).limit(10);
  console.log("\ncharacter_visual_dna:", dna?.length || 0);
  if (dna?.length) dna.forEach(d => console.log("  " + d.character_name));
  
  // Check canon_locations
  const { data: locs } = await sb.from("canon_locations").select("name").eq("project_id", PID).limit(10);
  console.log("\ncanon_locations:", locs?.length || 0);
  if (locs?.length) locs.forEach(l => console.log("  " + l.name));
}
main();
