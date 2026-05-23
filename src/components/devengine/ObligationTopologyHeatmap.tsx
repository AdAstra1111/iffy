import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SceneObligationMetrics, ObligationTopologyResult, ObligationTopologyEdge } from '@/lib/obligation-topology-types';
import { ObligationTopologyTooltip } from './ObligationTopologyTooltip';

interface Props {
  states: Record<string, SceneObligationMetrics>;
  sceneIds: string[];
  topology: ObligationTopologyResult | null;
  isLoading: boolean;
  error: string | null;
  onRefetch: () => void;
}

type MetricKey = keyof Pick<SceneObligationMetrics, 'entityCount' | 'totalObligations' | 'avgCharge' | 'activeObligations'>;

interface MetricDef {
  key: MetricKey;
  label: string;
  subtitle: string;
  unit: 'count' | 'percent';
  highColor: string;
  lowColor: string;
  format: (v: number) => string;
}

const METRICS: MetricDef[] = [
  {
    key: 'entityCount',
    label: 'Entities',
    subtitle: 'count',
    unit: 'count',
    highColor: '#8b5cf6',
    lowColor: '#ede9fe',
    format: (v: number) => v.toFixed(0),
  },
  {
    key: 'totalObligations',
    label: 'Obligations',
    subtitle: 'total',
    unit: 'count',
    highColor: '#f59e0b',
    lowColor: '#fef3c7',
    format: (v: number) => v.toFixed(0),
  },
  {
    key: 'avgCharge',
    label: 'Avg Charge',
    subtitle: 'average',
    unit: 'percent',
    highColor: '#ef4444',
    lowColor: '#fecaca',
    format: (v: number) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: 'activeObligations',
    label: 'Active',
    subtitle: 'count',
    unit: 'count',
    highColor: '#06b6d4',
    lowColor: '#cffafe',
    format: (v: number) => v.toFixed(0),
  },
];

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function interpolateColor(lowColor: string, highColor: string, value: number): string {
  const low = hexToRgb(lowColor);
  const high = hexToRgb(highColor);
  const r = Math.round(low.r + (high.r - low.r) * value);
  const g = Math.round(low.g + (high.g - low.g) * value);
  const b = Math.round(low.b + (high.b - low.b) * value);
  return `rgb(${r}, ${g}, ${b})`;
}

function getNormalizedValue(
  metrics: SceneObligationMetrics,
  metric: MetricDef,
  ranges: Record<string, { min: number; max: number }>,
): number {
  const raw = metrics[metric.key];
  const range = ranges[metric.key];
  if (!range || range.max === range.min) return 0.5;
  return (raw - range.min) / (range.max - range.min);
}

export function ObligationTopologyHeatmap({ states, sceneIds, topology, isLoading, error, onRefetch }: Props) {
  const [tooltipInfo, setTooltipInfo] = useState<{
    sceneId: string;
    metric: MetricDef;
    metrics: SceneObligationMetrics;
    x: number;
    y: number;
  } | null>(null);

  // Compute value ranges for normalization
  const ranges = useMemo(() => {
    const values: Record<string, number[]> = {};
    for (const m of METRICS) {
      values[m.key] = [];
    }
    for (const sceneId of sceneIds) {
      const s = states[sceneId];
      if (!s) continue;
      for (const m of METRICS) {
        values[m.key].push(s[m.key]);
      }
    }
    const result: Record<string, { min: number; max: number }> = {};
    for (const m of METRICS) {
      const arr = values[m.key];
      result[m.key] = {
        min: arr.length > 0 ? Math.min(...arr) : 0,
        max: arr.length > 0 ? Math.max(...arr) : 1,
      };
    }
    return result;
  }, [states, sceneIds]);

  // Get edges for tooltip
  const edges = topology?.topology?.edges ?? [];

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

      {/* Heatmap grid */}
      <ScrollArea className="max-h-[400px]">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-[10px] text-muted-foreground">
              <th className="text-left py-1 pr-3 font-medium w-24">Scene</th>
              {METRICS.map(m => (
                <th key={m.key} className="text-center py-1 px-2 font-medium">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sceneIds.map(sceneId => {
              const metrics = states[sceneId];
              if (!metrics) return null;

              return (
                <tr
                  key={sceneId}
                  className="border-t border-border/30 hover:bg-muted/20 transition-colors"
                >
                  <td className="py-1 pr-3 text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">
                    {sceneId.slice(0, 8)}...
                  </td>
                  {METRICS.map(metric => {
                    const raw = metrics[metric.key];
                    const normalized = getNormalizedValue(metrics, metric, ranges);
                    const bgColor = interpolateColor(metric.lowColor, metric.highColor, normalized);

                    return (
                      <td
                        key={metric.key}
                        className="text-center px-2 py-1 cursor-pointer relative"
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltipInfo({
                            sceneId,
                            metric,
                            metrics,
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
                            color: normalized > 0.5 ? '#fff' : '#666',
                          }}
                        >
                          {metric.format(raw)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>

      {/* Tooltip — only for Avg Charge metric which has edge details */}
      {tooltipInfo && tooltipInfo.metric.key === 'avgCharge' && (
        <ObligationTopologyTooltip
          metrics={tooltipInfo.metrics}
          edges={edges.filter(e => e.source === tooltipInfo.sceneId)}
          sceneId={tooltipInfo.sceneId}
          position={{ x: tooltipInfo.x, y: tooltipInfo.y }}
          onClose={() => setTooltipInfo(null)}
        />
      )}
    </div>
  );
}
