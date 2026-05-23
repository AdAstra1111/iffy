import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SceneObligationData } from '@/hooks/useObligationData';

interface DemoObligationHeatmapProps {
  scenes: SceneObligationData[];
  className?: string;
}

const METRICS = [
  { key: 'narrativePressure' as const, label: 'Pressure', color: (v: number) => v > 0.8 ? '#ef4444' : v > 0.6 ? '#f59e0b' : v > 0.4 ? '#22c55e' : '#3b82f6' },
  { key: 'tensionField' as const, label: 'Tension', getter: (s: SceneObligationData) => s.tensionField.value, color: (v: number) => v > 0.8 ? '#ef4444' : v > 0.6 ? '#f59e0b' : v > 0.4 ? '#22c55e' : '#3b82f6' },
  { key: 'narrativeDensity' as const, label: 'Density', getter: (s: SceneObligationData) => s.narrativeDensity.value, color: (v: number) => v > 0.7 ? '#ef4444' : v > 0.5 ? '#f59e0b' : v > 0.3 ? '#22c55e' : '#3b82f6' },
];

function getMetricValue(scene: SceneObligationData, metric: typeof METRICS[number]): number {
  if (metric.key === 'narrativePressure') return scene.narrativePressure;
  if (metric.key === 'tensionField') return scene.tensionField.value;
  if (metric.key === 'narrativeDensity') return scene.narrativeDensity.value;
  return 0;
}

function ActSection({ actScenes, actIndex, metrics }: {
  actScenes: SceneObligationData[];
  actIndex: number;
  metrics: typeof METRICS;
}) {
  if (actScenes.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Act {actIndex}</span>
        <span className="text-[10px] text-muted-foreground/50">{actScenes[0].actName}</span>
        <span className="text-[10px] text-muted-foreground/50 ml-auto">{actScenes.length} scenes</span>
      </div>
      {/* Scene headers */}
      <div className="flex gap-1">
        {actScenes.map(scene => (
          <div key={scene.sceneId} className="flex-1 text-center">
            <div className="text-[9px] text-muted-foreground/60 truncate px-0.5">{scene.title}</div>
            <div className="text-[8px] text-muted-foreground/40">#{scene.sceneNumber}</div>
          </div>
        ))}
      </div>
      {/* Metric rows */}
      {metrics.map(metric => (
        <div key={metric.key} className="flex gap-1">
          <div className="w-16 shrink-0 flex items-center">
            <span className="text-[10px] text-muted-foreground/70">{metric.label}</span>
          </div>
          {actScenes.map(scene => {
            const value = getMetricValue(scene, metric);
            return (
              <motion.div
                key={scene.sceneId}
                className="flex-1 h-8 rounded flex items-center justify-center text-[9px] font-mono font-bold"
                style={{ backgroundColor: metric.color(value), opacity: 0.3 + value * 0.6 }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.3 + value * 0.6, scale: 1 }}
                transition={{ duration: 0.4 }}
                title={`${scene.title}: ${metric.label} = ${(value * 100).toFixed(0)}%`}
              >
                {(value * 100).toFixed(0)}
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function DemoObligationHeatmap({ scenes, className = '' }: DemoObligationHeatmapProps) {
  const grouped = useMemo(() => {
    const groups: SceneObligationData[][] = [];
    let current: SceneObligationData[] = [];
    let lastAct = -1;
    for (const scene of scenes) {
      if (scene.actNumber !== lastAct && current.length > 0) {
        groups.push(current);
        current = [];
      }
      current.push(scene);
      lastAct = scene.actNumber;
    }
    if (current.length > 0) groups.push(current);
    return groups;
  }, [scenes]);

  if (!scenes.length) {
    return <div className="text-sm text-muted-foreground p-4 text-center">No scene data available</div>;
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
        <span className="font-semibold uppercase tracking-wider">Legend:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500" /> Low</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500" /> Moderate</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500" /> Elevated</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" /> Critical</span>
      </div>

      {scenes.length > 0 && (
        <div className="text-xs text-muted-foreground/50">
          <span className="text-red-400">●</span> Overpressure: {scenes.filter(s => s.signals.overpressure).length} scenes
          <span className="ml-3 text-amber-400">●</span> Intimacy critical: {scenes.filter(s => s.signals.intimacyCritical).length} scenes
          <span className="ml-3 text-orange-400">●</span> Obligation overload: {scenes.filter(s => s.signals.obligationOverload).length} scenes
        </div>
      )}

      {grouped.map((actScenes, i) => (
        <ActSection key={i} actScenes={actScenes} actIndex={i + 1} metrics={METRICS} />
      ))}
    </div>
  );
}