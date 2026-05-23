import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface PipelineStage {
  id: string;
  label: string;
  description: string;
  status: 'completed' | 'active' | 'pending';
  x: number;
  y: number;
}

const STAGES: PipelineStage[] = [
  { id: 'script', label: 'Script Intake', description: 'Ingest & parse screenplay', status: 'completed', x: 60, y: 180 },
  { id: 'extract', label: 'Extraction', description: 'Characters, locations, scenes', status: 'completed', x: 220, y: 100 },
  { id: 'analyse', label: 'Analysis', description: 'NEC + obligation topology', status: 'active', x: 380, y: 180 },
  { id: 'engine', label: 'Dev Engine', description: 'Generate treatments, bibles', status: 'pending', x: 540, y: 100 },
  { id: 'lock', label: 'Production Lock', description: 'Locked for production', status: 'pending', x: 700, y: 180 },
];

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
];

export function DemoPipelineFlow({ className = '' }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  return (
    <div className={`relative ${className}`}>
      <svg ref={svgRef} viewBox="0 0 760 280" className="w-full h-auto" style={{ minHeight: 240 }}>
        {CONNECTIONS.map(([from, to]) => {
          const f = STAGES[from];
          const t = STAGES[to];
          const cx = (f.x + t.x) / 2;
          const cy = (f.y + t.y) / 2 - 30;
          return (
            <motion.path
              key={`conn-${from}-${to}`}
              d={`M ${f.x + 30} ${f.y} Q ${cx} ${cy} ${t.x - 30} ${t.y}`}
              fill="none"
              stroke={f.status === 'completed' ? '#22c55e' : f.status === 'active' ? '#a855f7' : '#333'}
              strokeWidth={2}
              strokeDasharray={f.status === 'pending' ? '6 4' : 'none'}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5, ease: 'easeInOut' }}
            />
          );
        })}

        {STAGES.map((stage, i) => (
          <motion.g
            key={stage.id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.2, duration: 0.5 }}
          >
            {/* Glow for active */}
            {stage.status === 'active' && (
              <circle cx={stage.x} cy={stage.y} r={32} fill="none" stroke="#a855f7" strokeWidth={1} opacity={0.4}>
                <animate attributeName="r" values="32;38;32" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Stage circle */}
            <circle
              cx={stage.x} cy={stage.y} r={24}
              fill={
                stage.status === 'completed' ? '#22c55e' :
                stage.status === 'active' ? '#a855f7' :
                '#1e293b'
              }
              stroke={
                stage.status === 'completed' ? '#22c55e' :
                stage.status === 'active' ? '#c084fc' :
                '#334155'
              }
              strokeWidth={2}
            />
            {/* Checkmark or number */}
            {stage.status === 'completed' ? (
              <text x={stage.x} y={stage.y + 1} textAnchor="middle" dominantBaseline="middle" fill="black" fontSize={14} fontWeight="bold">✓</text>
            ) : stage.status === 'active' ? (
              <text x={stage.x} y={stage.y + 4} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={10} fontWeight="bold">▶</text>
            ) : (
              <text x={stage.x} y={stage.y + 1} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize={12} fontWeight="bold">{i + 1}</text>
            )}
            {/* Label */}
            <text x={stage.x} y={stage.y + 42} textAnchor="middle" fill={
              stage.status === 'completed' ? '#86efac' :
              stage.status === 'active' ? '#c084fc' :
              '#475569'
            } fontSize={13} fontWeight="medium">{stage.label}</text>
            {/* Description */}
            <text x={stage.x} y={stage.y + 58} textAnchor="middle" fill="#475569" fontSize={10}>{stage.description}</text>
          </motion.g>
        ))}

        {/* Data flow indicator */}
        <motion.rect
          x={320} y={230} width={120} height={28} rx={6}
          fill="#1e293b" stroke="#334155" strokeWidth={1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        />
        <text x={380} y={249} textAnchor="middle" fill="#94a3b8" fontSize={10}>Data flows right</text>
      </svg>
    </div>
  );
}