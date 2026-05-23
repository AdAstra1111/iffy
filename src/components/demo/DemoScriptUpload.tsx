import { useCallback, useState } from 'react';
import { Upload, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DemoScriptUpload({ className = '' }: { className?: string }) {
  const [uploaded, setUploaded] = useState(false);

  const handleUpload = useCallback(() => {
    setUploaded(true);
    setTimeout(() => {
      console.log('Mock upload success — script ingested');
    }, 0);
  }, []);

  return (
    <div className={`border border-border/20 bg-card/30 rounded-lg p-4 ${className}`}>
      {!uploaded ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="p-3 rounded-full bg-primary/10">
            <Upload className="h-6 w-6 text-primary/60" />
          </div>
          <p className="text-xs text-muted-foreground/60 text-center">
            Drop a screenplay (.fountain, .fdx) or paste text
          </p>
          <Button
            variant="outline"
            size="sm"
            className="border-primary/30 text-[11px] hover:bg-primary/5 mt-1"
            onClick={handleUpload}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Upload Script
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 py-3">
          <div className="p-2 rounded-full bg-green-500/10">
            <FileCheck className="h-5 w-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Script uploaded</p>
            <p className="text-[11px] text-muted-foreground/60">cyberpunk_thriller_v2.fountain — 112 pages</p>
          </div>
          <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={() => setUploaded(false)}>
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}
