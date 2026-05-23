import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DemoScriptUpload({ className = '' }: { className?: string }) {
  const [uploaded, setUploaded] = useState(false);

  return (
    <div className={`p-4 rounded-lg border border-border/30 bg-card/50 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-primary/10 shrink-0">
          <FileText className="h-5 w-5 text-primary/70" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground mb-1">Script Intake</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Upload a screenplay — IFFY extracts characters, locations, and story beats automatically.
          </p>
          {!uploaded ? (
            <div className="border-2 border-dashed border-border/30 rounded-lg p-4 text-center hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setUploaded(true)}>
              <Upload className="h-6 w-6 text-muted-foreground/50 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground/60">Click to simulate upload</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1">.fdx, .fountain, .pdf, .docx</p>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 rounded-lg p-3">
              <CheckCircle2 className="h-4 w-4" />
              <span>SHADOW_PROTOCOL_v3.fdx — 112 pages, 78 scenes, 14 characters extracted</span>
              <Button variant="ghost" size="sm" className="ml-auto text-xs h-7" onClick={() => setUploaded(false)}>Clear</Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}