import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface Stage {
  label: string;
  duration: number; // seconds
}

const STAGES: Stage[] = [
  { label: 'Extracting Atoms', duration: 3 },
  { label: 'Running Analysis', duration: 5 },
  { label: 'Generating Document', duration: 4 },
];

export function DemoDocGeneration({ className = '' }: { className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);

  const totalDuration = STAGES.reduce((sum, s) => sum + s.duration, 0);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= totalDuration) {
          clearInterval(interval);
          setRunning(false);
          return totalDuration;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, totalDuration]);

  const completedStages = STAGES.reduce<number>((count, stage) => {
    let cumulative = 0;
    for (const s of STAGES) {
      cumulative += s.duration;
      if (s === stage) break;
    }
    return elapsed >= cumulative ? count + 1 : count;
  }, -1);

  let cumulative = 0;
  const getStageStatus = (stageIdx: number) => {
    const stageEnd = cumulative + STAGES[stageIdx].duration;
    const isActive = elapsed > cumulative && elapsed < stageEnd;
    const isDone = elapsed >= stageEnd;
    cumulative += STAGES[stageIdx].duration;
    if (isDone) return 'done' as const;
    if (isActive) return 'active' as const;
    return 'pending' as const;
  };

  return (
    <div className={`border border-border/20 bg-card/30 rounded-lg p-4 ${className}`}>
      <h4 className="text-xs font-medium text-foreground mb-3">Document Generation</h4>
      <div className="space-y-2">
        {STAGES.map((stage, i) => {
          const status = getStageStatus(i);
          return (
            <motion.div
              key={stage.label}
              className="flex items-center gap-2.5"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              {/* Status icon */}
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                {status === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                ) : status === 'active' ? (
                  <Loader2 className="h-4 w-4 text-primary/70 animate-spin" />
                ) : (
                  <div className="h-3 w-3 rounded-full border border-border/30" />
                )}
              </div>
              {/* Label */}
              <span
                className={`text-[11px] ${
                  status === 'done'
                    ? 'text-green-400/80'
                    : status === 'active'
                    ? 'text-foreground'
                    : 'text-muted-foreground/40'
                }`}
              >
                {stage.label}
              </span>
              {/* Duration tag */}
              <span className="ml-auto text-[9px] font-mono text-muted-foreground/30">
                {stage.duration}s
              </span>
              {/* Progress bar for active stage */}
              {status === 'active' && (
                <div className="w-12 h-1 rounded-full bg-border/20 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-primary/40"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: stage.duration, ease: 'linear' }}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
      {/* Completion state */}
      {!running && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] text-green-400/60 mt-3 text-center"
        >
          Document generation complete
        </motion.p>
      )}
    </div>
  );
}
