/**
 * VPBWorkspace — Visual Production Bible workspace page.
 *
 * 14 deterministic sections, all assembled from NEL outputs + visual assets.
 * No LLM. No invented truth. Pure structured display.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useVisualProductionBible, type VPB } from '@/hooks/useVisualProductionBible';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  BookOpen, Eye, Users, Frame, Palette, Layers, Image,
  FileBarChart, FlaskConical, Download, RefreshCw, FileText,
  MapPin, Shirt, Grid3X3, List, Activity, Shield,
  ChevronRight, Clock, Database, AlertCircle, CheckCircle2,
} from 'lucide-react';

// ── Section Definition ──────────────────────────────────────────────

interface SectionDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const SECTIONS: SectionDef[] = [
  { key: 'projectOverview', label: 'Project Overview', icon: <FileText className="w-4 h-4" />, color: 'text-blue-500' },
  { key: 'visualLanguage', label: 'Visual Language', icon: <Eye className="w-4 h-4" />, color: 'text-purple-500' },
  { key: 'visualStyle', label: 'Visual Style', icon: <Layers className="w-4 h-4" />, color: 'text-indigo-500' },
  { key: 'productionDesign', label: 'Production Design', icon: <Palette className="w-4 h-4" />, color: 'text-orange-500' },
  { key: 'characters', label: 'Characters', icon: <Users className="w-4 h-4" />, color: 'text-green-500' },
  { key: 'cast', label: 'Cast', icon: <Frame className="w-4 h-4" />, color: 'text-teal-500' },
  { key: 'locations', label: 'Locations', icon: <MapPin className="w-4 h-4" />, color: 'text-amber-500' },
  { key: 'wardrobe', label: 'Wardrobe', icon: <Shirt className="w-4 h-4" />, color: 'text-pink-500' },
  { key: 'heroFrames', label: 'Hero Frames', icon: <Image className="w-4 h-4" />, color: 'text-rose-500' },
  { key: 'posters', label: 'Posters', icon: <Image className="w-4 h-4" />, color: 'text-violet-500' },
  { key: 'lookbookSections', label: 'Lookbook', icon: <BookOpen className="w-4 h-4" />, color: 'text-cyan-500' },
  { key: 'sceneBreakdown', label: 'Scene Breakdown', icon: <List className="w-4 h-4" />, color: 'text-sky-500' },
  { key: 'governance', label: 'Governance', icon: <Shield className="w-4 h-4" />, color: 'text-emerald-500' },
  { key: 'assetInventory', label: 'Asset Inventory', icon: <Database className="w-4 h-4" />, color: 'text-slate-500' },
];

// ── Section Renderers ───────────────────────────────────────────────

function SectionCard({ title, icon, color, children, badge }: {
  title: string; icon: React.ReactNode; color: string;
  children: React.ReactNode; badge?: string;
}) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={color}>{icon}</span>
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyState({ label, reason }: { label: string; reason?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground py-4">
      <AlertCircle className="w-4 h-4" />
      <span className="text-sm">No {label.toLowerCase()} yet</span>
      {reason && <span className="text-xs text-muted-foreground/60">— {reason}</span>}
    </div>
  );
}

function CharacterList({ characters }: { characters: any[] }) {
  if (!characters?.length) return <EmptyState label="characters" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {characters.map((c: any, i: number) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card/50">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
            {c.name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{c.name}</div>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline" className="text-[10px]">{c.sceneCount} scenes</Badge>
              {c.actorName && <Badge variant="secondary" className="text-[10px]">{c.actorName}</Badge>}
              {c.visualDna && <Badge className="text-[10px] bg-green-500/10 text-green-600">DNA</Badge>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SceneList({ scenes }: { scenes: any[] }) {
  if (!scenes?.length) return <EmptyState label="scenes" />;
  return (
    <div className="space-y-1 max-h-96 overflow-y-auto">
      {scenes.map((s: any, i: number) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/50">
          <span className="text-muted-foreground w-8 text-right text-xs font-mono">#{s.sceneNumber}</span>
          <span className="truncate flex-1">{s.slugline}</span>
          {s.locationKey && <Badge variant="outline" className="text-[10px] shrink-0">{s.locationKey}</Badge>}
          <span className="text-[10px] text-muted-foreground shrink-0">{s.characterCount} chars</span>
        </div>
      ))}
    </div>
  );
}

function LocationList({ locations }: { locations: any[] }) {
  if (!locations?.length) return <EmptyState label="locations" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
      {locations.map((l: any, i: number) => (
        <div key={i} className="p-3 rounded-lg border text-sm">
          <div className="font-medium truncate">{l.name}</div>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline" className="text-[10px]">{l.sceneCount} scenes</Badge>
            {l.pdDesign && <Badge className="text-[10px] bg-orange-500/10 text-orange-600">PD</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PDSection({ pd }: { pd: Record<string, any> }) {
  const keys = Object.entries(pd || {});
  if (!keys.length) return <EmptyState label="production design data" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {keys.map(([key, items]: [string, any]) => (
        <div key={key} className="p-3 rounded-lg border bg-card/50">
          <div className="font-medium text-sm capitalize mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
          <div className="text-2xl font-bold">{Array.isArray(items) ? items.length : '✓'}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {Array.isArray(items) && items.length > 0
              ? items.map((i: any) => i.display_name || i.name || i.location_key).filter(Boolean).slice(0, 3).join(', ')
              : 'No entries'}
          </div>
        </div>
      ))}
    </div>
  );
}

function HeroFrameGallery({ heroFrames }: { heroFrames: any[] }) {
  if (!heroFrames?.length) return <EmptyState label="hero frames" reason="Run hero frame generation first" />;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {heroFrames.map((hf: any, i: number) => (
        <div key={i} className="aspect-[3/4] rounded-lg border bg-muted overflow-hidden relative group">
          {hf.imageUrl ? (
            <img src={hf.imageUrl} alt={hf.entityId || 'Hero frame'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              No URL
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
            <div className="text-[10px] text-white truncate">{hf.entityId || 'Unnamed'}</div>
            {hf.isPrimary && <Badge className="text-[8px] bg-primary">Primary</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PosterGallery({ posters }: { posters: any[] }) {
  if (!posters?.length) return <EmptyState label="posters" reason="Run poster generation first" />;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {posters.map((p: any, i: number) => (
        <div key={i} className="aspect-[2/3] rounded-lg border bg-muted overflow-hidden relative group">
          {p.renderedUrl ? (
            <img src={p.renderedUrl} alt={`Poster v${p.versionNumber}`} className="w-full h-full object-cover" />
          ) : p.keyArtUrl ? (
            <img src={p.keyArtUrl} alt={`Key art v${p.versionNumber}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              No image
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
            <div className="text-[10px] text-white">v{p.versionNumber}</div>
            {p.isActive && <Badge className="text-[8px] bg-green-500">Active</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

function InventoryTable({ inventory }: { inventory: any }) {
  if (!inventory) return <EmptyState label="asset inventory data" />;
  const items = Object.entries(inventory).filter(([k]) => !k.startsWith('_'));
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map(([key, val]: [string, any]) => (
        <div key={key} className="p-3 rounded-lg border text-center">
          <div className="text-2xl font-bold">{val}</div>
          <div className="text-xs text-muted-foreground mt-1 capitalize">
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </div>
        </div>
      ))}
    </div>
  );
}

function GovernancePanel({ governance }: { governance: any }) {
  if (!governance) return <EmptyState label="governance data" />;
  const stages = governance.stages || {};
  const stageEntries = Object.entries(stages);
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Badge className={
          governance.overallStatus === 'ready' ? 'bg-green-500' :
          governance.overallStatus === 'blocked' ? 'bg-red-500' :
          'bg-yellow-500'
        }>
          {governance.overallStatus}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {governance.blockerCount > 0 ? `${governance.blockerCount} blocker(s)` : 'No blockers'}
        </span>
        {governance.lastEvaluatedAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            Last evaluated: {new Date(governance.lastEvaluatedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      {stageEntries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {stageEntries.map(([name, stage]: [string, any]) => (
            <div key={name} className="p-2 rounded border text-xs flex items-center justify-between">
              <span className="capitalize">{name.replace(/_/g, ' ')}</span>
              <Badge className={
                stage.status === 'approved' || stage.status === 'locked' ? 'bg-green-500/10 text-green-600' :
                stage.status === 'blocked' ? 'bg-red-500/10 text-red-600' :
                stage.status === 'in_progress' ? 'bg-blue-500/10 text-blue-600' :
                'bg-gray-500/10 text-gray-600'
              }>{stage.status}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No governance stages found</div>
      )}
    </div>
  );
}

function VisualLanguagePanel({ vl }: { vl: any }) {
  if (!vl) return <EmptyState label="visual language" reason="Not yet defined" />;
  return (
    <pre className="text-xs text-muted-foreground overflow-auto max-h-48">
      {JSON.stringify(vl, null, 2)}
    </pre>
  );
}

function VisualStylePanel({ vs }: { vs: any }) {
  if (!vs) return <EmptyState label="visual style" reason="Not yet defined" />;
  return (
    <div className="space-y-2 text-sm">
      {vs.style_lock_json && (
        <div>
          <div className="font-medium mb-1">Style Lock</div>
          <pre className="text-xs text-muted-foreground overflow-auto max-h-32">
            {JSON.stringify(vs.style_lock_json, null, 2)}
          </pre>
        </div>
      )}
      {vs.theme_words && (
        <div>
          <div className="font-medium mb-1">Theme Words</div>
          <div className="flex gap-1 flex-wrap">
            {vs.theme_words.map((w: string, i: number) => (
              <Badge key={i} variant="outline">{w}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CastList({ cast }: { cast: any[] }) {
  if (!cast?.length) return <EmptyState label="cast bindings" reason="Run cast selection first" />;
  return (
    <div className="space-y-2">
      {cast.map((c: any, i: number) => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-lg border text-sm">
          <span className="font-medium">{c.characterName}</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span>{c.actorName || 'Uncast'}</span>
          <Badge className="ml-auto text-[10px]">{c.bindingStatus}</Badge>
        </div>
      ))}
    </div>
  );
}

function WardrobeList({ wardrobe }: { wardrobe: any[] }) {
  if (!wardrobe?.length) return <EmptyState label="wardrobe profiles" reason="Run wardrobe extraction first" />;
  return (
    <div className="space-y-2">
      {wardrobe.map((w: any, i: number) => (
        <div key={i} className="p-3 rounded-lg border text-sm">
          <div className="font-medium">{w.character_name || w.character_key}</div>
          {w.active_states && (
            <div className="flex gap-1 flex-wrap mt-1">
              {w.active_states.map((s: string, j: number) => (
                <Badge key={j} variant="outline" className="text-[10px]">{s}</Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LookbookSectionList({ sections }: { sections: any[] }) {
  if (!sections?.length) return <EmptyState label="lookbook sections" reason="Run lookbook generation first" />;
  return (
    <div className="space-y-2">
      {sections.map((s: any, i: number) => (
        <div key={i} className="flex items-center justify-between p-2 rounded border text-sm">
          <span>{s.label || s.sectionKey}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{s.imageCount} images</span>
            <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectOverviewPanel({ overview }: { overview: any }) {
  if (!overview) return <EmptyState label="project overview" />;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {overview.genres?.map((g: string, i: number) => (
          <Badge key={i} variant="secondary">{g}</Badge>
        ))}
        {overview.format && <Badge>{overview.format}</Badge>}
      </div>
      {overview.logline && (
        <div>
          <div className="font-medium text-xs text-muted-foreground mb-1">Logline</div>
          <p className="italic text-muted-foreground">{overview.logline}</p>
        </div>
      )}
      {overview.premise && (
        <div>
          <div className="font-medium text-xs text-muted-foreground mb-1">Premise</div>
          <p className="text-muted-foreground">{overview.premise}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 pt-2">
        {overview.budgetRange && (
          <div>
            <div className="text-xs text-muted-foreground">Budget</div>
            <div className="font-medium">{overview.budgetRange}</div>
          </div>
        )}
        {overview.tone && (
          <div>
            <div className="text-xs text-muted-foreground">Tone</div>
            <div className="font-medium capitalize">{overview.tone}</div>
          </div>
        )}
        {overview.prestigeStyle && (
          <div>
            <div className="text-xs text-muted-foreground">Prestige Style</div>
            <div className="font-medium capitalize">{overview.prestigeStyle}</div>
          </div>
        )}
        {overview.targetAudience && (
          <div>
            <div className="text-xs text-muted-foreground">Target Audience</div>
            <div className="font-medium">{overview.targetAudience}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function VPBWorkspace() {
  const { id: projectId } = useParams<{ id: string }>();
  const {
    isLoading, isRegenerating, vpb, version, versions, error,
    loadVPB, regenerateVPB, exportMarkdown, loadVersion,
  } = useVisualProductionBible(projectId);

  const [activeSection, setActiveSection] = useState<string>('projectOverview');
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadVPB();
  }, [loadVPB]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const md = await exportMarkdown();
      if (md) {
        // Copy to clipboard
        await navigator.clipboard.writeText(md);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        // Also trigger file download
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vpb-${projectId}-v${version?.version_number || 1}.md`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('VPB exported as Markdown');
      }
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const sections = vpb?.sections || {};
  const meta = vpb?.metadata;
  const prov = vpb?.provenance;

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96 lg:col-span-3" />
          </div>
        </div>
      </div>
    );
  }

  // ── No VPB state ──
  if (!vpb) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Visual Production Bible</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Deterministic assembly from NEL outputs + visual production assets
            </p>
          </div>
        </div>
        <Card className="p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">No VPB yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Assemble the Visual Production Bible from NEL outputs and visual production assets.
          </p>
          <Button onClick={regenerateVPB} disabled={isRegenerating}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
            {isRegenerating ? 'Assembling...' : 'Assemble VPB'}
          </Button>
        </Card>
      </div>
    );
  }

  // ── VBP display ──
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Visual Production Bible</h1>
            <Badge className="text-xs">v{version?.version_number || meta?.version}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {meta?.projectTitle} — {meta?.projectFormat}
          </p>
          {version && (
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Generated {new Date(version.created_at || meta?.generatedAt).toLocaleString()}
              </span>
              {prov?.assemblyDurationMs && (
                <span className="text-xs text-muted-foreground">
                  · {prov.assemblyDurationMs}ms assembly
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                · {version.section_count} sections · {version.asset_count} assets
              </span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 mt-2 text-red-500 text-sm">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Exporting...' : copied ? 'Copied!' : 'Export MD'}
          </Button>
          <Button onClick={regenerateVPB} disabled={isRegenerating}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
            {isRegenerating ? 'Assembling...' : 'Regenerate'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Section Navigation */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Sections</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <nav className="space-y-0.5">
                {SECTIONS.map(s => {
                  const data = sections[s.key];
                  const hasData = data && (
                    Array.isArray(data) ? data.length > 0 :
                    typeof data === 'object' ? Object.keys(data).length > 0 :
                    !!data
                  );
                  return (
                    <button
                      key={s.key}
                      onClick={() => setActiveSection(s.key)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                        activeSection === s.key
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span className={s.color}>{s.icon}</span>
                      <span className="flex-1 text-left">{s.label}</span>
                      {hasData && <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />}
                    </button>
                  );
                })}
              </nav>
            </CardContent>
          </Card>

          {/* Version History */}
          {versions.length > 1 && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Versions</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {versions.map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => loadVersion(v.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
                      v.is_current ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    <span>v{v.version_number}</span>
                    {v.is_current && <Badge className="text-[8px]">Current</Badge>}
                    <span className="ml-auto text-[10px]">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Section Content */}
        <div className="lg:col-span-4">
          <ScrollArea className="h-[calc(100vh-12rem)]">
            {activeSection === 'projectOverview' && (
              <SectionCard title="Project Overview" icon={<FileText className="w-4 h-4" />} color="text-blue-500">
                <ProjectOverviewPanel overview={sections.projectOverview} />
              </SectionCard>
            )}

            {activeSection === 'visualLanguage' && (
              <SectionCard title="Visual Language" icon={<Eye className="w-4 h-4" />} color="text-purple-500">
                <VisualLanguagePanel vl={sections.visualLanguage} />
              </SectionCard>
            )}

            {activeSection === 'visualStyle' && (
              <SectionCard title="Visual Style" icon={<Layers className="w-4 h-4" />} color="text-indigo-500">
                <VisualStylePanel vs={sections.visualStyle} />
              </SectionCard>
            )}

            {activeSection === 'productionDesign' && (
              <SectionCard title="Production Design" icon={<Palette className="w-4 h-4" />} color="text-orange-500"
                badge={`${(sections.productionDesign?.worldRules || []).length + (sections.productionDesign?.designTemplates || []).length + (sections.productionDesign?.locationDesign || []).length} entries`}>
                <PDSection pd={sections.productionDesign} />
              </SectionCard>
            )}

            {activeSection === 'characters' && (
              <SectionCard title="Characters" icon={<Users className="w-4 h-4" />} color="text-green-500"
                badge={`${(sections.characters || []).length} characters`}>
                <CharacterList characters={sections.characters} />
              </SectionCard>
            )}

            {activeSection === 'cast' && (
              <SectionCard title="Cast" icon={<Frame className="w-4 h-4" />} color="text-teal-500"
                badge={`${(sections.cast || []).length} bindings`}>
                <CastList cast={sections.cast} />
              </SectionCard>
            )}

            {activeSection === 'locations' && (
              <SectionCard title="Locations" icon={<MapPin className="w-4 h-4" />} color="text-amber-500"
                badge={`${(sections.locations || []).length} locations`}>
                <LocationList locations={sections.locations} />
              </SectionCard>
            )}

            {activeSection === 'wardrobe' && (
              <SectionCard title="Wardrobe" icon={<Shirt className="w-4 h-4" />} color="text-pink-500"
                badge={`${(sections.wardrobe || []).length} profiles`}>
                <WardrobeList wardrobe={sections.wardrobe} />
              </SectionCard>
            )}

            {activeSection === 'heroFrames' && (
              <SectionCard title="Hero Frames" icon={<Image className="w-4 h-4" />} color="text-rose-500"
                badge={`${(sections.heroFrames || []).length} frames`}>
                <HeroFrameGallery heroFrames={sections.heroFrames} />
              </SectionCard>
            )}

            {activeSection === 'posters' && (
              <SectionCard title="Posters" icon={<Image className="w-4 h-4" />} color="text-violet-500"
                badge={`${(sections.posters || []).length} posters`}>
                <PosterGallery posters={sections.posters} />
              </SectionCard>
            )}

            {activeSection === 'lookbookSections' && (
              <SectionCard title="Lookbook" icon={<BookOpen className="w-4 h-4" />} color="text-cyan-500"
                badge={`${(sections.lookbookSections || []).length} sections`}>
                <LookbookSectionList sections={sections.lookbookSections} />
              </SectionCard>
            )}

            {activeSection === 'sceneBreakdown' && (
              <SectionCard title="Scene Breakdown" icon={<List className="w-4 h-4" />} color="text-sky-500"
                badge={`${(sections.sceneBreakdown || []).length} scenes`}>
                <SceneList scenes={sections.sceneBreakdown} />
              </SectionCard>
            )}

            {activeSection === 'governance' && (
              <SectionCard title="Governance" icon={<Shield className="w-4 h-4" />} color="text-emerald-500">
                <GovernancePanel governance={sections.governance} />
              </SectionCard>
            )}

            {activeSection === 'assetInventory' && (
              <SectionCard title="Asset Inventory" icon={<Database className="w-4 h-4" />} color="text-slate-500">
                <InventoryTable inventory={sections.assetInventory} />
              </SectionCard>
            )}

            {/* Provenance footer */}
            {prov && (
              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Provenance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Engine: {prov.generatedBy}</div>
                    <div>Assembled: {new Date(prov.assemblyTimestamp).toLocaleString()}</div>
                    {prov.assemblyDurationMs && <div>Duration: {prov.assemblyDurationMs}ms</div>}
                    <div className="mt-2">
                      <div className="font-medium mb-1">Data Sources:</div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {prov.sources?.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
