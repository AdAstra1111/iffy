import { motion } from 'framer-motion';
import { FileOutput, FileText, BookOpen, ScrollText } from 'lucide-react';

const DOCS = [
  { icon: ScrollText, label: 'Treatment', desc: 'Act-by-act narrative summary', color: 'from-blue-500/20 to-blue-600/10', iconColor: 'text-blue-400' },
  { icon: BookOpen, label: 'Character Bible', desc: '14 characters with arcs', color: 'from-purple-500/20 to-purple-600/10', iconColor: 'text-purple-400' },
  { icon: FileText, label: 'Beat Sheet', desc: '78 scenes analysed', color: 'from-amber-500/20 to-amber-600/10', iconColor: 'text-amber-400' },
  { icon: FileOutput, label: 'Market Sheet', desc: 'Territory & financing', color: 'from-green-500/20 to-green-600/10', iconColor: 'text-green-400' },
];

export function DemoDocGeneration({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="grid grid-cols-2 gap-2">
        {DOCS.map((doc, i) => (
          <motion.div
            key={doc.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-3 rounded-lg border border-border/20 bg-gradient-to-br hover:from-card/80 hover:to-card/40 transition-colors cursor-pointer group"
            style={{ backgroundImage: `linear-gradient(135deg, ${doc.color})` }}
          >
            <doc.icon className={`h-5 w-5 ${doc.iconColor} mb-1.5 group-hover:scale-110 transition-transform`} />
            <h5 className="text-xs font-medium text-foreground mb-0.5">{doc.label}</h5>
            <p className="text-[10px] text-muted-foreground/60">{doc.desc}</p>
          </motion.div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/40 text-center pt-1">AI generates all documents from your uploaded script — one click each.</p>
    </div>
  );
}