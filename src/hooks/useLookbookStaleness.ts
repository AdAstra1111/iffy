/**
 * useLookbookStaleness — Dependency-aware staleness detection for LookBook.
 * 
 * Phase 2: Compares a stored build-time TruthSnapshot against current
 * canonical truth using checkFreshness(). Detects cast, canon, DNA,
 * location, and visual state drift — not just new image timestamps.
 * 
 * Build snapshots are stored in localStorage per project.
 * No schema changes required.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  captureVisualTruthSnapshot,
  checkAssetFreshness,
  type TruthSnapshot,
  type FreshnessResult,
} from '@/lib/visual-truth-dependencies';

const SNAPSHOT_KEY_PREFIX = 'lookbook_build_snapshot_';

export interface LookbookStalenessState {
  /** Whether the LookBook is stale (any canonical dependency changed since last build) */
  isStale: boolean;
  /** Human-readable stale reasons */
  staleReasons: string[];
  /** Affected dependency classes (cast, dna, world, entity, etc.) */
  affectedClasses: string[];
  /** Record the current moment as "last built" — captures full truth snapshot */
  markBuilt: () => void;
  /** Force a re-check */
  recheck: () => void;
  /** Whether a freshness check is in progress */
  checking: boolean;
}

function getStoredSnapshot(projectId: string): TruthSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY_PREFIX + projectId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSnapshot(projectId: string, snapshot: TruthSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY_PREFIX + projectId, JSON.stringify(snapshot));
  } catch {
    console.warn('[LookbookStaleness] Failed to persist build snapshot');
  }
}

export function useLookbookStaleness(
  projectId: string | undefined,
  buildEpoch: number,
): LookbookStalenessState {
  const [isStale, setIsStale] = useState(false);
  const [staleReasons, setStaleReasons] = useState<string[]>([]);
  const [affectedClasses, setAffectedClasses] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const checkInFlight = useRef(false);

  const markBuilt = useCallback(async () => {
    if (!projectId) return;
    try {
      const snapshot = await captureVisualTruthSnapshot(projectId);
      storeSnapshot(projectId, snapshot);
      setIsStale(false);
      setStaleReasons([]);
      setAffectedClasses([]);
    } catch (err) {
      console.warn('[LookbookStaleness] Failed to capture build snapshot:', err);
    }
  }, [projectId]);

  // When buildEpoch changes (a build happened), capture snapshot
  useEffect(() => {
    if (buildEpoch > 0 && projectId) {
      markBuilt();
    }
  }, [buildEpoch, projectId, markBuilt]);

  const checkFreshnessNow = useCallback(async () => {
    if (!projectId || checkInFlight.current) return;
    const stored = getStoredSnapshot(projectId);
    if (!stored) {
      // No prior build snapshot — can't determine staleness.
      // Fall back to "not stale" (user hasn't built yet or localStorage cleared).
      setIsStale(false);
      return;
    }

    checkInFlight.current = true;
    setChecking(true);

    try {
      const result: FreshnessResult = await checkAssetFreshness(
        projectId, 'look_book', 'latest', stored,
      );

      setIsStale(result.status === 'stale');
      setStaleReasons(result.staleReasons);
      setAffectedClasses(result.affectedClasses);
    } catch (err) {
      console.warn('[LookbookStaleness] Freshness check failed:', err);
    } finally {
      checkInFlight.current = false;
      setChecking(false);
    }
  }, [projectId]);

  // Check on mount and periodically (every 30s)
  useEffect(() => {
    checkFreshnessNow();
    const interval = setInterval(checkFreshnessNow, 30_000);
    return () => clearInterval(interval);
  }, [checkFreshnessNow]);

  return {
    isStale,
    staleReasons,
    affectedClasses,
    markBuilt,
    recheck: checkFreshnessNow,
    checking,
  };
}
