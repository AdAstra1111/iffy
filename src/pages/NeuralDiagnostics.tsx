// ═══════════════════════════════════════════════════════════════
// NeuralDiagnostics page — Preview/dev panel for TRIBE v2 validation
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { NeuralDiagnosticsPanel } from '@/neural';
import { NeuralValidationRun, IntentTarget } from '@/neural/types';

// Beat 7 comparison data from the May 21 TRIBE v2 run
const BEAT7_DATA = {
  "A_BeatDescription": {
    "words": 40,
    "timesteps": 9,
    "avg_activation": 0.0736,
    "text": "Sophia threatens Bill, leveraging his son. He has no choice. The photograph on the desk becomes the weight of everything he might lose.",
    "roi": {
      "Amygdala": 0.0164, "TPJ": 0.0765, "DMN": 0.1255,
      "PFC": 0.1555, "VisualCortex": 0.0467, "Insula": 0.0661
    }
  },
  "B_Rewrite_Red": {
    "words": 91,
    "timesteps": 19,
    "avg_activation": 0.0345,
    "text": "Bill stares at the photograph. His son's face looks back at him. Sophia waits by the door. 'Decide before I reach the street,' she says. He doesn't touch the photo. The weight of the choice presses into his chest. He picks up the fallen chair, sets it upright, and sits in the dark.",
    "roi": {
      "Amygdala": -0.0684, "TPJ": 0.0352, "DMN": 0.0472,
      "PFC": 0.0789, "VisualCortex": -0.0242, "Insula": -0.0155
    }
  },
  "C_ActualScript": {
    "words": 322,
    "timesteps": 70,
    "avg_activation": 0.0542,
    "text": "INT. CASINO OFFICE - NIGHT\n\nSophia doesn't sit. She stands between Bill and the door.\n\nSOPHIA\nYour son. He's at school, isn't he? Boarding. Expensive.\n\nBill doesn't answer. He looks at the photograph on his desk.\n\nSOPHIA (CONT'D)\nI could have that arranged to 'presumed dead'. Maybe give your boy some closure.\n\nShe lets that land. Fifteen years of silence.\n\nSOPHIA (CONT'D)\nI'll be at the street in three minutes. Decide by then.",
    "roi": {
      "Amygdala": -0.0253, "TPJ": 0.0414, "DMN": 0.0999,
      "PFC": 0.1223, "VisualCortex": -0.0192, "Insula": 0.0161
    }
  }
};

const INTENT_TARGET: IntentTarget = {
  theme: "impossible choice",
  tone: "quiet menace",
  symbolism: ["photograph", "silence", "the chair"],
  emotional_destination: "morally-conflicted",
  audience_contract: "slow-burn-tension",
  beat_function: "crisis",
  roi_targets: {
    PFC: { intensity: "moderate-low", direction: "falling", notes: "Audience should feel, not analyse" },
    TPJ: { intensity: "moderate-high", direction: "rising", notes: "Character connection — Bill's impossible position" },
    Amygdala: { intensity: "moderate", direction: "elevated", notes: "Emotional weight of the threat" },
    Insula: { intensity: "high", direction: "elevated", notes: "Visceral — feel it in the body" },
    DMN: { intensity: "moderate", direction: "stable", notes: "Thematic absorption" },
  },
};

function buildRunForVersion(
  versionKey: string,
  versionData: typeof BEAT7_DATA[keyof typeof BEAT7_DATA],
  target: IntentTarget,
): NeuralValidationRun {
  const predictions = Object.entries(versionData.roi).map(([roi, value]) => ({
    roi: roi as any,
    value,
    confidence: 0.85,
  }));

  const flags: any[] = [];
  for (const pred of predictions) {
    const roiTarget = target.roi_targets?.[pred.roi];
    if (!roiTarget) continue;
    const ranges: Record<string, [number, number]> = {
      'very-low': [-0.10, -0.04], 'low': [-0.04, -0.01],
      'moderate-low': [-0.01, 0.01], 'moderate': [0.01, 0.03],
      'moderate-high': [0.03, 0.06], 'high': [0.06, 0.10],
      'very-high': [0.10, 0.20],
    };
    const [tmin, tmax] = ranges[roiTarget.intensity] || [-0.01, 0.01];
    if (pred.value < tmin || pred.value > tmax) {
      flags.push({
        roi: pred.roi,
        severity: Math.abs(pred.value - tmin) > 0.04 ? 'critical' as const : 'warning' as const,
        message: `${pred.roi} at ${pred.value.toFixed(4)} (target: [${tmin.toFixed(3)}, ${tmax.toFixed(3)}]). ${pred.value > tmax ? 'Overactive' : 'Underactive'} relative to intent.`,
        predicted_value: pred.value,
        target_range: { min: tmin, max: tmax },
        suggested_correction: '',
      });
    }
  }

  return {
    id: `beat7-${versionKey}`,
    project_id: 'preview',
    document_id: 'preview',
    document_version_id: 'preview',
    layer_type: 'beat',
    input_text_hash: 'preview',
    input_text_preview: versionData.text.slice(0, 200),
    model_version: 'tribev2-llama3.2-3b-cpu-20260521',
    provenance: {
      model_name: 'tribev2',
      model_version: 'tribev2-llama3.2-3b-cpu-20260521',
      inference_mode: 'tribe_real',
      input_hash: 'preview',
      confidence: 0.85,
      timestamp: '2026-05-21T18:39:00Z',
      stability_status: 'single_run',
    },
    target_json: target,
    output_json: {
      predictions,
      segment_timings: [0, 0.15, 0.3, 0.45, 0.6],
    },
    divergence_json: {
      flags,
      summary: flags.length > 0
        ? `${flags.filter(f => f.severity === 'critical').length} critical, ${flags.filter(f => f.severity === 'warning').length} warning flags.`
        : 'All ROI targets achieved.',
    },
    status: 'completed',
    created_at: '2026-05-21T18:39:00Z',
  };
}

function ComparisonTable({ versions }: { versions: Record<string, typeof BEAT7_DATA[keyof typeof BEAT7_DATA]> }) {
  const rois = ['Amygdala', 'TPJ', 'DMN', 'PFC', 'VisualCortex', 'Insula'];
  const labels: Record<string, string> = {
    A_BeatDescription: 'A — Beat Description',
    B_Rewrite_Red: 'B — Red\'s Rewrite',
    C_ActualScript: 'C — Actual Script',
  };
  const colors: Record<string, string> = {
    A_BeatDescription: '#10b981',
    B_Rewrite_Red: '#f59e0b',
    C_ActualScript: '#3b82f6',
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 px-3 text-gray-500 font-medium">ROI</th>
            {Object.keys(versions).map(key => (
              <th key={key} className="text-right py-2 px-3 font-medium" style={{ color: colors[key] }}>
                {labels[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rois.map(roi => (
            <tr key={roi} className="border-b border-gray-800/50">
              <td className="py-2 px-3 text-gray-300">{roi}</td>
              {Object.entries(versions).map(([key, data]) => {
                const val = (data.roi as any)[roi] ?? 0;
                const targetRoi = INTENT_TARGET.roi_targets?.[roi];
                const ranges: Record<string, [number, number]> = {
                  'very-low': [-0.10, -0.04], 'low': [-0.04, -0.01],
                  'moderate-low': [-0.01, 0.01], 'moderate': [0.01, 0.03],
                  'moderate-high': [0.03, 0.06], 'high': [0.06, 0.10],
                  'very-high': [0.10, 0.20],
                };
                const [tmin, tmax] = targetRoi ? ranges[targetRoi.intensity] || [-0.01, 0.01] : [-1, 1];
                const inTarget = val >= tmin && val <= tmax;
                return (
                  <td key={key} className={`text-right py-2 px-3 font-mono ${inTarget ? 'text-emerald-400' : 'text-red-400'}`}>
                    {val >= 0 ? '+' : ''}{val.toFixed(4)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-gray-700">
            <td className="py-2 px-3 text-gray-500 text-xs">Avg</td>
            {Object.entries(versions).map(([key, data]) => (
              <td key={key} className="text-right py-2 px-3 font-mono text-gray-400 text-xs">
                {data.avg_activation >= 0 ? '+' : ''}{data.avg_activation.toFixed(4)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function NeuralDiagnosticsPage() {
  const [selectedVersion, setSelectedVersion] = useState<string>('C_ActualScript');

  const versionData = BEAT7_DATA[selectedVersion as keyof typeof BEAT7_DATA];
  const run = buildRunForVersion(selectedVersion, versionData, INTENT_TARGET);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🧠</span>
            <h1 className="text-2xl font-bold">Neural Diagnostics</h1>
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">PREVIEW</span>
          </div>
          <p className="text-gray-500 text-sm">
            TRIBE v2 brain response prediction — YETI Beat 7: The Blackmail Scene
          </p>
        </div>

        {/* Version selector */}
        <div className="flex gap-2 mb-6">
          {Object.entries(BEAT7_DATA).map(([key, data]) => {
            const labels: Record<string, string> = {
              A_BeatDescription: 'A — Beat Description',
              B_Rewrite_Red: "B — Red's Rewrite",
              C_ActualScript: 'C — Sebastian\'s Script',
            };
            const isActive = selectedVersion === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedVersion(key)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                {labels[key]}
              </button>
            );
          })}
        </div>

        {/* Three-way comparison table */}
        <div className="mb-6 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Three-Way Comparison</h2>
          <ComparisonTable versions={BEAT7_DATA} />
          <div className="mt-3 text-xs text-gray-600">
            <span className="text-emerald-400">Green</span> = predicted value is in target range.{' '}
            <span className="text-red-400">Red</span> = diverged from intent.
          </div>
        </div>

        {/* Diagnostics Panel */}
        <NeuralDiagnosticsPanel run={run} />

        {/* Text preview */}
        <div className="mt-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <h3 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Input Text</h3>
          <pre className="text-sm text-gray-300 font-sans whitespace-pre-wrap">
            {versionData.text}
          </pre>
          <div className="mt-2 text-xs text-gray-600">
            {versionData.words} words · {versionData.timesteps} timesteps
          </div>
        </div>
      </div>
    </div>
  );
}