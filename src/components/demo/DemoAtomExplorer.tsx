import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Layers,
  MapPin,
  Package,
  Palette,
  PlayCircle,
  Link2,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AtomCategory {
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  description: string;
}

const ATOM_CATEGORIES: AtomCategory[] = [
  {
    label: 'Character',
    icon: User,
    description: 'Protagonists, antagonists, supporting cast',
  },
  {
    label: 'Location',
    icon: MapPin,
    description: 'Settings, environments, spatial anchors',
  },
  {
    label: 'Prop',
    icon: Package,
    description: 'Objects, artifacts, significant items',
  },
  {
    label: 'Theme',
    icon: Palette,
    description: 'Core motifs, symbolic threads, arcs',
  },
  {
    label: 'Beat',
    icon: PlayCircle,
    description: 'Story beats, plot points, turning moments',
  },
  {
    label: 'Relationship',
    icon: Link2,
    description: 'Character dynamics, alliances, conflicts',
  },
];

export interface DemoAtomExplorerProps {
  className?: string;
}

export function DemoAtomExplorer({ className }: DemoAtomExplorerProps) {
  return (
    <Card className={cn('border-border/40', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground/70" />
          <CardTitle className="text-sm font-semibold text-foreground">
            Atom Explorer
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="grid grid-cols-2 gap-2">
          {ATOM_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Card
                key={cat.label}
                className="border-border/20 bg-muted/5 hover:border-border/40 transition-colors"
              >
                <CardContent className="p-2.5 flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-primary/10">
                    <Icon className="h-3.5 w-3.5 text-primary/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-foreground">
                      {cat.label}
                    </p>
                    <p className="text-[8px] text-muted-foreground/50 truncate">
                      {cat.description}
                    </p>
                  </div>
                  {/* Placeholder count badge */}
                  <Badge
                    variant="secondary"
                    className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground/50"
                  >
                    &mdash;
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default DemoAtomExplorer;