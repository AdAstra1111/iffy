/**
 * PotentiallyStaleDocuments — Phase 6: UI Display
 *
 * Read-only component showing documents flagged as potentially stale
 * by the atom dependency index. No auto-regeneration.
 *
 * Sources: atom_staleness_flags table
 * Refresh: on mount + after any document regeneration
 *
 * Constitutional rules:
 * - Display only — no auto-regeneration
 * - One-hop staleness only
 * - Visual assets never auto-regenerated from atom changes
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

interface StalenessFlag {
  id: string;
  affected_document_id: string;
  affected_doc_type: string;
  changed_atom_type: string;
  changed_atom_text: string;
  changed_atom_entity: string;
  origin_source: string;
  dependency_type: "origin" | "derived" | "reference";
  affected_scope: "full_doc" | "specific_scenes" | "visual_only" | "metadata_only";
  stale_reason: string;
  suggested_action: string;
  status: "active" | "dismissed" | "resolved";
  created_at: string;
}

interface Props {
  projectId: string;
  onRegenerate?: (docType: string) => void;
}

export function PotentiallyStaleDocuments({ projectId, onRegenerate }: Props) {
  const [flags, setFlags] = useState<StalenessFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("atom_staleness_flags")
        .select("*")
        .eq("project_id", projectId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(20);

      if (queryError) throw queryError;
      setFlags((data as StalenessFlag[]) || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load staleness flags");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const handleDismiss = async (flagId: string) => {
    await supabase
      .from("atom_staleness_flags")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
      .eq("id", flagId);
    setFlags((prev) => prev.filter((f) => f.id !== flagId));
  };

  const handleRegenerate = (docType: string) => {
    onRegenerate?.(docType);
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-500 p-4">
        Checking for stale documents...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 p-4">
        Error: {error}
      </div>
    );
  }

  if (flags.length === 0) {
    return null; // Don't show the widget when there's nothing stale
  }

  const originFlags = flags.filter((f) => f.dependency_type === "origin");
  const derivedFlags = flags.filter((f) => f.dependency_type === "derived");

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-600 text-lg">⚠</span>
        <h3 className="text-sm font-semibold text-amber-900">
          Potentially Stale Documents ({flags.length})
        </h3>
      </div>

      {originFlags.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-amber-800 uppercase tracking-wider mb-2">
            Origin Documents — Review Recommended
          </h4>
          <div className="space-y-2">
            {originFlags.map((flag) => (
              <StalenessCard
                key={flag.id}
                flag={flag}
                onDismiss={() => handleDismiss(flag.id)}
                onRegenerate={() => handleRegenerate(flag.affected_doc_type)}
              />
            ))}
          </div>
        </div>
      )}

      {derivedFlags.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-amber-800 uppercase tracking-wider mb-2">
            Derived Documents — Impact Assessment
          </h4>
          <div className="space-y-2">
            {derivedFlags.map((flag) => (
              <StalenessCard
                key={flag.id}
                flag={flag}
                onDismiss={() => handleDismiss(flag.id)}
                onRegenerate={() => handleRegenerate(flag.affected_doc_type)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StalenessCard({
  flag,
  onDismiss,
  onRegenerate,
}: {
  flag: StalenessFlag;
  onDismiss: () => void;
  onRegenerate: () => void;
}) {
  const docTypeLabel = flag.affected_doc_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const atomTypeLabel = flag.changed_atom_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const scopeBadge = () => {
    switch (flag.affected_scope) {
      case "full_doc":
        return <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">Full doc</span>;
      case "specific_scenes":
        return <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Specific scenes</span>;
      case "visual_only":
        return <span className="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">Visual only</span>;
      case "metadata_only":
        return <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Metadata</span>;
    }
  };

  return (
    <div className="bg-white border border-amber-100 rounded p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{docTypeLabel}</span>
          {scopeBadge()}
          <span className="text-xs text-gray-500">{atomTypeLabel}</span>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {new Date(flag.created_at).toLocaleDateString()}
        </span>
      </div>

      <p className="text-sm text-gray-700">{flag.stale_reason}</p>

      {flag.changed_atom_entity && (
        <p className="text-xs text-gray-500">
          Entity: <span className="font-medium">{flag.changed_atom_entity}</span>
          {flag.origin_source && <> · Source: {flag.origin_source}</>}
        </p>
      )}

      <p className="text-xs text-gray-600 italic">{flag.suggested_action}</p>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onRegenerate}
          className="text-xs px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
        >
          Regenerate
        </button>
        <button
          onClick={onDismiss}
          className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
