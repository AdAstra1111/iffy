/**
 * PosterPanel — Poster Candidates workspace.
 * Selects top commercially viable images from governed pools.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Image, Loader2, RefreshCw, Star, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { selectPosterCandidates, persistPosterCandidates } from '@/lib/visual/posterEngine';
import type { ProjectImage } from '@/lib/images/types';

interface PosterPanelProps {
  projectId: string;
}

export function PosterPanel({ projectId }: PosterPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  // Fetch existing poster candidates
  const { data: candidates, isLoading } = useQuery({
    queryKey: ['poster-candidates', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('poster_candidates')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'candidate')
        .order('rank_position', { ascending: true });
      if (error) throw error;

      // Hydrate signed URLs for source images
      if (!data?.length) return [];
      const imageIds = data.map((c: any) => c.source_image_id);
      const { data: images } = await (supabase as any)
        .from('project_images')
        .select('*')
        .in('id', imageIds);

      // Sign URLs
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
      return data.map((c: any) => ({
        ...c,
        image: imageMap.get(c.source_image_id) || null,
      }));
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Fetch all governed hero frames + active images
      const { data: images } = await (supabase as any)
        .from('project_images')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .in('asset_group', ['hero_frame', 'character', 'world', 'key_moment']);

      if (!images?.length) {
        toast.error('No governed images available for poster selection');
        return;
      }

      const results = selectPosterCandidates(images as ProjectImage[], 3);
      if (results.length === 0) {
        toast.warning('No images passed the quality gate for poster candidacy');
        return;
      }

      await persistPosterCandidates(projectId, results);
      await queryClient.invalidateQueries({ queryKey: ['poster-candidates', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-poster-state', projectId] });
      toast.success(`${results.length} poster candidate${results.length !== 1 ? 's' : ''} selected`);
    } catch (err: any) {
      toast.error('Failed to generate poster candidates');
      console.error('[POSTER_PANEL]', err);
    } finally {
      setIsGenerating(false);
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
          <h2 className="text-xl font-semibold text-foreground">Poster Candidates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Top commercially viable images selected from governed pools
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          variant="default"
          size="sm"
        >
          {isGenerating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Selecting…</>
          ) : candidates?.length ? (
            <><RefreshCw className="w-4 h-4 mr-2" />Re-select</>
          ) : (
            <><Trophy className="w-4 h-4 mr-2" />Select Poster Candidates</>
          )}
        </Button>
      </div>

      {candidates?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {candidates.map((c: any) => (
            <div
              key={c.id}
              className="relative rounded-lg border border-border overflow-hidden bg-card"
            >
              {c.image?.signedUrl ? (
                <img
                  src={c.image.signedUrl}
                  alt={`Poster candidate #${c.rank_position}`}
                  className="w-full aspect-[2/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
                  <Image className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="absolute top-2 left-2 flex gap-1">
                <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                  <Star className="w-3 h-3 mr-1" />
                  #{c.rank_position}
                </Badge>
              </div>
              <div className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Score: {c.total_score}</span>
                </div>
                {c.score_json && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(c.score_json).filter(([k]) => k !== 'total').map(([key, val]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key.replace(/_/g, ' ')}: {String(val)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          <Image className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No poster candidates yet</p>
          <p className="text-xs mt-1">Click "Select Poster Candidates" to identify top images from your governed pool</p>
        </div>
      )}
    </div>
  );
}
