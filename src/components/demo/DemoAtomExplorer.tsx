import { motion } from 'framer-motion';
import { Users, Target, Film, MessageSquare, Shirt, Bug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AtomType {
  label: string;
  icon: typeof Users;
  description: string;
}

const ATOM_TYPES: AtomType[] = [
  { label: 'Character', icon: Users, description: 'Protagonists, antagonists, supporting roles' },
  { label: 'Theme', icon: Target, description: 'Core themes, motifs, symbolic threads' },
  { label: 'Genre', icon: Film, description: 'Genre tags, tonal markers, sub-genres' },
  { label: 'Dialogue', icon: MessageSquare, description: 'Dialogue patterns, register, subtext' },
  { label: 'Costume', icon: Shirt, description: 'Costume notes, wardrobe arcs, style cues' },
  { label: 'Creature', icon: Bug, description: 'Creature designs, species, VFX annotations' },
];

export function DemoAtomExplorer({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="grid grid-cols-2 gap-2.5">
        {ATOM_TYPES.map((atom, i) => {
          const Icon = atom.icon;
          return (
            <motion.div
              key={atom.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className="border border-border/20 bg-card/30 rounded-lg p-3 hover:border-border/40 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1.5 rounded-md bg-primary/10 group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-4 w-4 text-primary/60" />
                </div>
                <span className="text-xs font-medium text-foreground">{atom.label}</span>
                <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4">
                  3 items loaded
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground/60 pl-8">{atom.description}</p>
            </motion.div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground/40 text-center">
        Atom extraction is automatic — each atom is independently versioned and lockable.
      </p>
    </div>
  );
}
