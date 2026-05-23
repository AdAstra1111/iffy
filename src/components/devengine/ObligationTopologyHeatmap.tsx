import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ObligationTopologyState } from '@/hooks/useObligationTopology';
import { ObligationTopologyTooltip } from './ObligationTopologyTooltip';

interface Props {
  states: Record<string, ObligationTopologyState>;
  sceneIds: string[];
  isLoading: boolean;
  error: string | null;
  onRefetch: () => void;
}

// Metric definitions with display info and color palettes
const METRICS = [
  {
    key: 'tensionField' as const,
    label: 'Tension',
    subtitle: 'aggregateScore',
    highColor: '#ef4444',
    lowColor: '#fecaca',
    bandLabel: (v: number) => v > 0.7 ? 'High' : v > 0.3 ? 'Medium' : 'Low',
  },
  {
    key: 'obligationCharge' as const,
    label: 'Obligation',
    subtitle: 'chargeScore',
    highColor: '#f59e0b',
    lowColor: '#fef3c7',
    bandLabel: (v: number) => v > 0.7 ? 'High' : v > 0.3 ? 'Medium' : 'Low',
  },
  {
    key: 'deferredIntimacy' as const,
    label: 'Intimacy',
    subtitle: 'aggregateIndex',
    highColor: '#e879f9',
    lowColor: '#fae8ff',
    bandLabel: (v: number) => v > 0.7 ? 'High' : v > 0.3 ? 'Medium' : 'Low',
  },
  {
    key: 'narrativeDensity' as const,
    label: 'Density',
    subtitle: 'score',
    highColor: '#06b6d4',
    lowColor: '#cffafe',
    bandLabel: (v: number) => v > 0.7 ? 'High' : v > 0.3 ? 'Medium' : 'Low',
  },
];

function interpolateColor(lowColor: string, highColor: string, value: number): string {
  // Parse hex colors
  const low = {
    r: parseInt(lowColor.slice(1, 3), 16),
    g: parseInt(lowColor.slice(3, 5), 16),
    b: parseInt(lowColor.slice(5, 7), 16),
  };
  const high = {
    r: parseInt(highColor.slice(1, 3), 16),
    g: parseInt(highColor.slice(3, 5), 16),
    b: parseInt(highColor.slice(5, 7), 16),
  };

  const r = Math.round(low.r + (high.r - low.r) * value);
  const g = Math.round(low.g + (high.g - low.g) * value);
  const b = Math.round(low.b + (high.b - low.b) * value);

  return `rgb(${r}, ${g}, ${b})`;
}

function getScoreValue(state: ObligationTopologyState, metric: typeof METRICS[number]): number | null {
  const m = state[metric.key];
  if (!m) return null;
  if (metric.key === 'tensionField') return (m as any).aggregateScore ?? null;
  if (metric.key === 'obligationCharge') return (m as any).chargeScore ?? null;
  if (metric.key === 'deferredIntimacy') return (m as any).aggregateIndex ?? null;
  if (metric.key === 'narrativeDensity') return (m as any).score ?? null;
  return null;
}

function getDensityBand(state: ObligationTopologyState): string {
  return state.narrativeDensity?.band || 'balanced';
}

export function ObligationTopologyHeatmap({ states, sceneIds, isLoading, error, onRefetch }: Props) {
  const [tooltipInfo, setTooltipInfo] = useState<{
    sceneId: string;
    metric: typeof METRICS[number];
    state: ObligationTopologyState;
    x: number;
    y: number;
  } | null>(null);

  // Compute act-level rollups
  const actRollups = useMemo(() => {
    const rollups: Record<number, { scenes: string[]; averages: Record<string, number> }> = {};
    for (const sceneId of sceneIds) {
      const state = states[sceneId];
      if (!state) continue;
      const actRollup = state.actRollup;
      if (!actRollup) continue;
      const actNum = actRollup.tension?.actNumber || 1;
      if (!rollups[actNum]) {
        rollups[actNum] = { scenes: [], averages: {} };
      }
      rollups[actNum].scenes.push(sceneId);
    }
    return Object.entries(rollups).map(([act, data]) => ({
      act: Number(act),
      sceneCount: data.scenes.length,
    }));
  }, [states, sceneIds]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Computing narrative topology...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-xs text-destructive">{error}</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRefetch}>
          Retry
        </Button>
      </div>
    );
  }

  if (sceneIds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">No scenes to analyze.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Metric legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        {METRICS.map(m => (
          <div key={m.key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: `linear-gradient(90deg, ${m.lowColor}, ${m.highColor})` }} />
            <span>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Density band legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="font-medium">Density bands:</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-600" /> Dense
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400" /> Balanced
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-200" /> Sparse
        </span>
      </div>

      {/* Act rollups */}
      {actRollups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actRollups.map(r => (
            <Badge key={r.act} variant="secondary" className="text-[9px]">
              Act {r.act} — {r.sceneCount} scenes
            </Badge>
          ))}
        </div>
      )}

      {/* Heatmap grid */}
      <ScrollArea className="max-h-[400px]">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-[10px] text-muted-foreground">
              <th className="text-left py-1 pr-3 font-medium w-24">Scene</th>
              {METRICS.map(m => (
                <th key={m.key} className="text-center py-1 px-2 font-medium">{m.label}</th>
              ))}
              <th className="text-center py-1 px-2 font-medium">Pressure</th>
              <th className="text-center py-1 px-2 font-medium">Mode</th>
              <th className="text-center py-1 px-2 font-medium">Signals</th>
            </tr>
          </thead>
          <tbody>
            {sceneIds.map(sceneId => {
              const state = states[sceneId];
              if (!state) return null;

              const signals = state.signals;
              const activeSignals = [
                signals?.overpressure && 'Overpressure',
                signals?.intimacyCritical && 'Intimacy!',
                signals?.obligationOverload && 'Overload',
                signals?.densityAnomaly && 'Density!',
              ].filter(Boolean);

              return (
                <tr
                  key={sceneId}
                  className="border-t border-border/30 hover:bg-muted/20 transition-colors"
                >
                  <td className="py-1 pr-3 text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">
                    {sceneId.slice(0, 8)}...
                  </td>
                  {METRICS.map(metric => {
                    const score = getScoreValue(state, metric);
                    if (score === null) {
                      return (
                        <td key={metric.key} className="text-center px-2 py-1 text-[9px] text-muted-foreground">
                          —
                        </td>
                      );
                    }

                    const bgColor = interpolateColor(metric.lowColor, metric.highColor, score);
                    const densityBand = metric.key === 'narrativeDensity' ? getDensityBand(state) : null;
                    const bandClass = densityBand === 'dense' ? 'ring-1 ring-cyan-600/30' :
                      densityBand === 'sparse' ? 'opacity-60' : '';

                    return (
                      <td
                        key={metric.key}
                        className={`text-center px-2 py-1 cursor-pointer relative ${bandClass}`}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltipInfo({
                            sceneId,
                            metric,
                            state,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                          });
                        }}
                        onMouseLeave={() => setTooltipInfo(null)}
                      >
                        <div
                          className="w-full h-6 rounded flex items-center justify-center text-[9px] font-medium"
                          style={{
                            backgroundColor: bgColor,
                            color: score > 0.5 ? '#fff' : '#666',
                          }}
                        >
                          {(score * 100).toFixed(0)}
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center px-2 py-1">
                    <span className={`text-[10px] font-medium ${
                      state.narrativePressure > 0.7 ? 'text-red-500' :
                      state.narrativePressure > 0.4 ? 'text-amber-500' :
                      'text-muted-foreground'
                    }`}>
                      {(state.narrativePressure * 100).toFixed(0)}
                    </span>
                  </td>
                  <td className="text-center px-2 py-1">
                    <span className="text-[9px] text-muted-foreground capitalize">
                      {state.dominantMode?.replace(/_/g, ' ') || '—'}
                    </span>
                  </td>
                  <td className="text-center px-2 py-1">
                    <div className="flex gap-0.5 justify-center">
                      {activeSignals.length === 0 && (
                        <span className="text-[9px] text-muted-foreground">—</span>
                      )}
                      {activeSignals.slice(0, 2).map(s => (
                        <Badge key={s} variant="destructive" className="text-[7px] h-3.5 px-1">
                          {s}
                        </Badge>
                      ))}
                      {activeSignals.length > 2 && (
                        <Badge variant="outline" className="text-[7px] h-3.5 px-1">
                          +{activeSignals.length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>

      {/* Tooltip */}
      {tooltipInfo && (
        <ObligationTopologyTooltip
          state={tooltipInfo.state}
          metric={tooltipInfo.metric}
          sceneId={tooltipInfo.sceneId}
          position={{ x: tooltipInfo.x, y: tooltipInfo.y }}
          onClose={() => setTooltipInfo(null)}
        />
      )}
    </div>
  );
}