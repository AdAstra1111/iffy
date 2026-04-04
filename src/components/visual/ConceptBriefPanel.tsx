/**
 * ConceptBriefPanel — Executive Concept Brief workspace.
 * Curates ≤8 investor-ready images into narrative sections.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileBarChart, Loader2, RefreshCw, Image, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildConceptBrief,
  persistConceptBrief,
  BRIEF_SECTION_LABELS,
  BRIEF_SECTION_ORDER,
  type BriefSection,
} from '@/lib/visual/conceptBriefEngine';
import type { ProjectImage } from '@/lib/images/types';

interface ConceptBriefPanelProps {
  projectId: string;
}

export function ConceptBriefPanel({ projectId }: ConceptBriefPanelProps) {
  const [isBuilding, setIsBuilding] = useState(false);
  const queryClient = useQueryClient();

  // Fetch latest concept brief
  const { data: brief, isLoading } = useQuery({
    queryKey: ['concept-brief', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('concept_brief_versions')
        .select('*')
        .eq('project_id', projectId)
        .order('version_number', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!data?.length) return null;

      const brief = data[0];
      // Hydrate image URLs
      const imageIds = (brief.image_selections || []).map((s: any) => s.image_id);
      if (!imageIds.length) return { ...brief, images: {} };

      const { data: images } = await (supabase as any)
        .from('project_images')
        .select('*')
        .in('id', imageIds);

      for (const img of (images || [])) {
        try {
          const bucket = img.storage_bucket || 'project-posters';
          const { data: signed } = await supabase.storage
            .from(bucket)
            .createSignedUrl(img.storage_path, 3600);
          img.signedUrl = signed?.signedUrl;
        } catch { img.signedUrl = null; }
      }

      const imageMap = new Map((images || []).map((i: any) => [i.id, i]));
      return { ...brief, imageMap };
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const handleBuild = async () => {
    setIsBuilding(true);
    try {
      const { data: images } = await (supabase as any)
        .from('project_images')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .in('asset_group', ['hero_frame', 'character', 'world', 'key_moment']);

      if (!images?.length) {
        toast.error('No governed images available for concept brief');
        return;
      }

      const result = buildConceptBrief(images as ProjectImage[]);
      if (result.selections.length === 0) {
        toast.warning('No images passed the quality gate for concept brief');
        return;
      }

      await persistConceptBrief(projectId, result);
      await queryClient.invalidateQueries({ queryKey: ['concept-brief', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-cb-state', projectId] });
      toast.success(`Concept Brief built with ${result.selections.length} images across ${result.scoringSummary.sectionCoverage} sections`);
    } catch (err: any) {
      toast.error('Failed to build concept brief');
      console.error('[CONCEPT_BRIEF_PANEL]', err);
    } finally {
      setIsBuilding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Executive Concept Brief</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Curated investor-ready visual package — up to 8 premium images
          </p>
        </div>
        <Button
          onClick={handleBuild}
          disabled={isBuilding}
          variant="default"
          size="sm"
        >
          {isBuilding ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Building…</>
          ) : brief ? (
            <><RefreshCw className="w-4 h-4 mr-2" />Rebuild Brief</>
          ) : (
            <><FileBarChart className="w-4 h-4 mr-2" />Build Concept Brief</>
          )}
        </Button>
      </div>

      {brief ? (
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <Badge variant="secondary">v{brief.version_number}</Badge>
            <span className="text-sm text-muted-foreground">
              {brief.scoring_summary?.selected ?? 0} images · {brief.scoring_summary?.sectionCoverage ?? 0}/6 sections covered
            </span>
            {(brief.scoring_summary?.sectionCoverage ?? 0) >= 5 && (
              <Badge className="bg-primary/10 text-primary border-primary/20">
                <CheckCircle className="w-3 h-3 mr-1" /> Strong Coverage
              </Badge>
            )}
          </div>

          {/* Sections */}
          {BRIEF_SECTION_ORDER.map((sectionKey) => {
            const sectionImages = (brief.image_selections || []).filter(
              (s: any) => s.section === sectionKey
            );
            if (sectionImages.length === 0) return null;

            return (
              <div key={sectionKey} className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  {BRIEF_SECTION_LABELS[sectionKey as BriefSection]}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sectionImages.map((sel: any) => {
                    const img = brief.imageMap?.get(sel.image_id);
                    return (
                      <div
                        key={sel.image_id}
                        className="relative rounded-lg border border-border overflow-hidden bg-card"
                      >
                        {img?.signedUrl ? (
                          <img
                            src={img.signedUrl}
                            alt={`${BRIEF_SECTION_LABELS[sectionKey as BriefSection]} image`}
                            className="w-full aspect-video object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-video bg-muted flex items-center justify-center">
                            <Image className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm text-xs">
                            Score: {sel.score}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          <FileBarChart className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No concept brief yet</p>
          <p className="text-xs mt-1">Click "Build Concept Brief" to curate your best images into an investor-ready package</p>
        </div>
      )}
    </div>
  );
}
