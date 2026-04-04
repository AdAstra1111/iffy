/**
 * SceneDemoPlannerPanel — Review surface for scene demo plans.
 *
 * Shows: planned demos, selected actors, wardrobe states, linked locked sets,
 * readiness/blocking, explicit vs inferred basis.
 */

import React from 'react';
import { useSceneDemoPlanner } from '@/hooks/useSceneDemoPlanner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown, Film, CheckCircle2, AlertCircle, XCircle,
  User, MapPin, Shirt, Sparkles,
} from 'lucide-react';
import { SCENE_DEMO_PURPOSES } from '@/lib/visual/sceneDemoPlanner';

interface Props {
  projectId: string | undefined;
}

export function SceneDemoPlannerPanel({ projectId }: Props) {
  const { plans, summary, isLoading, hasScenes, hasWardrobe } = useSceneDemoPlanner(projectId);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading scene demo plans...</div>;
  }

  if (!hasScenes) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <Film className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p>No scenes available. Extract scenes from script first.</p>
        </CardContent>
      </Card>
    );
  }

  if (!hasWardrobe) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <Shirt className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p>Extract wardrobe profiles first to enable scene demo planning.</p>
        </CardContent>
      </Card>
    );
  }

  const purposeLabel = (key: string) =>
    SCENE_DEMO_PURPOSES.find(p => p.key === key)?.label || key;

  const readinessIcon = (status: string) => {
    if (status === 'ready') return <CheckCircle2 className="h-4 w-4 text-primary" />;
    if (status === 'partial') return <AlertCircle className="h-4 w-4 text-accent" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-2 mb-2">
        <Film className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Scene Demo Plans</h3>
        <Badge variant="outline" className="text-xs">{summary.total} scenes</Badge>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{summary.ready} ready</Badge>
        <Badge variant="secondary">{summary.partial} partial</Badge>
        <Badge variant="secondary">{summary.blocked} blocked</Badge>
        <Badge variant="outline">{summary.unique_characters} characters</Badge>
        <Badge variant="outline">{summary.unique_purposes} purposes</Badge>
      </div>

      {/* Plans */}
      {plans.map((plan) => (
        <Collapsible key={plan.scene_demo_id} defaultOpen={false}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {readinessIcon(plan.readiness_status)}
                  <CardTitle className="text-sm font-medium truncate">
                    {plan.slugline || plan.scene_key || plan.scene_id.slice(0, 8)}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {purposeLabel(plan.scene_purpose)}
                  </Badge>
                  <Badge
                    variant={plan.purpose_basis === 'explicit' ? 'default' : 'secondary'}
                    className="text-[10px] shrink-0"
                  >
                    {plan.purpose_basis}
                  </Badge>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-0 pb-3 px-4 space-y-2">
                {/* Characters */}
                {plan.characters.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Characters</p>
                    {plan.characters.map((char) => (
                      <div key={char.character_key} className="flex items-center justify-between py-1 px-2 rounded bg-muted/30 text-xs">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{char.character_key}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {char.wardrobe_state_label}
                          </Badge>
                          <Badge
                            variant={char.state_basis === 'explicit' ? 'default' : 'secondary'}
                            className="text-[10px] px-1 py-0"
                          >
                            {char.state_basis}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          {char.costume_look_locked ? (
                            <Badge variant="default" className="text-[10px]">look locked</Badge>
                          ) : char.costume_look_set_id ? (
                            <Badge variant="secondary" className="text-[10px]">look unlocked</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">no look</Badge>
                          )}
                          {!char.actor_id && (
                            <Badge variant="destructive" className="text-[10px]">no actor</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Environment */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {plan.location_set_id && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <Badge variant={plan.location_set_locked ? 'default' : 'secondary'} className="text-[10px]">
                        Location {plan.location_set_locked ? 'locked' : 'unlocked'}
                      </Badge>
                    </div>
                  )}
                  {plan.atmosphere_set_id && (
                    <div className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-muted-foreground" />
                      <Badge variant={plan.atmosphere_set_locked ? 'default' : 'secondary'} className="text-[10px]">
                        Atmosphere {plan.atmosphere_set_locked ? 'locked' : 'unlocked'}
                      </Badge>
                    </div>
                  )}
                  {plan.motif_set_ids.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {plan.motif_set_ids.length} motif set(s)
                    </Badge>
                  )}
                </div>

                {/* Blocking reasons */}
                {plan.blocking_reasons.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider">Blockers</p>
                    {plan.blocking_reasons.map((reason, i) => (
                      <p key={i} className="text-[10px] text-destructive/80 pl-2">• {reason}</p>
                    ))}
                  </div>
                )}

                {/* Rationale */}
                <p className="text-[10px] text-muted-foreground italic mt-1">{plan.planning_rationale}</p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}
