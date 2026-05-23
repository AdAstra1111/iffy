import { motion } from 'framer-motion';
import { Play, CheckCircle2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const GUIDE_STEPS = [
  { step: 1, title: 'Upload a script', desc: 'Drop a screenplay file or paste text — IFFY extracts everything automatically.', done: true },
  { step: 2, title: 'Analyse your story', desc: 'View obligation topology, character arcs, and narrative pressure per scene.', done: true },
  { step: 3, title: 'Generate documents', desc: 'One-click treatment, character bible, beat sheet, and market sheet.', done: false },
  { step: 4, title: 'Review & refine', desc: 'Add notes, apply changes section by section with AI-assisted rewrites.', done: false },
  { step: 5, title: 'Pack & present', desc: 'Share with buyers, investors, and collaborators in a single pack.', done: false },
];

export function DemoGuideSteps({ className = '' }: { className?: string }) {
  const navigate = useNavigate();

  return (
    <div className={`space-y-2 ${className}`}>
      {GUIDE_STEPS.map((step, i) => (
        <motion.div
          key={step.step}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className="flex items-start gap-3 p-2.5 rounded-lg border border-border/10 hover:border-border/30 transition-colors"
        >
          <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            step.done ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'
          }`}>
            {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.step}
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-medium text-foreground">{step.title}</h5>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{step.desc}</p>
          </div>
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="pt-2"
      >
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs border-primary/30 hover:bg-primary/5"
          onClick={() => navigate('/demo/guided')}
        >
          <Play className="h-3.5 w-3.5 mr-1" />
          Start full guided demo
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </motion.div>
    </div>
  );
}