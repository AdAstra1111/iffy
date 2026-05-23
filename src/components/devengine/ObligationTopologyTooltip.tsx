import { useEffect, useRef } from 'react';
import type { SceneObligationMetrics, ObligationTopologyEdge } from '@/lib/obligation-topology-types';

interface Props {
  metrics: SceneObligationMetrics;
  edges: ObligationTopologyEdge[];
  sceneId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function ObligationTopologyTooltip({ metrics, edges, sceneId, position, onClose }: Props) {
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

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 280),
    top: Math.max(10, position.y - 300),
    zIndex: 50,
  };

  const typeLabel = (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const lifecycleBadgeColor = (state: string) => {
    switch (state) {
      case 'active': return 'text-amber-500';
      case 'discharging': return 'text-blue-500';
      case 'discharged': return 'text-green-500';
      case 'loaded': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div
      ref={ref}
      style={style}
      className="w-64 bg-popover border border-border/50 rounded-lg shadow-lg p-3 text-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border/30">
        <div>
          <p className="text-[11px] font-semibold">Charge Details</p>
          <p className="text-[9px] text-muted-foreground font-mono">{sceneId.slice(0, 12)}...</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{(metrics.avgCharge * 100).toFixed(0)}%</p>
          <p className="text-[9px] text-muted-foreground">Avg Charge</p>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-2 mb-2 pb-2 border-b border-border/30">
        <div className="text-center">
          <p className="text-sm font-bold">{metrics.totalObligations}</p>
          <p className="text-[9px] text-muted-foreground">Obligations</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold">{metrics.activeObligations}</p>
          <p className="text-[9px] text-muted-foreground">Active</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold">{metrics.entityCount}</p>
          <p className="text-[9px] text-muted-foreground">Entities</p>
        </div>
      </div>

      {/* Edge details */}
      {edges.length > 0 && (
        <div>
          <p className="text-[9px] text-muted-foreground mb-1 font-medium">Obligation edges:</p>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {edges.slice(0, 8).map((edge, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-[9px] py-0.5 px-1 rounded hover:bg-muted/30"
              >
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${lifecycleBadgeColor(edge.lifecycle_state)}`} />
                  <span className="truncate max-w-[80px] text-muted-foreground">
                    {edge.target.slice(0, 8)}...
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[8px] text-muted-foreground uppercase">{typeLabel(edge.type)}</span>
                  <span className="font-medium">{(edge.charge * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
            {edges.length > 8 && (
              <p className="text-[8px] text-muted-foreground text-center pt-0.5">
                +{edges.length - 8} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {edges.length === 0 && (
        <p className="text-[9px] text-muted-foreground text-center py-2">
          No outgoing obligation edges from this scene.
        </p>
      )}
    </div>
  );
}