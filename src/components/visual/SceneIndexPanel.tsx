/**
 * SceneIndexPanel — Minimal read-only scene index display.
 * Shows: scene number, title, location, characters, wardrobe states.
 */

import React from 'react';
import { useSceneIndex } from '@/hooks/useSceneIndex';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Users, RefreshCw } from 'lucide-react';
import { VisualSkeleton } from './VisualSkeleton';
import { VisualEmptyState } from './VisualEmptyState';
import { VisualPanelErrorBoundary } from './VisualPanelErrorBoundary';

interface SceneIndexPanelProps {
  projectId: string;
}

export const SceneIndexPanel: React.FC<SceneIndexPanelProps> = ({ projectId }) => {
  const { scenes, isLoading, isExtracting, extractSceneIndex } = useSceneIndex(projectId);

  const handleExtract = () => {
    extractSceneIndex();
  };

  if (isLoading) {
    return <VisualSkeleton variant="table-row" />;
  }

  return (
    <VisualPanelErrorBoundary panelLabel="SceneIndexPanel">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Scene Index</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExtract}
            disabled={isExtracting}
          >
            {isExtracting ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Extracting…</>
            ) : (
              <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Extract Scenes</>
            )}
          </Button>
        </div>

      {scenes.length === 0 ? (
        <VisualEmptyState
          title="No scene index yet"
          description='Click "Extract Scenes" to generate from your script.'
        />
      ) : (
        <div className="space-y-2">
          {scenes.map((scene) => (
            <Card key={scene.id} className="border-border/50">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-mono">
                    #{scene.scene_number}
                  </Badge>
                  <CardTitle className="text-sm font-medium text-foreground truncate">
                    {scene.title || `Scene ${scene.scene_number}`}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {scene.location_key && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="font-mono">{scene.location_key}</span>
                  </div>
                )}
                <div className="flex items-start gap-1.5">
                  <Users className="h-3 w-3 mt-0.5 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1">
                    {scene.character_keys.map((ck) => (
                      <Badge key={ck} variant="outline" className="text-xs">
                        {ck}
                        {scene.wardrobe_state_map[ck] && scene.wardrobe_state_map[ck] !== 'default' && (
                          <span className="ml-1 text-muted-foreground">
                            ({scene.wardrobe_state_map[ck]})
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </VisualPanelErrorBoundary>
  );
};
