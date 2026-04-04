/**
 * ActorLibrary — /ai-cast/actors route.
 * Clean roster-focused view of all reusable AI Actors.
 * Strict approved_version_id usage. No mutations.
 */
import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Search, ArrowLeft, Loader2, Crown, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useActorLibrary } from '@/lib/aiCast/useActorLibrary';
import { ActorCard } from '@/components/ai-cast/library/ActorCard';
import { ActorDetailPanel } from '@/components/ai-cast/library/ActorDetailPanel';
import { parseRosterNumber } from '@/lib/aiCast/actorLibraryTypes';
import type { LibraryActor } from '@/lib/aiCast/actorLibraryTypes';

type SortMode = 'roster' | 'recent' | 'name';
type FilterMode = 'all' | 'roster' | 'approved';

export default function ActorLibrary() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: actors, isLoading } = useActorLibrary();

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('roster');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedActor, setSelectedActor] = useState<LibraryActor | null>(null);

  // Auto-select from URL param
  const highlightId = searchParams.get('actor');

  const filtered = useMemo(() => {
    let list = actors || [];

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Filter
    if (filterMode === 'roster') list = list.filter(a => a.roster_ready);
    if (filterMode === 'approved') list = list.filter(a => a.approved_version_id !== null);

    // Sort
    list = [...list].sort((a, b) => {
      if (sortMode === 'roster') {
        const ra = parseRosterNumber(a.name);
        const rb = parseRosterNumber(b.name);
        if (ra !== null && rb !== null) return ra - rb;
        if (ra !== null) return -1;
        if (rb !== null) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return list;
  }, [actors, search, sortMode, filterMode]);

  const rosterCount = (actors || []).filter(a => a.roster_ready).length;
  const approvedCount = (actors || []).filter(a => a.approved_version_id !== null).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Nav */}
      <div className="flex items-center gap-2 text-xs">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => navigate('/ai-cast')}>
          <ArrowLeft className="h-3 w-3" /> AI Cast
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground font-medium">Actor Library</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5" /> Actor Library
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Browse, inspect, and prepare reusable AI Actor identities for casting
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search actors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <Select value={filterMode} onValueChange={v => setFilterMode(v as FilterMode)}>
          <SelectTrigger className="h-9 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Actors</SelectItem>
            <SelectItem value="roster" className="text-xs">Roster Ready</SelectItem>
            <SelectItem value="approved" className="text-xs">Approved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortMode} onValueChange={v => setSortMode(v as SortMode)}>
          <SelectTrigger className="h-9 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="roster" className="text-xs">Roster #</SelectItem>
            <SelectItem value="recent" className="text-xs">Recent</SelectItem>
            <SelectItem value="name" className="text-xs">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span>{(actors || []).length} actor{(actors || []).length !== 1 ? 's' : ''}</span>
        <span className="flex items-center gap-0.5">
          <Crown className="h-2.5 w-2.5 text-primary" /> {rosterCount} roster
        </span>
        <span className="flex items-center gap-0.5">
          <Shield className="h-2.5 w-2.5 text-emerald-400" /> {approvedCount} approved
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {(actors || []).length === 0
              ? 'No AI Actors yet. Create and promote actors through the convergence pipeline.'
              : 'No actors match your search.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(actor => (
            <ActorCard
              key={actor.id}
              actor={actor}
              onClick={() => setSelectedActor(actor)}
            />
          ))}
        </div>
      )}

      {/* Detail Panel */}
      {selectedActor && (
        <ActorDetailPanel
          actor={selectedActor}
          open={!!selectedActor}
          onClose={() => setSelectedActor(null)}
        />
      )}
    </div>
  );
}
