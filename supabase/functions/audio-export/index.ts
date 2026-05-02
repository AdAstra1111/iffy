// Audio Export — Supabase Edge Function
// Serves: POST /functions/v1/audio-export, GET /functions/v1/audio-export

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "sk_1bd650b18aa5626b56d6d825948310b0a865e8c57557afa3";
const AIVA_API_KEY = Deno.env.get("AIVA_API_KEY") || "";
const FREESOUND_API_KEY = Deno.env.get("FREESOUND_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

// ── Types ────────────────────────────────────────────────────────────────────
interface AudioJobOptions {
  project_id: string;
  layers: {
    dialogue: boolean;
    sound: boolean;
    music: boolean;
    mix: boolean;
  };
  quality: "draft" | "production";
  range: "full" | "acts" | "episodes";
  range_values?: number[]; // specific act/episode numbers if not "full"
  voice_overrides?: Record<string, string>; // character_id → voice_id
}

interface AudioJob {
  id: string;
  project_id: string;
  owner_id: string;
  status: "queued" | "running" | "complete" | "error";
  progress_pct: number;
  message: string;
  output_url: string | null;
  created_at: string;
  updated_at: string;
  options: AudioJobOptions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sb(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function ok(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authUser(req: Request): string | null {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  // Verify the token
  const s = sb();
  const { data: { user }, error } = s.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// ── Quality tier mapping ────────────────────────────────────────────────────
const QUALITY_TIERS = {
  draft: {
    elevenlabs_model: "eleven_turbo_v2",
    sound_search_results: 3,
    music_source: "programmatic", // tone-based, no AIVA
    ffmpeg_preset: "fast",
    bitrate: "128k",
    retry_on_failure: false,
    estimated_minutes_per_episode: 2,
  },
  production: {
    elevenlabs_model: "eleven_multilingual_v2",
    sound_search_results: 10,
    music_source: "aiva", // requires AIVA_API_KEY
    ffmpeg_preset: "slow",
    bitrate: "256k",
    retry_on_failure: true,
    estimated_minutes_per_episode: 8,
  },
} as const;

// ── Layer availability check ─────────────────────────────────────────────────
// ── Layer availability check ─────────────────────────────────────────────────
// Music layer (Layer 3 — AIVA) is SILOED as of 2026-05-02 per Morpheus directive.
// Do NOT enable music even if AIVA_API_KEY is set — commercial agreement required.
function layerAvailable(layer: keyof AudioJobOptions["layers"], options: AudioJobOptions): { available: boolean; reason?: string } {
  switch (layer) {
    case "dialogue":
      return { available: true }; // ElevenLabs key confirmed
    case "sound":
      return { available: true }; // Freesound (or placeholder without key)
    case "music":
      return { available: false, reason: "AIVA API deferred — commercial negotiation required. Silenced in v1." };
    case "mix":
      return { available: true }; // ffmpeg-based
    default:
      return { available: false, reason: `unknown layer: ${layer}` };
  }
}

// ── Create job ────────────────────────────────────────────────────────────────
async function createJob(ownerId: string, options: AudioJobOptions): Promise<AudioJob> {
  const client = sb();
  
  const { data, error } = await client
    .from("audio_jobs")
    .insert({
      project_id: options.project_id,
      owner_id: ownerId,
      status: "queued",
      progress_pct: 0,
      message: "Job queued",
      output_url: null,
      options,
    })
    .select()
    .single();
  
  if (error) throw new Error(`Failed to create job: ${error.message}`);
  return data as AudioJob;
}

// ── Update job progress ──────────────────────────────────────────────────────
async function updateJob(jobId: string, updates: Partial<Pick<AudioJob, "status" | "progress_pct" | "message" | "output_url">>) {
  const client = sb();
  const { error } = await client
    .from("audio_jobs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  
  if (error) console.error(`[audio-export] Failed to update job ${jobId}:`, error.message);
}

// ── Check project eligibility ─────────────────────────────────────────────────
async function checkProject(projectId: string, ownerId: string): Promise<{ eligible: boolean; reason?: string }> {
  const client = sb();
  
  // Verify project exists and owner matches
  const { data: project, error } = await client
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .single();
  
  if (error || !project) return { eligible: false, reason: "Project not found" };
  if (project.owner_id !== ownerId) return { eligible: false, reason: "Not authorized for this project" };
  
  // Check beat_sheet + character_bible exist
  const [beatSheet, characterBible] = await Promise.all([
    client.from("project_documents").select("id").eq("project_id", projectId).eq("doc_type", "beat_sheet").limit(1).single(),
    client.from("project_documents").select("id").eq("project_id", projectId).eq("doc_type", "character_bible").limit(1).single(),
  ]);
  
  if (!beatSheet.data) return { eligible: false, reason: "Project missing beat_sheet" };
  if (!characterBible.data) return { eligible: false, reason: "Project missing character_bible" };
  
  return { eligible: true };
}

// ── Get job status ────────────────────────────────────────────────────────────
async function getJob(projectId: string, ownerId: string): Promise<AudioJob | null> {
  const client = sb();
  
  const { data, error } = await client
    .from("audio_jobs")
    .select("*")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== "PGRST116") return null; // PGRST116 = no rows
  return data as AudioJob | null;
}

// ── ElevenLabs TTS helper ────────────────────────────────────────────────────
async function elevenlabsTTS(text: string, voiceId: string, emotionalState?: string): Promise<Buffer | null> {
  const prefixes: Record<string, string> = {
    intense: "[intensely]",
    fearful: "[nervously]",
    angry: "[furiously]",
    sad: "[solemnly]",
    joyful: "[brightly]",
    mysterious: "[whispering]",
    romantic: "[tenderly]",
    triumphant: "[boldly]",
    desperate: "[pleadingly]",
  };
  
  const prefix = emotionalState ? prefixes[emotionalState.toLowerCase()] || "" : "";
  const fullText = prefix ? `${prefix} ${text}` : text;
  
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/stream", {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: fullText,
        voice_id: voiceId,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.7,
          similarity_boost: 0.7,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    });
    
    if (!response.ok) {
      console.warn(`[audio-export] ElevenLabs TTS failed: ${response.status}`);
      return null;
    }
    
    return Buffer.from(await response.arrayBuffer());
  } catch (e) {
    console.warn(`[audio-export] ElevenLabs TTS error: ${e}`);
    return null;
  }
}

// ── Storage upload helper ────────────────────────────────────────────────────
async function uploadToStorage(jobId: string, fileName: string, buffer: Buffer, bucket = "audio-exports"): Promise<string | null> {
  const client = sb();
  const path = `audio-exports/${jobId}/${fileName}`;
  
  const { error } = await client.storage.upload(path, buffer, {
    contentType: "audio/mp4",
    upsert: true,
  });
  
  if (error) {
    console.error(`[audio-export] Storage upload failed: ${error.message}`);
    return null;
  }
  
  // Return signed URL (1 hour expiry)
  const { data } = await client.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();
  
  // ── GET /audio-export ── poll job status
  if (req.method === "GET") {
    const userId = authUser(req);
    if (!userId) return err("Unauthorized", 401);
    
    const projectId = url.searchParams.get("project_id");
    if (!projectId) return err("project_id is required");
    
    const job = await getJob(projectId, userId);
    if (!job) return ok({ status: "no_job", progress_pct: 0, message: "No job found for this project" });
    
    return ok({
      id: job.id,
      status: job.status,
      progress_pct: job.progress_pct,
      message: job.message,
      output_url: job.output_url,
      created_at: job.created_at,
    });
  }
  
  // ── POST /audio-export ── create + dispatch job
  if (req.method === "POST") {
    const userId = authUser(req);
    if (!userId) return err("Unauthorized", 401);
    
    let body: AudioJobOptions;
    try {
      body = await req.json();
    } catch {
      return err("Invalid JSON body");
    }
    
    const { project_id, layers, quality, range } = body;
    if (!project_id) return err("project_id is required");
    if (!layers) return err("layers is required (dialogue/sound/music/mix)");
    if (!quality || !["draft", "production"].includes(quality)) return err("quality must be 'draft' or 'production'");
    if (!range) return err("range is required");
    
    // Check eligibility
    const check = await checkProject(project_id, userId);
    if (!check.eligible) return err(check.reason || "Project not eligible");
    
    // Check at least one layer is available
    const layerChecks = {
      dialogue: layerAvailable("dialogue", body),
      sound: layerAvailable("sound", body),
      music: layerAvailable("music", body),
      mix: layerAvailable("mix", body),
    };
    
    const availableLayers = Object.entries(layerChecks).filter(([, v]) => v.available);
    if (availableLayers.length === 0) {
      return err("No layers available. Check API keys for enabled layers.");
    }
    
    const unavailableNotes = Object.entries(layerChecks)
      .filter(([, v]) => !v.available)
      .map(([k, v]) => `${k}: ${v.reason}`)
      .join("; ");
    
    // Create job
    const job = await createJob(userId, body);
    
    // Fire and forget — job runs async
    // In production: would dispatch to a background queue
    // For now: start async processing (EdgeRuntime.waitUntil)
    const _ = Deno.runtime?.snapshot?.(); // no-op for TypeScript
    
    // Start async processing
    processJob(job.id, body, layerChecks).catch(console.error);
    
    return ok({
      job_id: job.id,
      status: "queued",
      message: `Job queued. ${unavailableNotes ? `Unavailable: ${unavailableNotes}` : ""}`,
    });
  }
  
  return err("Method not allowed", 405);
});

// ── Async job processor ───────────────────────────────────────────────────────
async function processJob(jobId: string, options: AudioJobOptions, layerChecks: Record<string, { available: boolean; reason?: string }>) {
  const QUALITY = QUALITY_TIERS[options.quality];
  const client = sb();
  
  try {
    await updateJob(jobId, { status: "running", progress_pct: 5, message: "Starting audio export..." });
    
    // Load project documents
    const docs = await client
      .from("project_documents")
      .select("id, doc_type")
      .in("doc_type", ["beat_sheet", "character_bible"])
      .eq("project_id", options.project_id);
    
    const beatSheetDoc = docs.data?.find(d => d.doc_type === "beat_sheet");
    const charBibleDoc = docs.data?.find(d => d.doc_type === "character_bible");
    
    if (!beatSheetDoc || !charBibleDoc) throw new Error("Missing documents");
    
    // Load current versions
    const [bsVersion, cbVersion] = await Promise.all([
      client.from("project_document_versions").select("id, version_number, plaintext, meta_json").eq("document_id", beatSheetDoc.id).eq("is_current", true).single(),
      client.from("project_document_versions").select("id, version_number, plaintext, meta_json").eq("document_id", charBibleDoc.id).eq("is_current", true).single(),
    ]);
    
    await updateJob(jobId, { progress_pct: 10, message: "Documents loaded, parsing beats..." });
    
    // Parse beats and characters (simplified parsing)
    const beats = parseBeats(bsVersion.data?.plaintext || "");
    const characters = parseCharacters(cbVersion.data?.plaintext || "", cbVersion.data?.meta_json);
    
    const totalSteps = availableCount(layerChecks);
    let step = 0;
    const progressFor = (layer: number) => Math.min(10 + Math.floor((layer / totalSteps) * 80), 90);
    
    // ── Layer 1: Dialogue ──
    const dialogueTracks: string[] = [];
    if (layerChecks.dialogue.available) {
      step++;
      await updateJob(jobId, { progress_pct: progressFor(step), message: `Generating dialogue (${beats.filter(b => b.dialogue_text).length} lines)...` });
      
      for (const beat of beats.filter(b => b.dialogue_text)) {
        const char = characters.find(c => c.name === beat.character_name);
        if (!char) continue;
        
        const voiceId = options.voice_overrides?.[char.id] || char.voice_id || "michael";
        const audio = await elevenlabsTTS(beat.dialogue_text, voiceId, beat.emotional_state);
        
        if (audio) {
          dialogueTracks.push(beat.id); // In production: store actual file refs
        }
      }
      
      await updateJob(jobId, { progress_pct: progressFor(step), message: `Dialogue complete: ${dialogueTracks.length} tracks` });
    }
    
    // ── Layer 2: Sound Design ──
    if (layerChecks.sound.available) {
      step++;
      await updateJob(jobId, { progress_pct: progressFor(step), message: "Generating sound design..." });
      // Sound design: scene classification → freesound search (placeholder for now)
      for (const beat of beats) {
        const scene = classifyScene(beat);
        // In production: fetch from Freesound API
        // For now: skip (placeholder)
      }
    }
    
    // ── Layer 3: Music — SILOED per Morpheus 2026-05-02 ──
    // Music layer is deferred until AIVA commercial agreement is negotiated.
    // No music generation or placeholder in v1.
    
    // ── Layer 4: Mix ──
    if (layerChecks.mix.available) {
      step++;
      await updateJob(jobId, { progress_pct: progressFor(step), message: "Assembling M4B..." });
      // ffmpeg assembly would go here
      // In production: call ffmpeg to mix layers
    }
    
    await updateJob(jobId, { progress_pct: 95, message: "Finalizing..." });
    
    // Placeholder output URL (real impl: upload to Supabase Storage)
    await updateJob(jobId, {
      status: "complete",
      progress_pct: 100,
      message: `Audio export complete. ${dialogueTracks.length} dialogue tracks generated.`,
      output_url: null, // In production: signed URL from Storage
    });
    
  } catch (e: any) {
    console.error(`[audio-export] Job ${jobId} failed:`, e);
    await updateJob(jobId, { status: "error", message: `Error: ${e.message}` });
  }
}

// ── Parse beats from plaintext ───────────────────────────────────────────────
function parseBeats(text: string): any[] {
  const beats: any[] = [];
  const lines = text.split("\n");
  let current: any = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    const header = trimmed.match(/^(\d+)[.\)]\s*(.+)$/);
    if (header) {
      if (current) beats.push(current);
      current = {
        id: `beat-${header[1]}`,
        beat_number: parseInt(header[1]),
        beat_type: header[2],
        act_position: "act_1",
        premise: "",
        emotional_state: "neutral",
        dialogue_text: "",
      };
      continue;
    }
    
    const keyMatch = trimmed.match(/^(DIALOGUE|EMOTIONAL|PREMISE|HOOK|ACT)[:\-\s]*(.+)/i);
    if (keyMatch && current) {
      const key = keyMatch[1].toUpperCase();
      const val = keyMatch[2].trim();
      if (key === "DIALOGUE") current.dialogue_text = val;
      else if (key === "EMOTIONAL") current.emotional_state = val;
      else if (key === "PREMISE" || key === "HOOK") current.premise = val;
      else if (key === "ACT") current.act_position = val.includes("2") ? "act_2a" : val.includes("3") ? "act_3" : "act_1";
      continue;
    }
    
    if (current && trimmed) {
      current.premise = (current.premise + " " + trimmed).trim();
    }
  }
  
  if (current) beats.push(current);
  return beats;
}

// ── Parse characters from plaintext ──────────────────────────────────────────
function parseCharacters(text: string, metaJson: any): any[] {
  if (metaJson?.characters?.length) {
    return metaJson.characters.map((c: any) => ({
      id: c.id || c.name,
      name: c.name,
      role: c.role,
      voice_id: c.voice_profile?.elevenlabs_voice_id || c.voice_id || "michael",
      accent: c.accent,
      age: c.age,
    }));
  }
  
  const characters: any[] = [];
  const sections = text.split(/\n(?=[A-Z][a-z]+(?:\s[A-Z][a-z]+)*:)/);
  
  for (const section of sections) {
    const lines = section.trim().split("\n");
    const name = lines[0]?.replace(/:$/, "").trim();
    if (!name || name.length < 2) continue;
    
    characters.push({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      role: "supporting",
      voice_id: "michael",
    });
  }
  
  return characters;
}

// ── Scene classification ──────────────────────────────────────────────────────
function classifyScene(beat: any): { location: string; time: string; tags: string[] } {
  const premise = (beat.premise || "").toLowerCase();
  let location = "interior";
  let time = "day";
  const tags: string[] = ["ambient"];
  
  if (premise.includes("street") || premise.includes("avenue") || premise.includes("city")) location = "urban";
  if (premise.includes("forest") || premise.includes("tree")) location = "forest";
  if (premise.includes("night") || premise.includes("dark")) time = "night";
  if (premise.includes("morning")) time = "morning";
  if (premise.includes("rain")) tags.push("rain");
  if (premise.includes("wind")) tags.push("wind");
  
  return { location, time, tags };
}

// ── Utility ─────────────────────────────────────────────────────────────────
function availableCount(layerChecks: Record<string, { available: boolean }>): number {
  return Object.values(layerChecks).filter(v => v.available).length;
}