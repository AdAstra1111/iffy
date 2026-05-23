import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DemoScriptUploadProps {
  className?: string;
}

export function DemoScriptUpload({ className }: DemoScriptUploadProps) {
  return (
    <Card className={cn('border-border/40', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground/70" />
          <CardTitle className="text-sm font-semibold text-foreground">
            Script Upload
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex flex-col items-center gap-3">
        {/* Placeholder area */}
        <div className="w-full border-2 border-dashed border-border/30 rounded-lg py-8 flex flex-col items-center gap-2 bg-muted/5">
          <div className="p-3 rounded-full bg-primary/10">
            <Upload className="h-6 w-6 text-primary/60" />
          </div>
          <p className="text-xs text-muted-foreground/60 text-center max-w-[200px]">
            Upload your script to begin analysis
          </p>
        </div>

        {/* Disabled button */}
        <Button variant="outline" disabled className="w-full text-xs">
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload Script
        </Button>
        <p className="text-[9px] text-muted-foreground/40 text-center">
          Coming in live mode
        </p>
      </CardContent>
    </Card>
  );
}

export default DemoScriptUpload;