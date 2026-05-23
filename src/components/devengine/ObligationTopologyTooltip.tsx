import { useEffect, useRef } from 'react';
import type { ObligationTopologyState } from '@/hooks/useObligationTopology';

interface Props {
  state: ObligationTopologyState;
  metric: {
    key: keyof ObligationTopologyState;
    label: string;
    subtitle: string;
  };
  sceneId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function ObligationTopologyTooltip({ state, metric, sceneId, position, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const metricData = state[metric.key] as any;
  if (!metricData) return null;

  // Determine position (fixed, anchored to cursor)
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 280),
    top: Math.max(10, position.y - 300),
    zIndex: 50,
  };

  // Extract sub-scores based on metric type
  const renderSubScores = () => {
    if (metric.key === 'narrativeDensity') {
      const density = state.narrativeDensity;
      return (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Band</span>
            <span className="font-medium capitalize">{density.band}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Anomalous</span>
            <span className={density.anomalous ? 'text-destructive' : 'text-green-500'}>
              {density.anomalous ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Expected density</span>
            <span className="font-medium">{(density.expectedDensity * 100).toFixed(0)}%</span>
          </div>
          {density.subScores?.map((sub: any, i: number) => (
            <div key={i} className="flex justify-between text-[10px]">
              <span className="text-muted-foreground capitalize">{sub.dimension?.replace(/_/g, ' ')}</span>
              <span className="font-medium">{(sub.score * 100).toFixed(0)}%</span>
            </div>
          ))}
          <div className="mt-1.5 pt-1.5 border-t border-border/30 text-[9px] text-muted-foreground">
            {density.metrics && (
              <>
                <div className="flex justify-between">
                  <span>Words</span><span>{density.metrics.wordCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Beat density</span><span>{density.metrics.beatDensity?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dialogue ratio</span><span>{density.metrics.dialogueRatio?.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    if (metric.key === 'tensionField') {
      const tf = state.tensionField;
      return (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Direction</span>
            <span className="font-medium capitalize">{tf.aggregateDirection}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Active threads</span>
            <span className="font-medium">{tf.activeThreadCount}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">New threads</span>
            <span className="font-medium">{tf.newThreads?.length || 0}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Resolved</span>
            <span className="font-medium">{tf.resolvedThreads?.length || 0}</span>
          </div>
          {tf.gradient !== null && (
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Gradient</span>
              <span className={`font-medium ${tf.gradient > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {tf.gradient > 0 ? '+' : ''}{tf.gradient.toFixed(2)}
              </span>
            </div>
          )}
          {tf.pairTensions?.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-border/30">
              <p className="text-[9px] text-muted-foreground mb-1">Character pairs:</p>
              {tf.pairTensions.slice(0, 5).map((pair: any, i: number) => (
                <div key={i} className="flex justify-between text-[9px]">
                  <span className="truncate max-w-[120px]">{pair.characterA} / {pair.characterB}</span>
                  <span className="font-medium">{(pair.score * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (metric.key === 'obligationCharge') {
      const oc = state.obligationCharge;
      return (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Velocity</span>
            <span className="font-medium">{oc.velocity?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Overdue</span>
            <span className="font-medium text-destructive">{oc.overdueCount}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Outstanding</span>
            <span className="font-medium">{oc.outstanding?.length || 0}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Introduced this scene</span>
            <span className="font-medium">{oc.introduced?.length || 0}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Fulfilled this scene</span>
            <span className="font-medium">{oc.fulfilled?.length || 0}</span>
          </div>
          {oc.outstanding?.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-border/30">
              <p className="text-[9px] text-muted-foreground mb-1">Top obligations:</p>
              {oc.outstanding.slice(0, 3).map((obl: any, i: number) => (
                <div key={i} className="text-[9px] truncate">
                  <span className={obl.urgency === 'critical' ? 'text-destructive' : 'text-muted-foreground'}>
                    {obl.description?.slice(0, 40)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (metric.key === 'deferredIntimacy') {
      const di = state.deferredIntimacy;
      return (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Velocity</span>
            <span className="font-medium">{di.velocity?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Deferred moments</span>
            <span className="font-medium">{di.deferredMoments?.length || 0}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Resolved</span>
            <span className="font-medium">{di.resolvedMoments?.length || 0}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Avoidant characters</span>
            <span className="font-medium">{di.avoidantCharacters?.length || 0}</span>
          </div>
          {di.pairStates?.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-border/30">
              <p className="text-[9px] text-muted-foreground mb-1">Pair intimacy:</p>
              {di.pairStates.slice(0, 3).map((pair: any, i: number) => (
                <div key={i} className="flex justify-between text-[9px]">
                  <span className="truncate max-w-[120px]">{pair.characterA} / {pair.characterB}</span>
                  <span className="font-medium">{(pair.intimacyLevel * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      ref={ref}
      style={style}
      className="w-64 bg-popover border border-border/50 rounded-lg shadow-lg p-3 text-xs"
    >
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border/30">
        <div>
          <p className="text-[11px] font-semibold">{metric.label}</p>
          <p className="text-[9px] text-muted-foreground font-mono">{sceneId.slice(0, 12)}...</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{(((metricData as any)?.aggregateScore ?? (metricData as any)?.chargeScore ?? (metricData as any)?.aggregateIndex ?? (metricData as any)?.score ?? 0) * 100).toFixed(0)}%</p>
          <p className="text-[9px] text-muted-foreground">Score</p>
        </div>
      </div>
      {renderSubScores()}
    </div>
  );
}