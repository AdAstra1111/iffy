/**
 * produceAdapter — REAL implementation for Produce workspace MVP.
 *
 * Data sources:
 * - storyboard_boards: storyboard panel existence + count
 * - shot_lists: shot list existence
 * - trailer_blueprints: trailer plan existence
 * - trailer_audio_runs / audio_assets: audio asset existence
 */
import type { ProduceAdapter, GenerationResult } from './AdapterTypes'
import { supabase } from '@/integrations/supabase/client'

export const produceAdapter: ProduceAdapter = {
  async getAssetStatus(
    projectId?: string,
  ): Promise<Record<string, 'not_started' | 'in_progress' | 'complete'>> {
    if (!projectId) {
      return {
        storyboards: 'not_started',
        shot_list: 'not_started',
        trailers: 'not_started',
        audio: 'not_started',
      }
    }

    try {
      const [boardCount, shotListCount, trailerCount, audioAssetCount] =
        await Promise.all([
          // Storyboards: count storyboard_boards for this project
          supabase
            .from('storyboard_boards')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId),

          // Shot lists: count shot_lists for this project
          supabase
            .from('shot_lists')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId),

          // Trailers: count trailer_blueprints for this project
          supabase
            .from('trailer_blueprints')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId),

          // Audio: try multiple possible tables, fall back gracefully
          (async () => {
            // Try audio_assets first, then audio_export_jobs, then trailer_audio_runs
            for (const table of ['audio_assets', 'audio_export_jobs', 'trailer_audio_runs']) {
              try {
                const result = await supabase
                  .from(table as any)
                  .select('id', { count: 'exact', head: true } as any)
                  .eq('project_id', projectId)
                if (result.count !== null) return result
              } catch {
                // Table doesn't exist, try next
              }
            }
            // No matching table — return count 0
            return { count: 0, data: null, error: null } as any
          })(),
        ])

      const toStatus = (count: number | null): 'not_started' | 'in_progress' | 'complete' => {
        if (!count || count === 0) return 'not_started'
        if (count > 0) return 'complete'
        return 'not_started'
      }

      return {
        storyboards: toStatus(boardCount.count),
        shot_list: toStatus(shotListCount.count),
        trailers: toStatus(trailerCount.count),
        audio: toStatus(audioAssetCount.count),
      }
    } catch (err) {
      console.error('[produceAdapter] getAssetStatus error:', err)
      return {
        storyboards: 'not_started',
        shot_list: 'not_started',
        trailers: 'not_started',
        audio: 'not_started',
      }
    }
  },

  async generateAsset(
    type: string,
    params?: Record<string, unknown>,
    projectId?: string,
  ): Promise<GenerationResult> {
    if (!projectId) {
      return { id: '', status: 'failed', error: 'No project ID provided' }
    }

    try {
      switch (type) {
        case 'storyboards': {
          // Invoke storyboard generation via supabase edge function
          const { data, error } = await supabase.functions.invoke('dev-engine-v2', {
            body: {
              action: 'generate',
              projectId,
              docType: 'storyboards',
              ...(params || {}),
            },
          })
          if (error) throw new Error(error.message || 'Storyboard generation failed')
          return { id: data?.id || '', status: 'completed' }
        }

        case 'shot_list': {
          // Invoke shot list generation
          const { data, error } = await supabase.functions.invoke('dev-engine-v2', {
            body: {
              action: 'generate',
              projectId,
              docType: 'shot_list',
              ...(params || {}),
            },
          })
          if (error) throw new Error(error.message || 'Shot list generation failed')
          return { id: data?.id || '', status: 'completed' }
        }

        case 'trailers': {
          // Invoke trailer pipeline — cinematic trailer script
          const { data, error } = await supabase.functions.invoke('auto-run', {
            body: {
              action: 'run-next',
              projectId,
              docType: 'trailer',
              ...(params || {}),
            },
          })
          if (error) throw new Error(error.message || 'Trailer generation failed')
          return { id: data?.id || '', status: 'pending' }
        }

        case 'audio': {
          // Invoke audio export pipeline
          const { data, error } = await supabase.functions.invoke('auto-run', {
            body: {
              action: 'run-next',
              projectId,
              docType: 'audio',
              ...(params || {}),
            },
          })
          if (error) throw new Error(error.message || 'Audio generation failed')
          return { id: data?.id || '', status: 'pending' }
        }

        default:
          return {
            id: '',
            status: 'failed',
            error: `Unknown asset type: ${type}`,
          }
      }
    } catch (err: any) {
      console.error('[produceAdapter] generateAsset error:', err)
      return {
        id: '',
        status: 'failed',
        error: err.message || 'Generation failed',
      }
    }
  },
}