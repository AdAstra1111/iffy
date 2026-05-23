import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface ObligationData {
  source_scene_key: string;
  target_scene_key: string;
  type: string;
  charge: number;
  lifecycle_state: 'discharged' | 'active' | 'loaded' | 'pending';
}

export interface SceneInfo {
  id: string;
  title: string;
}

export interface DemoObligationHeatmapProps {
  obligations: ObligationData[];
  scenes: SceneInfo[];
  className?: string;
}

/** Map lifecycle_state + charge to a color class. */
function heatColor(state: string, charge: number): string {
  switch (state) {
    case 'discharged':
      return 'bg-green-500/30';
    case 'active':
      return charge > 0.6
        ? 'bg-yellow-500/50'
        : charge > 0.3
          ? 'bg-yellow-500/35'
          : 'bg-yellow-500/20';
    case 'loaded':
    case 'pending':
      return charge > 0.6
        ? 'bg-red-500/60'
        : charge > 0.3
          ? 'bg-red-500/40'
          : 'bg-red-500/25';
    default:
      return 'bg-muted/10';
  }
}

/** Text contrast label based on charge. */
function heatLabel(value: number): string {
  if (value >= 0.8) return 'High';
  if (value >= 0.5) return 'Med';
  if (value >= 0.2) return 'Low';
  return '—';
}

export function DemoObligationHeatmap({
  obligations,
  scenes,
  className,
}: DemoObligationHeatmapProps) {
  // Derive distinct obligation types
  const obligationTypes = useMemo(() => {
    const set = new Set<string>();
    for (const o of obligations) {
      if (o.type) set.add(o.type);
    }
    return Array.from(set).sort();
  }, [obligations]);

  // Build a lookup map: sceneKey -> { type -> aggregated charge/state }
  const cellMap = useMemo(() => {
    const map = new Map<string, Map<string, { charge: number; state: string }>>();
    for (const o of obligations) {
      const key = o.target_scene_key || o.source_scene_key;
      if (!key) continue;
      if (!map.has(key)) map.set(key, new Map());
      const inner = map.get(key)!;
      inner.set(o.type, {
        charge: o.charge,
        state: o.lifecycle_state,
      });
    }
    return map;
  }, [obligations]);

  const [hoverKey, setHoverKey] = useState<string | null>(null);

  if (!obligations.length || !scenes.length) {
    return (
      <Card className={cn('border-border/40', className)}>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground/60">
            No obligation data loaded. Run analysis to populate the heatmap.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Card className={cn('border-border/40', className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">
            Obligation Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 overflow-x-auto">
          <div className="min-w-max">
            {/* Color Legend */}
            <div className="flex items-center gap-3 mb-3 text-[10px] text-muted-foreground/60">
              <span>Discharged</span>
              <span className="w-3 h-3 rounded-sm bg-green-500/30" />
              <span>Active</span>
              <span className="w-3 h-3 rounded-sm bg-yellow-500/40" />
              <span>Loaded</span>
              <span className="w-3 h-3 rounded-sm bg-red-500/50" />
              <span className="ml-auto text-[9px] text-muted-foreground/40">
                Cell intensity = charge level
              </span>
            </div>

            <table className="border-collapse">
              <thead>
                <tr>
                  {/* Top-left corner: type label */}
                  <th className="text-right pr-2 pb-1 text-[10px] font-medium text-muted-foreground/50 align-bottom">
                    Scene &rarr;
                    <br />
                    Type &darr;
                  </th>
                  {/* Scene columns */}
                  {scenes.map((scene) => (
                    <th
                      key={scene.id}
                      className="pb-1 px-1"
                    >
                      <div
                        className="text-[9px] font-medium text-muted-foreground/60 whitespace-nowrap truncate max-w-[80px] mx-auto"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                      >
                        {scene.title || scene.id}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {obligationTypes.map((type) => (
                  <tr key={type}>
                    <td className="text-right pr-2 py-1 text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap">
                      {type}
                    </td>
                    {scenes.map((scene) => {
                      const inner = cellMap.get(scene.id);
                      const cell = inner?.get(type);
                      const charge = cell?.charge ?? 0;
                      const state = cell?.state ?? '';
                      const color = cell ? heatColor(state, charge) : 'bg-muted/5';

                      return (
                        <td key={`${scene.id}-${type}`} className="px-1 py-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  'w-8 h-8 rounded-sm flex items-center justify-center cursor-crosshair transition-transform hover:scale-110',
                                  color,
                                  cell ? 'ring-1 ring-border/10' : '',
                                )}
                                onMouseEnter={() =>
                                  setHoverKey(`${scene.id}:${type}`)
                                }
                                onMouseLeave={() => setHoverKey(null)}
                              >
                                <span className="text-[7px] font-mono text-foreground/60">
                                  {cell ? heatLabel(charge) : ''}
                                </span>
                              </div>
                            </TooltipTrigger>
                            {cell && hoverKey === `${scene.id}:${type}` && (
                              <TooltipContent side="top" className="text-[10px]">
                                <p>
                                  <strong>{scene.title || scene.id}</strong> &mdash;{' '}
                                  {type}
                                </p>
                                <p>
                                  Charge: {(charge * 100).toFixed(0)}% &middot; State:{' '}
                                  {state}
                                </p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Empty rows message */}
            {obligationTypes.length === 0 && (
              <p className="text-[10px] text-muted-foreground/40 text-center py-4">
                No obligation types detected in the data.
              </p>
            )}
          </div>

          {/* Summary */}
          <div className="flex items-center gap-3 mt-3 text-[9px] text-muted-foreground/40">
            <span>{obligations.length} obligations</span>
            <span>{obligationTypes.length} types</span>
            <span>{scenes.length} scenes</span>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default DemoObligationHeatmap;