const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const srk = env.split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY")).split("=")[1].trim().replace(/"/g, "");
const SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co";
const sb = createClient(SUPABASE_URL, srk);

async function main() {
  const pid = "8a62605d-a239-438d-9b31-7c83429cb17c";
  
  // Get production draft plaintext
  const { data: pdDoc } = await sb.from("project_documents").select("id").eq("project_id", pid).eq("doc_type", "production_draft").single();
  const { data: pdVer } = await sb.from("project_document_versions")
    .select("id, plaintext")
    .eq("document_id", pdDoc.id)
    .eq("is_current", true)
    .single();
  
  if (!pdVer?.plaintext || pdVer.plaintext.length < 100) {
    console.log("No PD text available");
    return;
  }
  
  console.log("PD text:", pdVer.plaintext.length, "chars");
  
  // Try story ingestion with inline text
  console.log("\nCalling story ingestion with inline text...");
  const resp = await fetch(SUPABASE_URL + "/functions/v1/story-ingestion-engine", {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": "Bearer " + srk, "apikey": srk},
    body: JSON.stringify({
      projectId: pid,
      action: "ingest",
      text: pdVer.plaintext
    }),
    signal: AbortSignal.timeout(300_000)
  });
  const t = await resp.text();
  console.log("Status:", resp.status);
  console.log("Response:", t.substring(0, 500));
}
main();