import { motion } from 'framer-motion';
import { Atom, Users, MapPin, Brain } from 'lucide-react';

const ATOM_CATEGORIES = [
  { icon: Users, label: 'Characters', count: 14, desc: 'Roles, traits, arcs, relationships', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { icon: MapPin, label: 'Locations', count: 23, desc: 'Sets, exteriors, interiors', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { icon: Brain, label: 'Plot Threads', count: 7, desc: 'A-plot, B-plot, subtext', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { icon: Atom, label: 'Emotional Beats', count: 42, desc: 'Tension, obligation, intimacy', color: 'text-amber-400', bg: 'bg-amber-500/10' },
];

export function DemoAtomExplorer({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="grid grid-cols-2 gap-2">
        {ATOM_CATEGORIES.map((cat, i) => (
          <motion.div
            key={cat.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="p-3 rounded-lg border border-border/20 group hover:border-border/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`p-1.5 rounded ${cat.bg}`}>
                <cat.icon className={`h-4 w-4 ${cat.color}`} />
              </div>
              <span className="text-sm font-medium text-foreground">{cat.label}</span>
              <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{cat.count}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 pl-9">{cat.desc}</p>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center gap-2 p-2 rounded bg-primary/5 text-[10px] text-muted-foreground/70"
      >
        <Brain className="h-3 w-3 text-primary/60" />
        <span>Atom grid ready for production — each atom independently locked and versioned</span>
      </motion.div>
    </div>
  );
}