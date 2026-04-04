/**
 * usePremiumReconciliation — Reconciles live active/primary pools
 * against current governance (identity gate + premium quality gate).
 *
 * Identifies stale rows that predate governance hardening and
 * provides a deterministic reconciliation action.
 *
 * This is NOT a new governance system — it uses the existing canonical
 * gates from characterImageEligibility.ts and premiumQualityGate.ts.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { classifyCharacterIdentity, type GateImageInput } from '@/lib/images/characterImageEligibility';
import {
  classifyPremiumImageQuality,
  classifyPrimaryEligibility,
  isPremiumSection,
  type QualityGateImageInput,
  type PremiumQualityResult,
  type PrimaryEligibilityResult,
} from '@/lib/images/premiumQualityGate';

// ── Types ──────────────────────────────────────────────────────────

export interface ReconciliationRow {
  id: string;
  subject: string | null;
  subject_type: string | null;
  asset_group: string | null;
  generation_purpose: string | null;
  strategy_key: string | null;
  curation_state: string;
  is_primary: boolean;
  is_active: boolean;
  width: number | null;
  height: number | null;
  generation_config: Record<string, unknown> | null;
  identityEligible: boolean;
  identityStatus: string;
  identityReasons: string[];
  premiumQuality: PremiumQualityResult;
  primaryEligibility: PrimaryEligibilityResult;
  action: 'keep' | 'demote_active' | 'unset_primary' | 'demote_and_unset';
  actionReasons: string[];
}

export interface ReconciliationReport {
  surface: string;
  totalActive: number;
  totalPrimary: number;
  failingActive: ReconciliationRow[];
  failingPrimary: ReconciliationRow[];
  passingActive: ReconciliationRow[];
  recommendedNewPrimaryId: string | null;
}

export interface ReconciliationResult {
  reports: ReconciliationReport[];
  demotedCount: number;
  primaryUnsetCount: number;
  newPrimarySetCount: number;
}

// ── Premium surfaces to reconcile ──────────────────────────────────

const PREMIUM_SURFACES = [
  { key: 'hero_frames', assetGroup: 'hero_frame', generationPurpose: 'hero_frame' },
  { key: 'poster_directions', assetGroup: 'hero_frame', generationPurpose: 'poster_direction' },
] as const;

function resolveGateSectionKey(assetGroup: string | null): string | null {
  if (assetGroup === 'hero_frame') return 'hero_frames';
  return assetGroup || null;
}

// ── Hook ──────────────────────────────────────────────────────────

export function usePremiumReconciliation(projectId: string | undefined) {
  const qc = useQueryClient();
  const [reconciling, setReconciling] = useState(false);
  const [lastReport, setLastReport] = useState<ReconciliationReport[] | null>(null);

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['project-images', projectId] });
    qc.invalidateQueries({ queryKey: ['project-images-paginated', projectId] });
    qc.invalidateQueries({ queryKey: ['lookbook-section-content', projectId] });
    qc.invalidateQueries({ queryKey: ['hero-frame-images', projectId] });
    qc.invalidateQueries({ queryKey: ['section-images', projectId] });
    qc.invalidateQueries({ queryKey: ['pipeline-hero-frames-state', projectId] });
  }, [qc, projectId]);

  /**
   * Audit current live active/primary rows against governance.
   * DRY RUN — no mutations.
   */
  const audit = useCallback(async (): Promise<ReconciliationReport[]> => {
    if (!projectId) return [];

    const reports: ReconciliationReport[] = [];

    for (const surface of PREMIUM_SURFACES) {
      // Fetch all active + primary rows for this surface
      const { data, error } = await (supabase as any)
        .from('project_images')
        .select('id, subject, subject_type, asset_group, generation_purpose, strategy_key, curation_state, is_primary, is_active, width, height, generation_config')
        .eq('project_id', projectId)
        .eq('asset_group', surface.assetGroup)
        .in('curation_state', ['active', 'candidate'])
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error(`[RECONCILIATION_AUDIT_ERROR] ${surface.key}:`, error.message);
        continue;
      }

      const rows = (data || []) as any[];
      const sectionKey = surface.key;

      const classified: ReconciliationRow[] = rows.map(row => {
        const gateInput: GateImageInput & QualityGateImageInput = {
          id: row.id,
          subject: row.subject,
          subject_type: row.subject_type,
          generation_config: row.generation_config,
          width: row.width,
          height: row.height,
          asset_group: row.asset_group,
          generation_purpose: row.generation_purpose,
          strategy_key: row.strategy_key,
        };

        const identity = classifyCharacterIdentity(gateInput, sectionKey);
        const premium = classifyPremiumImageQuality(gateInput);
        const primaryElig = classifyPrimaryEligibility(gateInput, sectionKey);

        const isActive = row.curation_state === 'active';
        const isPrimary = !!row.is_primary;
        const actionReasons: string[] = [];

        // Determine action
        let action: ReconciliationRow['action'] = 'keep';

        // Check premium-active eligibility
        if (isActive && isPremiumSection(sectionKey) && premium.status === 'premium_fail') {
          actionReasons.push(`Premium fail: ${premium.reasons.join('; ')}`);
          action = isPrimary ? 'demote_and_unset' : 'demote_active';
        }

        // Check identity eligibility
        if (isActive && !identity.eligible) {
          actionReasons.push(`Identity fail: ${identity.reasons.join('; ')}`);
          action = isPrimary ? 'demote_and_unset' : 'demote_active';
        }

        // Check primary-specific eligibility
        if (isPrimary && !primaryElig.eligible) {
          actionReasons.push(`Primary ineligible: ${primaryElig.reasons.join('; ')}`);
          if (action === 'keep') action = 'unset_primary';
          else if (action === 'demote_active') action = 'demote_and_unset';
        }

        return {
          id: row.id,
          subject: row.subject,
          subject_type: row.subject_type,
          asset_group: row.asset_group,
          generation_purpose: row.generation_purpose,
          strategy_key: row.strategy_key,
          curation_state: row.curation_state,
          is_primary: isPrimary,
          is_active: row.is_active,
          width: row.width,
          height: row.height,
          generation_config: row.generation_config,
          identityEligible: identity.eligible,
          identityStatus: identity.status,
          identityReasons: identity.reasons,
          premiumQuality: premium,
          primaryEligibility: primaryElig,
          action,
          actionReasons,
        };
      });

      const failingActive = classified.filter(r =>
        r.action === 'demote_active' || r.action === 'demote_and_unset'
      );
      const failingPrimary = classified.filter(r =>
        r.action === 'unset_primary' || r.action === 'demote_and_unset'
      );
      const passingActive = classified.filter(r => r.action === 'keep' && r.curation_state === 'active');

      // Recommend new primary from passing active rows
      let recommendedNewPrimaryId: string | null = null;
      if (failingPrimary.length > 0 && passingActive.length > 0) {
        // Pick the first passing active that also passes primary gate
        const primaryCandidate = passingActive.find(r => r.primaryEligibility.eligible);
        recommendedNewPrimaryId = primaryCandidate?.id || null;
      }

      reports.push({
        surface: surface.key,
        totalActive: classified.filter(r => r.curation_state === 'active').length,
        totalPrimary: classified.filter(r => r.is_primary).length,
        failingActive,
        failingPrimary,
        passingActive,
        recommendedNewPrimaryId,
      });

      console.log(`[RECONCILIATION_AUDIT] ${surface.key}:`, {
        totalActive: classified.filter(r => r.curation_state === 'active').length,
        failingActive: failingActive.length,
        failingPrimary: failingPrimary.length,
        recommendedNewPrimaryId,
      });
    }

    setLastReport(reports);
    return reports;
  }, [projectId]);

  /**
   * Execute reconciliation — demote/unset stale rows, recompute primary.
   */
  const reconcile = useCallback(async (): Promise<ReconciliationResult | null> => {
    if (!projectId || reconciling) return null;
    setReconciling(true);

    try {
      const reports = await audit();
      let demotedCount = 0;
      let primaryUnsetCount = 0;
      let newPrimarySetCount = 0;

      for (const report of reports) {
        // 1. Demote failing active rows to candidate
        const demoteIds = report.failingActive.map(r => r.id);
        if (demoteIds.length > 0) {
          const { error } = await (supabase as any)
            .from('project_images')
            .update({ curation_state: 'candidate', is_active: false, is_primary: false })
            .in('id', demoteIds);
          if (error) {
            console.error(`[RECONCILIATION_DEMOTE_ERROR] ${report.surface}:`, error.message);
          } else {
            demotedCount += demoteIds.length;
            console.log(`[RECONCILIATION_DEMOTED] ${report.surface}: ${demoteIds.length} rows demoted`);
          }
        }

        // 2. Unset failing primaries (that weren't already demoted)
        const unsetPrimaryIds = report.failingPrimary
          .filter(r => r.action === 'unset_primary')
          .map(r => r.id);
        if (unsetPrimaryIds.length > 0) {
          const { error } = await (supabase as any)
            .from('project_images')
            .update({ is_primary: false })
            .in('id', unsetPrimaryIds);
          if (error) {
            console.error(`[RECONCILIATION_UNSET_PRIMARY_ERROR] ${report.surface}:`, error.message);
          } else {
            primaryUnsetCount += unsetPrimaryIds.length;
          }
        }

        // 3. Set recommended new primary if available
        if (report.recommendedNewPrimaryId && report.failingPrimary.length > 0) {
          // First clear any existing primary for this surface
          await (supabase as any)
            .from('project_images')
            .update({ is_primary: false })
            .eq('project_id', projectId)
            .eq('asset_group', 'hero_frame')
            .eq('is_primary', true);

          const { error } = await (supabase as any)
            .from('project_images')
            .update({ is_primary: true, curation_state: 'active', is_active: true })
            .eq('id', report.recommendedNewPrimaryId);
          if (error) {
            console.error(`[RECONCILIATION_SET_PRIMARY_ERROR] ${report.surface}:`, error.message);
          } else {
            newPrimarySetCount++;
            console.log(`[RECONCILIATION_NEW_PRIMARY] ${report.surface}: ${report.recommendedNewPrimaryId}`);
          }
        }
      }

      invalidateAll();

      const result: ReconciliationResult = {
        reports,
        demotedCount,
        primaryUnsetCount,
        newPrimarySetCount,
      };

      if (demotedCount > 0 || primaryUnsetCount > 0) {
        toast.success(`Reconciled: ${demotedCount} demoted, ${primaryUnsetCount} primaries unset, ${newPrimarySetCount} new primaries set`);
      } else {
        toast.info('All premium pools are already governance-compliant');
      }

      return result;
    } catch (e: any) {
      toast.error(e.message || 'Reconciliation failed');
      return null;
    } finally {
      setReconciling(false);
    }
  }, [projectId, reconciling, audit, invalidateAll]);

  return {
    audit,
    reconcile,
    reconciling,
    lastReport,
  };
}
