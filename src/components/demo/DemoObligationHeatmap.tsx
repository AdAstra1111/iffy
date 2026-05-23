import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

export interface SceneData {
  sceneNumber: number;
  tensionScore: number;
  obligationCharge: number;
  deferredIntimacy: number;
  narrativeDensity: number;
  narrativePressure: number;
  sceneHeading: string;
  actNumber: number;
}

interface Props {
  scenes: SceneData[];
  className?: string;
}

interface MetricDef {
  key: keyof SceneData;
  label: string;
  description: string;
}

const METRICS: MetricDef[] = [
  { key: 'tensionScore', label: 'Tension', description: 'Narrative tension score' },
  { key: 'obligationCharge', label: 'Obligation', description: 'Obligation charge level' },
  { key: 'deferredIntimacy', label: 'Intimacy', description: 'Deferred intimacy debt' },
  { key: 'narrativeDensity', label: 'Density', description: 'Narrative density per scene' },
  { key: 'narrativePressure', label: 'Pressure', description: 'Narrative pressure gauge' },
];

function valueToColorClass(value: number): string {
  if (value >= 0.8) return 'bg-red-500/70';
  if (value >= 0.6) return 'bg-orange-500/60';
  if (value >= 0.4) return 'bg-yellow-500/50';
  if (value >= 0.25) return 'bg-lime-500/40';
  return 'bg-green-500/30';
}

function valueToOpacity(value: number): string {
  return `${0.25 + value * 0.55}`;
}

export function DemoObligationHeatmap({ scenes, className = '' }: Props) {
  const [hoveredCell, setHoveredCell] = useState<{ sceneIdx: number; metricIdx: number; value: number } | null>(null);

  const grouped = useMemo(() => {
    if (!scenes.length) return [];
    const groups: { actNumber: number; scenes: SceneData[] }[] = [];
    let currentAct = scenes[0].actNumber;
    let currentGroup: SceneData[] = [];

    for (const scene of scenes) {
      if (scene.actNumber !== currentAct && currentGroup.length > 0) {
        groups.push({ actNumber: currentAct, scenes: currentGroup });
        currentGroup = [];
        currentAct = scene.actNumber;
      }
      currentGroup.push(scene);
    }
    if (currentGroup.length > 0) {
      groups.push({ actNumber: currentAct, scenes: currentGroup });
    }
    return groups;
  }, [scenes]);

  if (!scenes.length) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground/60">
        No scene data loaded.
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header row: metric labels */}
      <div className="flex items-center gap-1 pl-12">
        <div className="w-8 shrink-0" />
        {METRICS.map((m) => (
          <div key={m.key} className="flex-1 text-center">
            <span className="text-[10px] font-medium text-muted-foreground/70">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 pl-12 text-[10px] text-muted-foreground/50">
        <span>Low</span>
        <span className="w-4 h-3 rounded bg-green-500/30" />
        <span className="w-4 h-3 rounded bg-lime-500/40" />
        <span className="w-4 h-3 rounded bg-yellow-500/50" />
        <span className="w-4 h-3 rounded bg-orange-500/60" />
        <span className="w-4 h-3 rounded bg-red-500/70" />
        <span>High</span>
      </div>

      {/* Per-act groups */}
      {grouped.map((group, gi) => (
        <div key={`act-${gi}`}>
          {/* Act separator */}
          <div className="flex items-center gap-2 pl-12 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Act {group.actNumber}
            </span>
            <div className="flex-1 h-px bg-border/20" />
            <span className="text-[9px] text-muted-foreground/40">{group.scenes.length} scenes</span>
          </div>

          {/* Scene rows */}
          {group.scenes.map((scene, si) => {
            const globalIdx = scenes.indexOf(scene);
            return (
              <motion.div
                key={`scene-${scene.sceneNumber}`}
                className="flex items-center gap-1 py-0.5"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: globalIdx * 0.02, duration: 0.3 }}
              >
                {/* Scene label */}
                <div className="w-8 shrink-0 text-right pr-1">
                  <span className="text-[10px] font-mono text-muted-foreground/60">{scene.sceneNumber}</span>
                </div>
                <div className="w-4 shrink-0">
                  <span className="text-[8px] text-muted-foreground/30 truncate block" title={scene.sceneHeading}>
                    {scene.sceneHeading?.slice(0, 2) || '--'}
                  </span>
                </div>

                {/* Metric cells */}
                {METRICS.map((metric, mi) => {
                  const value = scene[metric.key] as number;
                  return (
                    <motion.div
                      key={`cell-${scene.sceneNumber}-${metric.key}`}
                      className="flex-1 h-6 rounded-sm flex items-center justify-center cursor-crosshair relative"
                      style={{ opacity: valueToOpacity(value) as any }}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: valueToOpacity(value) as any }}
                      transition={{ duration: 0.25, delay: globalIdx * 0.01 + mi * 0.03 }}
                      onMouseEnter={() => setHoveredCell({ sceneIdx: globalIdx, metricIdx: mi, value })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div className={`w-full h-full rounded-sm ${valueToColorClass(value)}`} />
                      {/* Tooltip */}
                      {hoveredCell?.sceneIdx === globalIdx && hoveredCell?.metricIdx === mi && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded bg-popover border border-border/40 text-[10px] font-mono text-foreground whitespace-nowrap shadow-lg pointer-events-none">
                          {scene.sceneHeading || `Scene ${scene.sceneNumber}`} — {metric.label}: {(value * 100).toFixed(0)}%
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            );
          })}
        </div>
      ))}

      {/* Summary footer */}
      <div className="flex items-center gap-4 pl-12 text-[9px] text-muted-foreground/40 pt-1">
        <span>{scenes.length} scenes</span>
        <span>{grouped.length} acts</span>
      </div>
    </div>
  );
}
