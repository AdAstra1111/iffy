import { motion } from 'framer-motion';
import { Upload, BrainCircuit, BarChart3, Sparkles, Gauge } from 'lucide-react';

interface StageBox {
  id: string;
  label: string;
  icon: typeof Upload;
  x: number;
  y: number;
}

const STAGES: StageBox[] = [
  { id: 'intake', label: 'Script Intake', icon: Upload, x: 60, y: 100 },
  { id: 'extract', label: 'Atom Extraction', icon: BrainCircuit, x: 200, y: 100 },
  { id: 'converge', label: 'Convergence Analysis', icon: BarChart3, x: 340, y: 100 },
  { id: 'generate', label: 'Document Generation', icon: Sparkles, x: 480, y: 100 },
  { id: 'topology', label: 'Obligation Topology', icon: Gauge, x: 620, y: 100 },
];

export function DemoPipelineFlow({ className = '' }: { className?: string }) {
  const W = 700;
  const H = 200;
  const boxW = 120;
  const boxH = 56;

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minHeight: 180 }}>
        {/* Connection arrows between stages */}
        {STAGES.slice(0, -1).map((from, i) => {
          const to = STAGES[i + 1];
          const x1 = from.x + boxW / 2;
          const y1 = from.y + boxH / 2;
          const x2 = to.x + boxW / 2;
          const y2 = to.y + boxH / 2;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={`arrow-${from.id}`}>
              <motion.line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="hsl(var(--muted-foreground) / 0.25)"
                strokeWidth={2}
                strokeDasharray="5 3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: i * 0.15 }}
              />
              <motion.polygon
                points="-5,-4 5,0 -5,4"
                fill="hsl(var(--muted-foreground) / 0.3)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.15 + 0.6 }}
                transform={`translate(${mx + 8}, ${my}) rotate(90)`}
              />
            </g>
          );
        })}

        {/* Stage boxes */}
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <motion.g
              key={stage.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
            >
              {/* Box background */}
              <rect
                x={stage.x} y={stage.y}
                width={boxW} height={boxH} rx={8}
                fill="hsl(var(--card) / 0.3)"
                stroke="hsl(var(--border) / 0.2)"
                strokeWidth={1}
              />
              {/* Glow ring on hover */}
              <rect
                x={stage.x - 1} y={stage.y - 1}
                width={boxW + 2} height={boxH + 2} rx={9}
                fill="none"
                stroke="hsl(var(--primary) / 0.15)"
                strokeWidth={1}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
              {/* Icon */}
              <foreignObject x={stage.x + 10} y={stage.y + 14} width={28} height={28}>
                <div className="flex items-center justify-center w-full h-full">
                  <Icon className="h-5 w-5 text-muted-foreground/70" />
                </div>
              </foreignObject>
              {/* Label */}
              <text
                x={stage.x + 44} y={stage.y + 24}
                fill="hsl(var(--foreground))"
                fontSize={11}
                fontWeight={500}
                fontFamily="system-ui, sans-serif"
              >
                {stage.label}
              </text>
              {/* Subtitle */}
              <text
                x={stage.x + 44} y={stage.y + 40}
                fill="hsl(var(--muted-foreground) / 0.5)"
                fontSize={9}
                fontFamily="system-ui, sans-serif"
              >
                {i === 0 ? 'Parse screenplay' : i === 1 ? 'Extract narrative atoms' : i === 2 ? 'Score convergence' : i === 3 ? 'Generate docs' : 'Map obligations'}
              </text>
            </motion.g>
          );
        })}

        {/* Pipeline label */}
        <text
          x={W / 2} y={H - 12}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground) / 0.3)"
          fontSize={9}
          fontFamily="system-ui, sans-serif"
        >
          IFFY pipeline stages — data flows left to right
        </text>
      </svg>
    </div>
  );
}
