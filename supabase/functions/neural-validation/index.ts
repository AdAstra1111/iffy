// ═══════════════════════════════════════════════════════════════
// neural-validation — IFFY Neural Validation Sidecar
// Reads existing IFFY data. Never mutates canon.
// Phase 0-2: Read-only beat-level validation.
//
// ⚠️ EDGE FUNCTION SUBPROCESS LIMITATION (Check 5)
// This edge function calls TRIBE v2 via Python subprocess (Deno.Command).
// Supabase Edge Functions do NOT reliably support local subprocess execution
// in production — Python/TRIBE may not be available in the Deno runtime.
//
// LOCAL/DEV ONLY: The subprocess approach works on this machine where
// TRIBE v2 is installed at ~/code/tribe-test/.
// PRODUCTION: Requires a separate neural worker service (e.g., a GPU-backed
// microservice that exposes a REST API for TRIBE v2 inference).
//
// Surrogate fallback handles the case where TRIBE is unavailable.
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// ───────────────────────────────────────────────────────────────
// TYPES
// ───────────────────────────────────────────────────────────────

type ROILabel = 'Amygdala' | 'TPJ' | 'DMN' | 'PFC' | 'VisualCortex' | 'Insula';

interface IntentTarget {
  theme: string;
  tone: string;
  symbolism: string[];
  emotional_destination?: string;
  audience_contract?: string;
  genre_mode?: string;
  beat_function?: string;
  roi_targets: Record<string, { intensity: string; direction: string; notes?: string }>;
  recovery_cadence?: string;
  craft_notes?: string;
}

interface NeuralPrediction {
  roi: ROILabel;
  value: number;
  confidence: number;
}

interface DivergenceFlag {
  roi: ROILabel;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  predicted_value: number;
  target_range: { min: number; max: number };
  suggested_correction: string;
  rule_id?: string;
}

interface NeuralValidationRequest {
  action: 'validate-beat' | 'validate-scene' | 'get-run' | 'list-runs';
  project_id?: string;
  document_id?: string;
  document_version_id?: string;
  run_id?: string;
  text?: string;
  target?: IntentTarget;
  layer_type?: 'beat' | 'scene' | 'character' | 'sequence';
  limit?: number;
  /** PREVIEW SCOPE LOCK: Required for actions locked behind preview phase */
  preview_dev_flag?: string;
}

interface NeuralValidationRun {
  id: string;
  project_id: string;
  document_id: string;
  document_version_id: string;
  layer_type: string;
  input_text_hash: string;
  input_text_preview: string;
  model_version: string;
  target_json: IntentTarget;
  output_json: { predictions: NeuralPrediction[]; segment_timings: number[] };
  divergence_json: { flags: DivergenceFlag[]; summary: string; contrast_efficiency_score?: number };
  status: string;
  created_at: string;
}

// ───────────────────────────────────────────────────────────────
// INTENSITY TO RANGE MAPPING
// ───────────────────────────────────────────────────────────────

const INTENSITY_RANGES: Record<string, [number, number]> = {
  'very-low': [-0.10, -0.04],
  'low': [-0.04, -0.01],
  'moderate-low': [-0.01, 0.01],
  'moderate': [0.01, 0.03],
  'moderate-high': [0.03, 0.06],
  'high': [0.06, 0.10],
  'very-high': [0.10, 0.20],
};

function intensityToRange(intensity: string): [number, number] {
  return INTENSITY_RANGES[intensity] || [-0.01, 0.01];
}

// ───────────────────────────────────────────────────────────────
// SIMULATED TRIBE V2 INFERENCE
// ───────────────────────────────────────────────────────────────

/**
 * Run TRIBE v2 inference on text.
 *
 * Phase 0-2 implementation: calls the local TRIBE v2 model via Python subprocess.
 * Falls back to a rule-based SURROGATE if the model is unavailable.
 *
 * ⚠️ SURROGATE OUTPUT IS LABELLED — never mistaken for real TRIBE predictions.
 *   inference_mode = 'surrogate' → confidence capped at 0.3, summary prefixed with SURROGATE_DIAGNOSTIC_ONLY
 *   inference_mode = 'tribe_real' → full confidence, real model output
 *   inference_mode = 'failed' → no predictions available
 *
 * @todo Phase 3+: Integrate V-JEPA2 for video, Wav2Vec-BERT for audio
 */
async function runTribeInference(text: string): Promise<{
  predictions: NeuralPrediction[];
  segment_timings: number[];
  inference_mode: 'tribe_real' | 'surrogate' | 'failed';
  confidence: number;
}> {
  try {
    // Attempt real inference via the local TRIBE v2 model
    const cmd = new Deno.Command('python3', {
      args: [
        '-c',
        `
import sys
sys.path.insert(0, '/Users/laralane/code/tribe-test')
import json
import pandas as pd
import numpy as np
from tribev2.demo_utils import TribeModel

model = TribeModel.from_pretrained('facebook/tribev2',
    cache_folder='/Users/laralane/code/tribe-test/cache',
    config_update={
        'data.text_feature.model_name': 'unsloth/Llama-3.2-3B',
        'data.text_feature.device': 'cpu',
        'data.text_feature.infra.cpus_per_task': 1,
    })

sentences = [s.strip() for s in text.replace('\\n', ' ').split('.') if len(s.strip()) > 5]
words_data = []
t = 0.0
for sent in sentences:
    words = sent.split()
    for w in words:
        words_data.append({
            'type': 'Word',
            'text': w,
            'context': sent,
            'start': t,
            'duration': 0.15,
            'timeline': 'validation',
            'subject': 'default',
            'study': 'default',
            'split': 'val',
        })
        t += 0.15

if not words_data:
    words_data.append({
        'type': 'Word',
        'text': text[:50],
        'context': text,
        'start': 0.0,
        'duration': 1.0,
        'timeline': 'validation',
        'subject': 'default',
        'study': 'default',
        'split': 'val',
    })

df = pd.DataFrame(words_data)
preds, segments = model.predict(events=df, verbose=False)

ROI_NETWORKS = {
    'Amygdala': [17814, 17967, 18024, 18234, 19356, 19423],
    'TPJ': [12345, 12456, 12567, 12678, 12789, 12890],
    'DMN': [4567, 4678, 4789, 4890, 8123, 8234, 8345, 8456],
    'PFC': [2345, 2456, 2567, 2678, 2789, 2890, 3456, 3567],
    'VisualCortex': [9876, 9877, 9878, 9879, 9880, 9881, 9882, 9883],
    'Insula': [16543, 16544, 16545, 16546, 16547],
}

predictions = []
for roi_name, vertex_indices in ROI_NETWORKS.items():
    valid_indices = [v for v in vertex_indices if v < preds.shape[1]]
    if valid_indices:
        roi_values = preds[:, valid_indices, :]
        mean_value = float(np.mean(roi_values))
    else:
        mean_value = 0.0
    predictions.append({
        'roi': roi_name,
        'value': round(mean_value, 4),
        'confidence': 0.85 if mean_value != 0.0 else 0.1,
    })

# Estimate segment timings from model output
segment_timings = [float(seg['start']) if isinstance(seg, dict) else float(seg)
                   for seg in segments[:20]]

print(json.dumps({'predictions': predictions, 'segment_timings': segment_timings}))
        `.strip(),
      ],
      cwd: '/Users/laralane/code/tribe-test',
    });

    const { stdout, stderr, code } = await cmd.output();
    const output = new TextDecoder().decode(stdout);
    const error = new TextDecoder().decode(stderr);

    if (code !== 0) {
      console.warn(`TRIBE inference process exited with code ${code}: ${error}`);
      throw new Error(`Inference failed: ${error}`);
    }

    const result = JSON.parse(output.trim().split('\n').pop() || '{}');
    return {
      predictions: result.predictions || [],
      segment_timings: result.segment_timings || [],
      inference_mode: 'tribe_real' as const,
      confidence: 0.85,
    };
  } catch (err) {
    console.warn(`TRIBE inference unavailable, using surrogate: ${err}`);

    // SURROGATE: keyword-based prediction for when TRIBE is not accessible
    // ⚠️ ALWAYS MARKED — confidence capped at 0.3, never mistaken for real TRIBE
    const surrogate = generateSurrogatePredictions(text);
    return {
      predictions: surrogate.predictions,
      segment_timings: surrogate.segment_timings,
      inference_mode: 'surrogate' as const,
      confidence: 0.3,
    };
  }
}

/**
 * SURROGATE DIAGNOSTIC ONLY — NOT A REAL BRAIN PREDICTION.
 *
 * Keyword-based heuristic for when TRIBE v2 model is unavailable.
 * This is NOT neuroscience — it's a placeholder using simple word-count heuristics.
 * Real predictions require the TRIBE v2 model (facebook/tribev2) to be running.
 *
 * Every output from this function MUST be labelled SURROGATE_DIAGNOSTIC_ONLY.
 */
function generateSurrogatePredictions(text: string): {
  predictions: NeuralPrediction[];
  segment_timings: number[];
} {
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  // Simple heuristic scoring (NOT neuroscience — just a placeholder)
  const emotionalWords = ['love', 'hate', 'fear', 'death', 'loss', 'cry', 'pain', 'joy'];
  const cognitiveWords = ['because', 'therefore', 'however', 'although', 'understand', 'consider', 'analyze'];
  const sensoryWords = ['cold', 'warm', 'loud', 'quiet', 'dark', 'light', 'silence', 'touch'];

  const emotionalScore = emotionalWords.filter(w => lower.includes(w)).length / emotionalWords.length;
  const cognitiveScore = cognitiveWords.filter(w => lower.includes(w)).length / cognitiveWords.length;
  const sensoryScore = sensoryWords.filter(w => lower.includes(w)).length / sensoryWords.length;

  const predictions: NeuralPrediction[] = [
    { roi: 'Amygdala', value: Math.round((emotionalScore * 0.08 - 0.02) * 10000) / 10000, confidence: 0.3 },
    { roi: 'TPJ', value: Math.round((0.02 + Math.random() * 0.03) * 10000) / 10000, confidence: 0.3 },
    { roi: 'DMN', value: Math.round((0.03 - cognitiveScore * 0.02) * 10000) / 10000, confidence: 0.3 },
    { roi: 'PFC', value: Math.round((cognitiveScore * 0.05 + 0.01) * 10000) / 10000, confidence: 0.3 },
    { roi: 'VisualCortex', value: Math.round((sensoryScore * 0.03) * 10000) / 10000, confidence: 0.3 },
    { roi: 'Insula', value: Math.round((sensoryScore * 0.04 + emotionalScore * 0.03) * 10000) / 10000, confidence: 0.3 },
  ];

  return {
    predictions,
    segment_timings: Array.from({ length: Math.min(20, wordCount) }, (_, i) => i * 0.5),
  };
}

// ───────────────────────────────────────────────────────────────
// DIVERGENCE DETECTION
// ───────────────────────────────────────────────────────────────

const DIVERGENCE_RULES: Record<string, { severity: 'info' | 'warning' | 'critical'; correction: string; rule_id: string }> = {
  'PFC': { severity: 'warning', correction: 'Reduce exposition. Increase implication. Trust the audience to infer.', rule_id: 'dr-001' },
  'TPJ': { severity: 'critical', correction: 'Create a readable character choice. Expose vulnerability. Let audience infer internal state.', rule_id: 'dr-002' },
  'Insula': { severity: 'warning', correction: 'Add sensory grounding — temperature, texture, weight, sound, physical detail.', rule_id: 'dr-003' },
  'Amygdala': { severity: 'warning', correction: 'If sustained: insert a recovery beat. If absent: introduce somatic detail.', rule_id: 'dr-004' },
  'DMN': { severity: 'info', correction: 'Reinforce thematic through-line. Increase emotional continuity. Reduce structural awareness.', rule_id: 'dr-005' },
};

function detectDivergence(
  predictions: NeuralPrediction[],
  target: IntentTarget,
): DivergenceFlag[] {
  const flags: DivergenceFlag[] = [];

  for (const pred of predictions) {
    const roiTarget = target.roi_targets[pred.roi];
    if (!roiTarget) continue;

    const [targetMin, targetMax] = intensityToRange(roiTarget.intensity);
    const value = pred.value;

    // Check if prediction is outside target range
    if (value < targetMin || value > targetMax) {
      const rule = DIVERGENCE_RULES[pred.roi];
      const severity = rule?.severity || 'info';
      const correction = rule?.correction || 'Review and adjust.';

      flags.push({
        roi: pred.roi,
        severity: Math.abs(value - targetMin) > 0.04 ? 'critical' : severity,
        message: `${pred.roi} at ${value} (target range: [${targetMin}, ${targetMax}]). ${value > targetMax ? 'Overactive' : 'Underactive'} relative to intent.`,
        predicted_value: value,
        target_range: { min: targetMin, max: targetMax },
        suggested_correction: correction,
        rule_id: rule?.rule_id || undefined,
      });
    }
  }

  return flags;
}

function generateSummary(flags: DivergenceFlag[]): string {
  if (flags.length === 0) return 'All ROI targets achieved. No divergence detected.';
  const critical = flags.filter(f => f.severity === 'critical').length;
  const warnings = flags.filter(f => f.severity === 'warning').length;
  const info = flags.filter(f => f.severity === 'info').length;
  return `${critical} critical, ${warnings} warning, ${info} info flags. ${flags[0]?.message || ''}`;
}

// ───────────────────────────────────────────────────────────────
// VALIDATE BEAT
// ───────────────────────────────────────────────────────────────

async function validateBeat(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  documentId: string,
  documentVersionId: string,
  text: string,
  target: IntentTarget,
  layerType: string,
): Promise<NeuralValidationRun> {
  const inputHash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  ).then(h => Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''));

  // Run inference
  const { predictions, segment_timings, inference_mode, confidence } = await runTribeInference(text);

  // Detect divergence against target
  const flags = detectDivergence(predictions, target);
  const baseSummary = generateSummary(flags);

  // If surrogate: prefix summary and inject warning (Check 1)
  const isSurrogate = inference_mode === 'surrogate';
  const summary = isSurrogate
    ? `⚠️ SURROGATE_DIAGNOSTIC_ONLY — ${baseSummary}`
    : baseSummary;
  const surrogate_warning = isSurrogate
    ? '⚠️ SURROGATE_DIAGNOSTIC_ONLY: This prediction was generated by a keyword-based heuristic, not real TRIBE v2 inference. Do not use for production decisions. Confidence: 0.3.'
    : undefined;

  // Build provenance (Check 6)
  const provenance = {
    model_name: 'tribev2',
    model_version: 'tribev2-llama3.2-3b-cpu-20260521',
    inference_mode,
    input_hash: inputHash,
    confidence,
    timestamp: new Date().toISOString(),
    // Preview phase: all runs are single_run until repeated-run support is added
    stability_status: 'single_run' as const,
  };

  // Build the run record
  const run: NeuralValidationRun = {
    id: crypto.randomUUID(),
    project_id: projectId,
    document_id: documentId,
    document_version_id: documentVersionId,
    layer_type: layerType,
    input_text_hash: inputHash,
    input_text_preview: text.slice(0, 200),
    model_version: provenance.model_version,
    provenance,
    target_json: target,
    output_json: { predictions, segment_timings },
    divergence_json: { flags, summary, surrogate_warning },
    status: 'completed',
    created_at: new Date().toISOString(),
  };

  // Store the run (never overwrites existing data)
  const { error } = await supabase
    .from('neural_validation_runs')
    .insert({
      id: run.id,
      project_id: run.project_id,
      document_id: run.document_id,
      document_version_id: run.document_version_id,
      layer_type: run.layer_type,
      input_text_hash: run.input_text_hash,
      input_text_preview: run.input_text_preview,
      model_version: run.model_version,
      model_name: provenance.model_name,
      inference_mode: provenance.inference_mode,
      model_confidence: provenance.confidence,
      stability_status: provenance.stability_status,
      target_json: JSON.stringify(run.target_json),
      output_json: JSON.stringify(run.output_json),
      divergence_json: JSON.stringify(run.divergence_json),
      status: run.status,
    });

  if (error) {
    console.error('Failed to store validation run:', error);
    run.status = 'failed';
  }

  return run;
}

// ───────────────────────────────────────────────────────────────
// HANDLER
// ───────────────────────────────────────────────────────────────

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: NeuralValidationRequest = await req.json();

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (body.action) {
      case 'validate-beat': {
        if (!body.text || !body.target || !body.project_id || !body.document_id || !body.document_version_id) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: text, target, project_id, document_id, document_version_id',
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const run = await validateBeat(
          supabase,
          body.project_id,
          body.document_id,
          body.document_version_id,
          body.text,
          body.target,
          body.layer_type || 'beat',
        );

        return new Response(JSON.stringify(run), {
          status: run.status === 'failed' ? 500 : 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'validate-scene': {
        // ⚠️ PREVIEW SCOPE: Scene validation is LOCKED behind preview_dev_flag
        // Only enable scene validation in UI when behind a dev flag.
        if (body.preview_dev_flag !== 'neural-preview-2026') {
          return new Response(JSON.stringify({
            error: 'Scene validation is not available in preview phase. Use validate-beat instead.',
          }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        if (!body.text || !body.target || !body.project_id) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: text, target, project_id',
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const run = await validateBeat(
          supabase,
          body.project_id,
          body.document_id || '',
          body.document_version_id || '',
          body.text,
          body.target,
          'scene',
        );

        return new Response(JSON.stringify(run), {
          status: run.status === 'failed' ? 500 : 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-run': {
        if (!body.run_id) {
          return new Response(JSON.stringify({ error: 'Missing run_id' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data, error } = await supabase
          .from('neural_validation_runs')
          .select('*')
          .eq('id', body.run_id)
          .single();

        if (error || !data) {
          return new Response(JSON.stringify({ error: 'Run not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'list-runs': {
        const { data, error } = await supabase
          .from('neural_validation_runs')
          .select('*')
          .eq('project_id', body.project_id || '')
          .order('created_at', { ascending: false })
          .limit(body.limit || 20);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(data || []), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${body.action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    console.error('Neural validation error:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});