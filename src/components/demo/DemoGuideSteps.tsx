import { motion } from 'framer-motion';
import { FolderPlus, Upload, BarChart3, Search } from 'lucide-react';

interface Step {
  number: number;
  title: string;
  description: string;
  icon: typeof FolderPlus;
}

const STEPS: Step[] = [
  { number: 1, title: 'Add a Project', description: 'Create a new project for your screenplay', icon: FolderPlus },
  { number: 2, title: 'Upload a Screenplay', description: 'Import .fountain or .fdx files', icon: Upload },
  { number: 3, title: 'Run Analysis', description: 'Atom extraction and topology mapping', icon: BarChart3 },
  { number: 4, title: 'Explore Results', description: 'Review obligations, characters, and beats', icon: Search },
];

export function DemoGuideSteps({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-0 ${className}`}>
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <motion.div
            key={step.number}
            className="flex items-start gap-3 relative pb-5 last:pb-0"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1, duration: 0.35 }}
          >
            {/* Timeline connector */}
            {i < STEPS.length - 1 && (
              <div className="absolute left-[14px] top-[30px] bottom-0 w-px bg-border/20" />
            )}

            {/* Number circle with icon */}
            <div className="shrink-0 w-7 h-7 rounded-full border border-border/30 bg-card/40 flex items-center justify-center z-10">
              <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground/40">0{step.number}</span>
                <h5 className="text-sm font-medium text-foreground">{step.title}</h5>
              </div>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">{step.description}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
