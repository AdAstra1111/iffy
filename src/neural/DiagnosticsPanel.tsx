// ═══════════════════════════════════════════════════════════════
// NeuralDiagnosticsPanel — IFFY Neural Validation UI
// Phase 0-4: Read-only. Displays validation results. Never mutates.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import {
  NeuralValidationRun,
  DivergenceFlag,
  IntentTarget,
  ROILabel,
} from './types';

const ROI_COLORS: Record<ROILabel, string> = {
  Amygdala: '#ef4444',    // red
  TPJ: '#f59e0b',         // amber
  DMN: '#8b5cf6',         // violet
  PFC: '#3b82f6',         // blue
  VisualCortex: '#10b981', // emerald
  Insula: '#ec4899',       // pink
};

const SEVERITY_COLORS: Record<string, string> = {
  info: '#6b7280',
  warning: '#f59e0b',
  critical: '#ef4444',
};

interface Props {
  run?: NeuralValidationRun | null;
  loading?: boolean;
  onBeatSelect?: (beatIndex: number) => void;
}

function roiBar(value: number, roi: ROILabel, targetMin: number, targetMax: number) {
  const clamped = Math.max(-0.1, Math.min(0.2, value));
  const percent = ((clamped + 0.1) / 0.3) * 100;
  const color = ROI_COLORS[roi] || '#6b7280';
  const inTarget = value >= targetMin && value <= targetMax;

  return (
    <div key={roi} className="flex items-center gap-3 mb-2">
      <span className="w-24 text-sm font-medium text-gray-300">{roi}</span>
      <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            backgroundColor: color,
            opacity: inTarget ? 0.9 : 0.6,
          }}
        />
        {/* Target range indicator */}
        <div
          className="absolute top-0 bottom-0 border-l-2 border-r-2 border-white/30"
          style={{
            left: `${((targetMin + 0.1) / 0.3) * 100}%`,
            right: `${100 - ((targetMax + 0.1) / 0.3) * 100}%`,
          }}
        />
      </div>
      <span className="w-16 text-right text-sm font-mono text-gray-400">
        {value >= 0 ? '+' : ''}{value.toFixed(4)}
      </span>
      {!inTarget && (
        <span className="text-xs text-amber-400 font-medium">DIVERGED</span>
      )}
    </div>
  );
}

function DivergenceFlagCard({ flag }: { flag: DivergenceFlag }) {
  const borderColor = SEVERITY_COLORS[flag.severity] || '#6b7280';

  return (
    <div
      className="border-l-4 p-3 mb-2 rounded-r-lg bg-gray-800/50"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-200">
          {flag.roi}
        </span>
        <span
          className="text-xs font-medium uppercase px-2 py-0.5 rounded"
          style={{
            backgroundColor: `${borderColor}20`,
            color: borderColor,
          }}
        >
          {flag.severity}
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-2">{flag.message}</p>
      {flag.suggested_correction && (
        <div className="text-xs text-gray-500">
          <span className="text-emerald-400 font-medium">Suggested: </span>
          {flag.suggested_correction}
        </div>
      )}
      {flag.rule_id && (
        <div className="text-xs text-gray-600 mt-1">
          Rule: {flag.rule_id}
        </div>
      )}
    </div>
  );
}

function IntentTargetCard({ target }: { target: IntentTarget }) {
  return (
    <div className="p-3 bg-gray-800/30 rounded-lg mb-3">
      <h4 className="text-sm font-medium text-gray-300 mb-2">Intent Target</h4>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Theme: </span>
          <span className="text-gray-300">{target.theme}</span>
        </div>
        <div>
          <span className="text-gray-500">Tone: </span>
          <span className="text-gray-300">{target.tone}</span>
        </div>
        {target.emotional_destination && (
          <div>
            <span className="text-gray-500">Destination: </span>
            <span className="text-gray-300">{target.emotional_destination}</span>
          </div>
        )}
        {target.audience_contract && (
          <div>
            <span className="text-gray-500">Contract: </span>
            <span className="text-gray-300">{target.audience_contract}</span>
          </div>
        )}
        {target.symbolism.length > 0 && (
          <div className="col-span-2">
            <span className="text-gray-500">Symbols: </span>
            <span className="text-gray-300">{target.symbolism.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function NeuralDiagnosticsPanel({ run, loading, onBeatSelect }: Props) {
  const [activeTab, setActiveTab] = useState<'divergence' | 'predictions' | 'target'>('divergence');

  if (loading) {
    return (
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-800 rounded w-1/3" />
          <div className="h-32 bg-gray-800 rounded" />
          <div className="h-24 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <div className="text-center py-8">
          <div className="text-3xl mb-2">🧠</div>
          <h3 className="text-lg font-medium text-gray-400 mb-1">Neural Diagnostics</h3>
          <p className="text-sm text-gray-600">
            Validate a beat to see neural predictions and divergence analysis.
          </p>
        </div>
      </div>
    );
  }

  const flags = run.divergence_json?.flags || [];
  const predictions = run.output_json?.predictions || [];
  const target = run.target_json;
  const criticalCount = flags.filter(f => f.severity === 'critical').length;
  const warningCount = flags.filter(f => f.severity === 'warning').length;

  // Check for surrogate/real mode
  const isSurrogate = run.provenance?.inference_mode === 'surrogate' || run.divergence_json?.surrogate_warning !== undefined;

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
      {/* KNOWN LIMITATION NOTE — always visible in preview phase */}
      {!isSurrogate && (
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
          <p className="text-blue-300/60 text-xs">
            ⓘ TRIBE predictions are currently experimental. Absolute ROI values may vary between runs,
            especially on CPU/local inference. Use directional divergence patterns and repeated-run
            trends rather than single-run absolute values.
          </p>
        </div>
      )}

      {/* SURROGATE WARNING BANNER (Check 1) */}
      {isSurrogate && (
        <div className="mb-4 p-4 bg-amber-900/30 border-2 border-amber-500/40 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400 font-bold text-sm uppercase tracking-wider">⚠️ SURROGATE_DIAGNOSTIC_ONLY</span>
            <span className="text-amber-600 text-xs font-mono">conf: {run.provenance?.confidence?.toFixed(2) || '0.30'}</span>
          </div>
          <p className="text-amber-300/70 text-xs">
            This prediction was generated by a keyword-based heuristic, not real TRIBE v2 inference.
            Do not use for production decisions. Real predictions require the TRIBE v2 model running locally.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Neural Diagnostics</h3>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
            <span>Run: {run.id.slice(0, 8)}...</span>
            <span>|</span>
            <span>{run.layer_type}</span>
            <span>|</span>
            <span className={run.provenance?.inference_mode === 'tribe_real' ? 'text-emerald-500' : run.provenance?.inference_mode === 'surrogate' ? 'text-amber-500' : 'text-red-500'}>
              {run.provenance?.inference_mode || 'unknown'}
            </span>
            <span>|</span>
            <span className="text-gray-600">
              {run.provenance?.stability_status || 'single_run'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-red-500/20 text-red-400">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-amber-500/20 text-amber-400">
              {warningCount} warning
            </span>
          )}
          <span className="text-xs text-gray-600">
            {new Date(run.created_at).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {(['divergence', 'predictions', 'target'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'divergence' ? 'Divergence' : tab === 'predictions' ? 'Predictions' : 'Intent'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'divergence' && (
        <div>
          <p className="text-sm text-gray-400 mb-3">
            {run.divergence_json?.summary || 'No divergence analysis.'}
          </p>
          {flags.length === 0 ? (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
              <span className="text-emerald-400 font-medium">✓ All ROI targets achieved</span>
            </div>
          ) : (
            <div className="space-y-1">
              {flags.map((flag, i) => (
                <DivergenceFlagCard key={i} flag={flag} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'predictions' && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Green bar shows predicted activation. White bracket shows target range.
          </p>
          {predictions.map(pred => {
            const roiTarget = target?.roi_targets?.[pred.roi];
            const [tMin, tMax] = roiTarget
              ? (() => {
                  const ranges: Record<string, [number, number]> = {
                    'very-low': [-0.10, -0.04],
                    'low': [-0.04, -0.01],
                    'moderate-low': [-0.01, 0.01],
                    'moderate': [0.01, 0.03],
                    'moderate-high': [0.03, 0.06],
                    'high': [0.06, 0.10],
                    'very-high': [0.10, 0.20],
                  };
                  return ranges[roiTarget.intensity] || [-0.01, 0.01];
                })()
              : [-0.01, 0.01];

            return roiBar(pred.value, pred.roi, tMin, tMax);
          })}
        </div>
      )}

      {activeTab === 'target' && target && (
        <div>
          <IntentTargetCard target={target} />
          <div className="text-xs text-gray-500 mt-2">
            <div className="flex items-center gap-4">
              <span>Input preview:</span>
              <code className="text-gray-600 truncate max-w-md">
                {run.input_text_preview}
              </code>
            </div>
            <div className="mt-1">
              Confidence: {predictions[0]?.confidence?.toFixed(2) || 'N/A'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NeuralDiagnosticsPanel;