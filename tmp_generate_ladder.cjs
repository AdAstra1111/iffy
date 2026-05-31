const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const srk = env.split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY")).split("=")[1].trim().replace(/"/g, "");
const sb = createClient("https://hdfderbphdobomkdjypc.supabase.co", srk);
const SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co";

const PROJECTS = [
  { id: "8a62605d-a239-438d-9b31-7c83429cb17c", title: "Ghost Frequency" },
  { id: "30322177-3d0e-46c0-9b0e-a00b69df45c5", title: "The Last Bookshop" }
];

const LADDER = [
  "idea", "concept_brief", "treatment", "character_bible",
  "story_outline", "beat_sheet", "feature_script"
];

async function callGenerate(projectId, docType, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(SUPABASE_URL + "/functions/v1/generate-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + srk,
          "apikey": srk
        },
        body: JSON.stringify({
          projectId, docType, mode: "draft"
        }),
        // Timeout after 300s
        signal: AbortSignal.timeout(300_000)
      });
      const text = await resp.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      
      if (resp.ok && parsed?.success) {
        return { status: "ok", docId: parsed.document_id, versionId: parsed.version_id, version: parsed.version_number };
      }
      
      // If it fails with an error that suggests we should retry, do so
      const errMsg = parsed?.error || text.substring(0, 200);
      if (attempt < retries - 1 && (errMsg.includes("timeout") || errMsg.includes("TIMEOUT") || errMsg.includes("IDLE_TIMEOUT"))) {
        console.log(`  Retry ${attempt + 1}/${retries} for ${docType}: ${errMsg.substring(0, 80)}`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      
      return { status: "error", error: errMsg };
    } catch (e) {
      if (attempt < retries - 1) {
        console.log(`  Retry ${attempt + 1}/${retries} for ${docType}: ${e.message.substring(0, 80)}`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      return { status: "error", error: e.message };
    }
  }
}

async function main() {
  for (const project of PROJECTS) {
    console.log(`\n=== ${project.title} ===`);
    
    // First generate idea if not already done
    for (const docType of LADDER) {
      console.log(`\nGenerating ${docType}...`);
      const result = await callGenerate(project.id, docType);
      
      if (result.status === "ok") {
        console.log(`  ✅ ${docType} v${result.version} (${result.versionId?.slice(0,12)})`);
      } else {
        console.log(`  ❌ ${docType}: ${result.error}`);
        console.log(`  Skipping remaining docs for ${project.title}`);
        break;
      }
    }
  }
  
  console.log("\n=== DONE ===");
}
main();
