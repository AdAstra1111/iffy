import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Search, AlertTriangle, FileOutput, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StageConfig {
  id: string;
  label: string;
  description: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  color: string;
}

const STAGES: StageConfig[] = [
  {
    id: 'intake',
    label: 'Script Intake',
    description: 'Parse and normalize screenplay format',
    icon: FileText,
    color: 'from-blue-500/20 to-blue-600/10',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Extract scenes, characters, and beats',
    icon: Search,
    color: 'from-violet-500/20 to-violet-600/10',
  },
  {
    id: 'obligation',
    label: 'Obligation Detection',
    description: 'Identify narrative promises and debts',
    icon: AlertTriangle,
    color: 'from-amber-500/20 to-amber-600/10',
  },
  {
    id: 'documentation',
    label: 'Documentation',
    description: 'Generate bibles, sheets, and briefs',
    icon: FileOutput,
    color: 'from-emerald-500/20 to-emerald-600/10',
  },
  {
    id: 'export',
    label: 'Export',
    description: 'Package deliverables for production',
    icon: Download,
    color: 'from-rose-500/20 to-rose-600/10',
  },
];

export interface DemoPipelineFlowProps {
  className?: string;
}

export function DemoPipelineFlow({ className }: DemoPipelineFlowProps) {
  return (
    <div className={cn('w-full overflow-x-auto py-4', className)}>
      <div className="flex items-center justify-center min-w-[640px] px-4">
        {STAGES.map((stage, index) => {
          const Icon = stage.icon;
          const isLast = index === STAGES.length - 1;
          return (
            <React.Fragment key={stage.id}>
              {/* Stage Card */}
              <Card
                className={cn(
                  'relative flex-shrink-0 w-44 border-border/40 bg-gradient-to-br',
                  stage.color,
                  'hover:border-primary/30 transition-all duration-300 group',
                )}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="p-2 rounded-full bg-background/60 ring-1 ring-border/20 group-hover:ring-primary/20 transition-all">
                    <Icon className="h-5 w-5 text-foreground/70 group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{stage.label}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">
                      {stage.description}
                    </p>
                  </div>
                  {/* Stage number badge */}
                  <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary/20 border border-border/30 flex items-center justify-center">
                    <span className="text-[9px] font-mono font-bold text-primary/70">
                      {index + 1}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Animated arrow connector */}
              {!isLast && (
                <div className="flex-shrink-0 flex items-center mx-2">
                  <svg
                    width="40"
                    height="24"
                    viewBox="0 0 40 24"
                    className="overflow-visible"
                  >
                    <defs>
                      <marker
                        id={`arrowhead-${index}`}
                        markerWidth="8"
                        markerHeight="6"
                        refX="8"
                        refY="3"
                        orient="auto"
                      >
                        <polygon
                          points="0 0, 8 3, 0 6"
                          className="fill-muted-foreground/30"
                        />
                      </marker>
                    </defs>
                    {/* Dashed line */}
                    <line
                      x1="2"
                      y1="12"
                      x2="36"
                      y2="12"
                      stroke="currentColor"
                      className="text-muted-foreground/20"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      markerEnd={`url(#arrowhead-${index})`}
                    />
                    {/* Animated dot */}
                    <circle r="2.5" className="fill-primary/40">
                      <animateMotion
                        dur={`${STAGES.length * 0.8}s`}
                        repeatCount="indefinite"
                        begin={`${index * 0.8}s`}
                        path="M2,12 L36,12"
                      />
                    </circle>
                    {/* Pulsing glow on the arrow */}
                    <circle cx="36" cy="12" r="3" className="fill-primary/20">
                      <animate
                        attributeName="r"
                        values="2;4;2"
                        dur="1.5s"
                        repeatCount="indefinite"
                        begin={`${index * 0.5}s`}
                      />
                      <animate
                        attributeName="opacity"
                        values="0.3;0.6;0.3"
                        dur="1.5s"
                        repeatCount="indefinite"
                        begin={`${index * 0.5}s`}
                      />
                    </circle>
                  </svg>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default DemoPipelineFlow;