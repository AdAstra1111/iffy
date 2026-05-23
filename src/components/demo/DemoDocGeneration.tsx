import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocPlaceholder {
  title: string;
  description: string;
  status: 'Ready' | 'Pending';
}

const PLACEHOLDER_DOCS: DocPlaceholder[] = [
  {
    title: 'Concept Brief',
    description: 'High-level narrative summary and tone',
    status: 'Ready',
  },
  {
    title: 'Market Sheet',
    description: 'Genre positioning and comp titles',
    status: 'Pending',
  },
  {
    title: 'Character Bible',
    description: 'Protagonist and supporting cast profiles',
    status: 'Pending',
  },
];

export interface DemoDocGenerationProps {
  className?: string;
}

export function DemoDocGeneration({ className }: DemoDocGenerationProps) {
  return (
    <Card className={cn('border-border/40', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground/70" />
          <CardTitle className="text-sm font-semibold text-foreground">
            Document Generation
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex flex-col gap-2">
        {PLACEHOLDER_DOCS.map((doc) => (
          <Card
            key={doc.title}
            className="border-border/20 bg-muted/5"
          >
            <CardContent className="p-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {doc.title}
                </p>
                <p className="text-[10px] text-muted-foreground/60 truncate">
                  {doc.description}
                </p>
              </div>
              <Badge
                variant={doc.status === 'Ready' ? 'default' : 'secondary'}
                className={cn(
                  'text-[9px] px-2 py-0 h-5 shrink-0 ml-2',
                  doc.status === 'Ready'
                    ? 'bg-green-500/15 text-green-400 hover:bg-green-500/20'
                    : 'text-muted-foreground/50',
                )}
              >
                {doc.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

export default DemoDocGeneration;