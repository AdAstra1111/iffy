// AudioExportPage — /projects/:id/audio-export
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Play, CheckCircle2, XCircle, Download, AlertCircle, Info } from 'lucide-react';
import { Header } from '@/components/Header';
import { PageTransition } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProjects';
import { useAudioExport, type AudioJob, type AudioJobOptions } from '@/hooks/useAudioExport';

// ── Types ─────────────────────────────────────────────────────────────────
type Quality = 'draft' | 'production';
type Range = 'full' | 'acts' | 'episodes';

const LAYER_INFO = {
  dialogue: {
    label: 'Dialogue',
    description: 'Character voices via ElevenLabs TTS — per-line emotional delivery',
    icon: '🎙️',
    requires: 'ElevenLabs API key (confirmed)',
    recommended: true,
  },
  sound: {
    label: 'Sound Design',
    description: 'Scene-matched ambient beds from Freesound.org CC library',
    icon: '🔊',
    requires: 'Freesound API key (optional)',
    recommended: true,
  },
  music: {
    label: 'Music',
    description: 'Mood-reactive score — programmatic or AIVA-generated',
    icon: '🎵',
    requires: 'AIVA API key (pending)',
    recommended: false,
  },
  mix: {
    label: 'Mix & Master',
    description: 'FFmpeg assembly into M4B with chapter markers and loudness normalization',
    icon: '🎛️',
    requires: 'None (ffmpeg)',
    recommended: true,
  },
} as const;

const QUALITY_INFO = {
  draft: {
    label: 'Draft',
    description: 'Fast — eleven_turbo_v2, 128kbps, no retry. ~2min per episode.',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  production: {
    label: 'Production',
    description: 'Full quality — eleven_multilingual_v2, 256kbps, retry, full sound library. ~8min per episode.',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
} as const;

// ── Main component ─────────────────────────────────────────────────────────
export default function AudioExportPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { project } = useProject(projectId);
  const { loading: exporting, pollingJob, startExport, startPolling } = useAudioExport();

  // ── Form state ──────────────────────────────────────────────────────────
  const [layers, setLayers] = useState({
    dialogue: true,
    sound: true,
    music: false,
    mix: true,
  });

  const [quality, setQuality] = useState<Quality>('draft');
  const [range, setRange] = useState<Range>('full');
  const [voiceOverrides, setVoiceOverrides] = useState<Record<string, string>>({});

  // ── Derived state ───────────────────────────────────────────────────────
  const enabledLayers = Object.entries(layers).filter(([, v]) => v).map(([k]) => k);
  const isExporting = pollingJob?.status === 'queued' || pollingJob?.status === 'running';

  // ── Progress bar ───────────────────────────────────────────────────────
  const [pollingInterval, setPollingInterval] = useState<(() => void) | null>(null);

  const handleStartExport = useCallback(async () => {
    if (!projectId) return;

    const options: AudioJobOptions = {
      project_id: projectId,
      layers,
      quality,
      range,
      voice_overrides: Object.keys(voiceOverrides).length > 0 ? voiceOverrides : undefined,
    };

    const jobId = await startExport(options);
    if (jobId) {
      // Start polling
      const cleanup = startPolling(projectId, 5000);
      setPollingInterval(() => cleanup);
    }
  }, [projectId, layers, quality, range, voiceOverrides, startExport, startPolling]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingInterval?.();
    };
  }, [pollingInterval]);

  const handleDownload = useCallback(() => {
    if (pollingJob?.output_url) {
      window.open(pollingJob.output_url, '_blank');
    }
  }, [pollingJob?.output_url]);

  // ── Status badge ─────────────────────────────────────────────────────────
  const StatusBadge = ({ job }: { job: AudioJob }) => {
    const configs: Record<string, { label: string; icon: React.ReactNode; class: string }> = {
      queued: { label: 'Queued', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, class: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
      running: { label: 'Running', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
      complete: { label: 'Complete', icon: <CheckCircle2 className="h-3.5 w-3.5" />, class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
      error: { label: 'Error', icon: <XCircle className="h-3.5 w-3.5" />, class: 'bg-red-500/15 text-red-400 border-red-500/30' },
    };
    const cfg = configs[job.status] || configs.error;
    return (
      <Badge variant="outline" className={cn('flex items-center gap-1.5', cfg.class)}>
        {cfg.icon}
        {cfg.label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <PageTransition>
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
          {/* ── Header ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4">
            <Link to={`/projects/${projectId}/produce`}>
              <Button variant="ghost" size="icon" className="hover:bg-muted">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Audio Export</h1>
              <p className="text-sm text-muted-foreground">
                {project?.name || 'Loading...'} — Generate an M4B audiobook from your story
              </p>
            </div>
          </div>

          {/* ── Layer Selection ──────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span>Layers</span>
                <Badge variant="secondary" className="text-xs">
                  {enabledLayers.length} of 4 selected
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(Object.entries(LAYER_INFO) as [keyof typeof LAYER_INFO, typeof LAYER_INFO[keyof typeof LAYER_INFO]][]).map(([key, info]) => (
                <div key={key} className="flex items-start gap-4 p-4 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id={`layer-${key}`}
                    checked={layers[key]}
                    onCheckedChange={(checked) => setLayers(prev => ({ ...prev, [key]: !!checked }))}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{info.icon}</span>
                      <Label htmlFor={`layer-${key}`} className="font-semibold cursor-pointer">
                        {info.label}
                      </Label>
                      {info.recommended && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">recommended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      {info.requires}
                    </p>
                  </div>
                </div>
              ))}

              {enabledLayers.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Select at least one layer to export audio.
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Quality ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quality</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={quality} onValueChange={(v) => setQuality(v as Quality)} className="grid grid-cols-2 gap-4">
                {(Object.entries(QUALITY_INFO) as [Quality, typeof QUALITY_INFO[Quality]][]).map(([key, info]) => (
                  <div
                    key={key}
                    onClick={() => setQuality(key)}
                    className={cn(
                      'flex-1 p-4 rounded-lg border-2 cursor-pointer transition-all',
                      quality === key
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{info.label}</span>
                      <RadioGroupItem value={key} id={`quality-${key}`} />
                    </div>
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* ── Range ────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Range</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={range} onValueChange={(v) => setRange(v as Range)} className="flex flex-col gap-3">
                {[
                  { value: 'full', label: 'Full project', description: 'All acts and episodes' },
                  { value: 'acts', label: 'Select acts', description: 'Choose specific acts' },
                  { value: 'episodes', label: 'Select episodes', description: 'Choose specific episodes' },
                ].map(opt => (
                  <div key={opt.value} className="flex items-center gap-3">
                    <RadioGroupItem value={opt.value} id={`range-${opt.value}`} />
                    <Label htmlFor={`range-${opt.value}`} className="flex-1 cursor-pointer">
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-sm text-muted-foreground ml-2">{opt.description}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* ── Export Progress ──────────────────────────────────────── */}
          {(isExporting || pollingJob) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Export Progress</span>
                  {pollingJob && <StatusBadge job={pollingJob} />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-mono">{pollingJob?.progress_pct ?? 0}%</span>
                  </div>
                  <Progress value={pollingJob?.progress_pct ?? 0} className="h-2" />
                </div>

                {pollingJob?.message && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    {pollingJob.message}
                  </div>
                )}

                {pollingJob?.status === 'complete' && pollingJob.output_url && (
                  <Button onClick={handleDownload} className="w-full gap-2" variant="default">
                    <Download className="h-4 w-4" />
                    Download M4B Audiobook
                  </Button>
                )}

                {pollingJob?.status === 'error' && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {pollingJob.message || 'An error occurred during export.'}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Summary + Export Button ─────────────────────────────── */}
          <Card className="border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    {enabledLayers.length} layer{enabledLayers.length !== 1 ? 's' : ''} — {QUALITY_INFO[quality].label} quality
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {project?.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Estimated time: {quality === 'draft' ? '~2 min' : '~8 min'} per episode
                  </p>
                </div>

                <Button
                  onClick={handleStartExport}
                  disabled={enabledLayers.length === 0 || isExporting || exporting}
                  size="lg"
                  className="gap-2"
                >
                  {exporting || isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start Export
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    </div>
  );
}
