/**
 * CharacterEntityMergePanel — Admin UI for detecting and merging duplicate
 * character entities within a project.
 *
 * Three views:
 *   1. Status — shows duplicate clusters, triggers plan generation
 *   2. Plan — shows merge details, triggers execution
 *   3. Execute — shows merge results
 */
import { useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, Loader2, Merge, Shuffle, Table2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/* ── Types ───────────────────────────────────────────────────────────────── */

interface DuplicateCluster {
  cluster_id: string;
  entity_ids: string[];
  names: string[];
  reason: string;
  scene_links_count: number;
  relation_count: number;
}

interface MergeItem {
  canonical_entity_id: string;
  canonical_name: string;
  absorbed_entity_ids: string[];
  absorbed_names: string[];
  scene_links_to_repair: number;
  relations_to_repair: number;
  aliases_to_insert: string[];
  document_sections_to_merge: number;
}

interface ExecuteResult {
  success: boolean;
  merges_completed: number;
  scene_links_repaired: number;
  relations_repaired: number;
  aliases_inserted: number;
  entities_deleted: number;
  document_ids_to_regenerate: string[];
}

type ViewState = "status" | "plan" | "result";

/* ── Props ───────────────────────────────────────────────────────────────── */

interface Props {
  projectId: string;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export function CharacterEntityMergePanel({ projectId }: Props) {
  const [view, setView] = useState<ViewState>("status");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status view data
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);

  // Plan view data
  const [merges, setMerges] = useState<MergeItem[]>([]);

  // Execute result data
  const [result, setResult] = useState<ExecuteResult | null>(null);

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  const invokeMerge = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "character-entity-merge",
          { body: { action, projectId, ...extra } },
        );
        if (fnError) throw new Error(typeof fnError === "string" ? fnError : fnError.message);
        return data;
      } catch (e: any) {
        const msg = e?.message || "Unknown error";
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const handleStatus = useCallback(async () => {
    const data = await invokeMerge("status");
    if (data) {
      setClusters(data.potential_duplicates ?? []);
      setView("status");
      setResult(null);
    }
  }, [invokeMerge]);

  const handlePlan = useCallback(async () => {
    const data = await invokeMerge("plan");
    if (data) {
      setMerges(data.merges ?? []);
      setView("plan");
      setResult(null);
    }
  }, [invokeMerge]);

  const handleExecute = useCallback(async () => {
    const data = await invokeMerge("execute", { merges });
    if (data) {
      setResult(data);
      setView("result");
    }
  }, [invokeMerge, merges]);

  /* ── Render helpers ──────────────────────────────────────────────────── */

  const renderStatus = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {clusters.length > 0
            ? `Found ${clusters.length} potential duplicate cluster${clusters.length !== 1 ? "s" : ""}`
            : "Check for duplicate character entities in this project."}
        </p>
        <Button onClick={handlePlan} disabled={loading || clusters.length === 0}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Merge className="mr-2 h-4 w-4" />
          )}
          Generate Merge Plan
        </Button>
      </div>

      {clusters.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entities</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Scene Links</TableHead>
                <TableHead className="text-right">Relations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.map((c) => (
                <TableRow key={c.cluster_id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-wrap gap-1">
                      {c.names.map((name, i) => (
                        <Badge key={i} variant="secondary">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.reason}</TableCell>
                  <TableCell className="text-right">{c.scene_links_count}</TableCell>
                  <TableCell className="text-right">{c.relation_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  const renderPlan = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {merges.length > 0
            ? `${merges.length} merge operation${merges.length !== 1 ? "s" : ""} prepared`
            : "No merge operations to display."}
        </p>
        <Button
          onClick={handleExecute}
          disabled={loading || merges.length === 0}
          variant="destructive"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Shuffle className="mr-2 h-4 w-4" />
          )}
          Execute Merge
        </Button>
      </div>

      {merges.map((m, idx) => (
        <Card key={m.canonical_entity_id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge variant="default">{idx + 1}</Badge>
              <span>Canonical: <span className="text-primary">{m.canonical_name}</span></span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Absorbed */}
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Entities to Absorb
              </p>
              <div className="flex flex-wrap gap-1">
                {m.absorbed_names.map((name, i) => (
                  <Badge key={i} variant="outline">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3 text-center">
                <p className="text-lg font-semibold">{m.scene_links_to_repair}</p>
                <p className="text-xs text-muted-foreground">Scene Links</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-lg font-semibold">{m.relations_to_repair}</p>
                <p className="text-xs text-muted-foreground">Relations</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-lg font-semibold">{m.aliases_to_insert.length}</p>
                <p className="text-xs text-muted-foreground">Aliases</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-lg font-semibold">{m.document_sections_to_merge}</p>
                <p className="text-xs text-muted-foreground">Doc Sections</p>
              </div>
            </div>

            {m.aliases_to_insert.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Aliases to Insert
                </p>
                <div className="flex flex-wrap gap-1">
                  {m.aliases_to_insert.map((alias, i) => (
                    <Badge key={i} variant="secondary">
                      {alias}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderResult = () => {
    if (!result) return null;

    const stats = [
      { label: "Merges Completed", value: result.merges_completed },
      { label: "Scene Links Repaired", value: result.scene_links_repaired },
      { label: "Relations Repaired", value: result.relations_repaired },
      { label: "Aliases Inserted", value: result.aliases_inserted },
      { label: "Entities Deleted", value: result.entities_deleted },
    ];

    return (
      <div className="space-y-4">
        <Alert variant={result.success ? "default" : "destructive"}>
          {result.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertTitle>
            {result.success ? "Merge Completed Successfully" : "Merge Encountered Issues"}
          </AlertTitle>
          <AlertDescription>
            {result.success
              ? "All merge operations have been applied. Document regeneration has been queued."
              : "Some operations may not have completed. Check the results below."}
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md border p-3 text-center">
              <p className="text-lg font-semibold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {result.document_ids_to_regenerate.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Documents Queued for Regeneration ({result.document_ids_to_regenerate.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {result.document_ids_to_regenerate.map((id) => (
                <Badge key={id} variant="outline" className="font-mono text-[11px]">
                  {id.slice(0, 12)}&hellip;
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex pt-2">
          <Button variant="outline" onClick={() => { setView("status"); setResult(null); }}>
            <Table2 className="mr-2 h-4 w-4" />
            Back to Status
          </Button>
        </div>
      </div>
    );
  };

  /* ── Error banner ─────────────────────────────────────────────────────── */

  const errorBanner = error ? (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  /* ── View label / navigation ──────────────────────────────────────────── */

  const viewTabs = [
    { key: "status" as ViewState, label: "Status", icon: Table2 },
    { key: "plan" as ViewState, label: "Merge Plan", icon: Merge },
    { key: "result" as ViewState, label: "Results", icon: CheckCircle2 },
  ];

  /* ── Main render ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Section heading */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Character Entity Merge</h2>
        <p className="text-sm text-muted-foreground">
          Detect, plan, and execute deduplication of character entities across scenes and relations.
        </p>
      </div>

      <Separator />

      {/* View switcher */}
      <div className="flex gap-1 rounded-md bg-muted p-1">
        {viewTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            disabled={tab.key === "plan" && clusters.length === 0 && merges.length === 0}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              view === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              tab.key === "plan" && clusters.length === 0 && merges.length === 0 && "opacity-40 cursor-not-allowed",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {errorBanner}

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-3 text-sm text-muted-foreground">Processing...</span>
        </div>
      )}

      {/* Initial status fetch */}
      {!loading && view === "status" && clusters.length === 0 && !error && (
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-sm text-muted-foreground">
            No duplicate data loaded yet. Fetch the current status to begin.
          </p>
          <Button onClick={handleStatus} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Table2 className="mr-2 h-4 w-4" />
            )}
            Check for Duplicates
          </Button>
        </div>
      )}

      {/* View content */}
      {!loading && view === "status" && clusters.length > 0 && renderStatus()}
      {!loading && view === "plan" && renderPlan()}
      {!loading && view === "result" && renderResult()}
    </div>
  );
}

export default CharacterEntityMergePanel;