const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const srk = env.split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY")).split("=")[1].trim().replace(/"/g, "");
const sb = createClient("https://hdfderbphdobomkdjypc.supabase.co", srk);

async function main() {
  const { data: existing } = await sb.from("projects").select("id, user_id").limit(1);
  if (!existing?.length) { console.log("No existing projects"); return; }
  const userId = existing[0].user_id;
  console.log("User ID:", userId);

  // Project 1: GHOST FREQUENCY
  const { data: p1, error: e1 } = await sb.from("projects").insert({
    user_id: userId, title: "Ghost Frequency", format: "film",
    genres: ["Sci-Fi", "Thriller", "Drama"],
    assigned_lane: "independent-film", budget_range: "30000000",
    tone: "Atmospheric, Emotional, Suspenseful",
    target_audience: "Adults 25-54, Sci-fi enthusiasts",
    comparable_titles: "Arrival, Interstellar, Source Code",
    guardrails_config: {
      story_setup: {
        logline: "A radio astronomer discovers a signal from a parallel universe where her deceased husband is still alive — but contacting him threatens to collapse both realities.",
        stakes: "She must choose between holding onto a ghost and saving two universes from annihilation."
      }
    },
    development_behavior: "market",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select().single();
  if (e1) { console.log("P1 error:", e1.message); return; }
  console.log("P1 ok:", p1.id, p1.title);

  // Canon
  await sb.from("project_canon").insert({
    project_id: p1.id,
    canon_json: {
      characters: [
        { name: "Dr. Elena Vasquez", role: "Protagonist", goals: "Prove the signal is real without losing her sanity or her career." },
        { name: "Dr. Marcus Webb", role: "Supporting", goals: "Protect Elena from herself while managing the observatory." },
        { name: "Agent Sarah Chen", role: "Supporting", goals: "Classify the signal before it creates a public panic." },
        { name: "Alt-Elena", role: "Antagonist", goals: "Protect her universe from contamination at any cost." },
        { name: "Dr. James Vasquez", role: "Other", goals: "Bridge the gap — the husband in the parallel universe." }
      ],
      locations: [
        { name: "Arecibo-Style Observatory", description: "A massive radio telescope facility in Puerto Rico" },
        { name: "Elena's Home", description: "A modest house overlooking the ocean" },
        { name: "Secure Government Facility", description: "An underground NSA data analysis center" },
        { name: "The Interstitial Space", description: "A visual representation of the quantum bridge between universes" }
      ],
      logline: "A radio astronomer discovers a signal from a parallel universe where her deceased husband is still alive — but contacting him threatens to collapse both realities.",
      premise: "What if grief could literally tear apart the fabric of reality?",
      theme: "Letting go vs. holding on",
      tone_style: "Atmospheric, emotional, with moments of cosmic horror"
    }
  });
  console.log("Canon ok");

  // Seed docs
  for (const dt of ["project_overview", "market_sheet", "format_rules"]) {
    await sb.from("project_documents").insert({
      project_id: p1.id, user_id: userId, doc_type: dt,
      title: dt === "project_overview" ? "Project Overview (Seed)" : dt === "market_sheet" ? "Market Sheet" : "Format Rules",
      source: "seed_pack", file_name: dt, file_path: "", extraction_status: "complete",
      plaintext: "", extracted_text: ""
    }).select().single();
    console.log("  Doc:", dt);
  }

  // Project 2: THE LAST BOOKSHOP
  const { data: p2, error: e2 } = await sb.from("projects").insert({
    user_id: userId, title: "The Last Bookshop", format: "film",
    genres: ["Romance", "Comedy", "Drama"],
    assigned_lane: "independent-film", budget_range: "15000000",
    tone: "Warm, Nostalgic, Witty",
    target_audience: "Adults 18-49, Romance fans",
    comparable_titles: "Notting Hill, You've Got Mail, The Holiday",
    guardrails_config: {
      story_setup: {
        logline: "A cynical American publisher and a hopelessly romantic British bookseller must save London's last independent bookshop from a corporate developer — and discover they're writing their own love story in the process.",
        stakes: "If they can't raise enough money in 30 days, the bookshop becomes another chain store."
      }
    },
    development_behavior: "market",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select().single();
  if (e2) { console.log("P2 error:", e2.message); return; }
  console.log("\nP2 ok:", p2.id, p2.title);

  await sb.from("project_canon").insert({
    project_id: p2.id,
    canon_json: {
      characters: [
        { name: "Claire Morrison", role: "Protagonist", goals: "Sell the bookshop development deal and return to New York a success." },
        { name: "Henry Whitmore", role: "Protagonist", goals: "Save his family's bookshop from corporate developers." },
        { name: "Mrs. Whitmore", role: "Supporting", goals: "Pass the torch to Henry while preserving the shop's soul." },
        { name: "Trevor Ashford", role: "Antagonist", goals: "Acquire the bookshop for his luxury development portfolio." }
      ],
      locations: [
        { name: "Whitmore & Sons Bookshop", description: "A charming three-story independent bookshop in Bloomsbury, London" },
        { name: "Claire's Hotel", description: "A boutique hotel in Covent Garden" },
        { name: "The Reading Room Cafe", description: "A cozy cafe attached to the bookshop" },
        { name: "Corporate London Office", description: "Trevor Ashford's sleek modern office" }
      ],
      logline: "A cynical American publisher and a hopelessly romantic British bookseller must save London's last independent bookshop from a corporate developer — and discover they're writing their own love story in the process.",
      premise: "What if saving a bookshop meant finding the story you were meant to live?",
      theme: "Finding home in unexpected places",
      tone_style: "Warm, witty, nostalgic with genuine emotional stakes"
    }
  });
  console.log("Canon ok");

  for (const dt of ["project_overview", "market_sheet", "format_rules"]) {
    await sb.from("project_documents").insert({
      project_id: p2.id, user_id: userId, doc_type: dt,
      title: dt === "project_overview" ? "Project Overview (Seed)" : dt === "market_sheet" ? "Market Sheet" : "Format Rules",
      source: "seed_pack", file_name: dt, file_path: "", extraction_status: "complete",
      plaintext: "", extracted_text: ""
    }).select().single();
    console.log("  Doc:", dt);
  }

  console.log("\n=== Both projects created ===");
  console.log("Ghost Frequency:", p1.id);
  console.log("The Last Bookshop:", p2.id);
}
main();
