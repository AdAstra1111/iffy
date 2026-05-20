/**
 * NarrativeArc — a visual emotional arc for narrative beat atoms.
 * Nobody asked for this. It just wanted to exist.
 *
 * Takes narrative beat atoms, maps them along a classic story arc curve
 * (Freytag's pyramid: setup → rising action → climax → falling action → resolution),
 * and renders them as an interactive SVG timeline.
 */
import { useMemo, useState } from 'react';
import type { NarrativebeatAtom } from '@/hooks/useNarrativebeatAtoms';

/* ─── helpers ─── */

/** Map narrativeMomentum string to a 0–1 height position (0 = high, 1 = low) */
function momentumToY(momentum: string | undefined, index: number, total: number): number {
  if (!momentum) return arcY(index, total);
  const m = momentum.toLowerCase().trim();
  if (m === 'climax' || m === 'peak') return 0.08;
  if (m === 'rising' || m === 'building' || m === 'escalating') return arcY(index, total) * 0.5;
  if (m === 'falling' || m === 'descending' || m === 'declining') return 0.3 + (index / total) * 0.5;
  if (m === 'resolution' || m === 'denouement' || m === 'falling action') return 0.75;
  if (m === 'setup' || m === 'introduction' || m === 'exposition') return 0.55;
  if (m === 'inciting incident' || m === 'call to adventure') return 0.35;
  if (m === 'midpoint' || m === 'twist') return 0.15;
  if (m === 'all is lost' || m === 'dark night') return 0.5;
  if (m === 'plateau' || m === 'steady') return arcY(index, total);
  const n = parseFloat(m);
  if (!isNaN(n)) return 0.9 - Math.min(n, 10) / 10 * 0.8;
  return arcY(index, total);
}

/** Classic Freytag pyramid Y value for a given index in total beats */
function arcY(index: number, total: number): number {
  if (total <= 1) return 0.5;
  const t = index / (total - 1);
  const peak = 0.6;
  if (t <= peak) return 0.6 - 0.5 * Math.pow(t / peak, 0.8);
  return 0.1 + 0.6 * Math.pow((t - peak) / (1 - peak), 1.2);
}

/** Catmull-Rom to cubic bezier for smooth SVG path */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/* ─── Component ─── */

interface NarrativeArcProps {
  atoms: NarrativebeatAtom[];
}

export function NarrativeArc({ atoms }: NarrativeArcProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const completed = useMemo(
    () => atoms
      .filter(a => a.generation_status === 'completed' || a.generation_status === 'complete')
      .sort((a, b) => (a.attributes?.beatSequenceOrder ?? 999) - (b.attributes?.beatSequenceOrder ?? 999)),
    [atoms]
  );

  if (completed.length < 2) return null;

  const W = 640;
  const H = 220;
  const PAD = { top: 20, right: 20, bottom: 36, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const P = 'hsl(var(--primary))';
  const MF = 'hsl(var(--muted-foreground))';
  const B = 'hsl(var(--border))';

  const points = completed.map((atom, i) => {
    const attr = atom.attributes;
    const x = PAD.left + (i / Math.max(completed.length - 1, 1)) * innerW;
    const y = PAD.top + momentumToY(attr?.narrativeMomentum, i, completed.length) * innerH;
    return { x, y, atom, index: i, attr };
  });

  const pathD = smoothPath(points.map(p => ({ x: p.x, y: p.y })));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto overflow-visible"
        style={{ minHeight: 140 }}
        role="img"
        aria-label="Narrative arc visualization"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f}
            x1={PAD.left} y1={PAD.top + innerH * f}
            x2={W - PAD.right} y2={PAD.top + innerH * f}
            stroke={B} strokeOpacity={f === 0 || f === 1 ? 0.12 : 0.06}
            strokeWidth={1} strokeDasharray={f === 0 || f === 1 ? 'none' : '4 4'} />
        ))}

        {/* Y-axis labels */}
        {[
          { label: 'Climax', yF: 0.04 },
          { label: 'Rising', yF: 0.27 },
          { label: 'Mid', yF: 0.52 },
          { label: 'Falling', yF: 0.77 },
          { label: 'Resolution', yF: 0.98 },
        ].map(({ label, yF }) => (
          <text key={label}
            x={PAD.left - 6} y={PAD.top + innerH * yF + 3}
            textAnchor="end" fill={MF} opacity={0.25}
            fontSize={9} fontFamily="system-ui">{label}</text>
        ))}

        {/* Gradient fill under the arc */}
        <defs>
          <linearGradient id="arc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={P} stopOpacity={0.12} />
            <stop offset="100%" stopColor={P} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <path
          d={`${pathD} L${points[points.length - 1].x},${PAD.top + innerH} L${points[0].x},${PAD.top + innerH} Z`}
          fill="url(#arc-fill)" />

        {/* The arc line */}
        <path d={pathD} fill="none" stroke={P} strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />

        {/* Beat dots + labels */}
        {points.map((p) => {
          const isHovered = hoveredIdx === p.index;
          const dotR = isHovered ? 6 : 3.5;
          return (
            <g key={p.atom.id}>
              {/* Hover guide line */}
              {isHovered && (
                <line x1={p.x} y1={PAD.top} x2={p.x} y2={PAD.top + innerH}
                      stroke={B} strokeOpacity={0.15} strokeWidth={1} strokeDasharray="3 3" />
              )}
              {/* Dot */}
              <circle
                cx={p.x} cy={p.y} r={dotR}
                fill={isHovered ? P : 'hsl(var(--background))'}
                stroke={P}
                strokeWidth={2}
                className="cursor-pointer transition-all duration-200"
                style={isHovered ? { filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.5))' } : undefined}
                onMouseEnter={() => setHoveredIdx(p.index)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              {/* Beat number label */}
              <text x={p.x} y={PAD.top + innerH + 14} textAnchor="middle"
                    fill={MF} opacity={isHovered ? 0.7 : 0.2}
                    fontSize={isHovered ? 10 : 8} fontFamily="system-ui"
                    className="transition-all duration-200 select-none"
                    onMouseEnter={() => setHoveredIdx(p.index)}
                    onMouseLeave={() => setHoveredIdx(null)}>
                {p.attr?.beatSequenceOrder ?? p.index + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip — positioned absolutely over the SVG */}
      {hoveredIdx !== null && points[hoveredIdx] && (() => {
        const p = points[hoveredIdx];
        const a = p.attr;
        return (
          <div
            className="absolute pointer-events-none z-50 bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-1 max-w-[220px] transition-opacity duration-150"
            style={{
              left: `${(p.x / W) * 100}%`,
              top: `calc(${(p.y / H) * 100}% + 8px)`,
              transform: 'translate(-50%, 0)',
            }}
          >
            <div className="font-medium text-sm truncate text-foreground">{p.atom.canonical_name}</div>
            {a?.beatType && (
              <div className="text-muted-foreground/80">
                {a.beatType}
              </div>
            )}
            {a?.emotionalImpact && (
              <div className="text-muted-foreground italic text-[11px] leading-tight pt-0.5">
                "{a.emotionalImpact}"
              </div>
            )}
            {a?.structuralFunction && (
              <div className="text-muted-foreground/60 text-[11px] pt-0.5">
                {a.structuralFunction}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}