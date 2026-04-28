import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/Header';
import { PageTransition } from '@/components/PageTransition';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAllAutoRunJobs, getStalenessStatus } from '@/hooks/useAllAutoRunJobs';
import { AutorunMonitorTable } from '@/components/devengine/AutorunMonitorTable';
import { StalenessAlertBanner } from '@/components/devengine/StalenessAlertBanner';

export default function AutorunMonitor() {
  const { data: jobs = [], isLoading, error } = useAllAutoRunJobs();
  const [dismissedStalled, setDismissedStalled] = useState<string[]>([]);

  const stalledJobs = useMemo(() =>
    jobs.filter(j => getStalenessStatus(j) === 'stalled' && !dismissedStalled.includes(j.id)),
    [jobs, dismissedStalled]
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <PageTransition>
        <div className="container max-w-7xl mx-auto py-6 px-4 space-y-6">
          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Autorun Monitor</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Real-time status of all autorun jobs across projects
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {jobs.length} total job{jobs.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {/* Staleness alert banner */}
          {stalledJobs.length > 0 && (
            <StalenessAlertBanner
              stalledJobs={stalledJobs}
              onDismiss={(id) => setDismissedStalled(prev => [...prev, id])}
            />
          )}

          {/* Loading / error states */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading autorun jobs…</span>
            </div>
          )}

          {error && (
            <Card className="p-6 border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-3 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Failed to load autorun jobs</p>
                  <p className="text-sm opacity-80">{error.message}</p>
                </div>
              </div>
            </Card>
          )}

          {!isLoading && !error && (
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="running">Running</TabsTrigger>
                <TabsTrigger value="stalled">Stalled</TabsTrigger>
                <TabsTrigger value="failed">Failed</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>

              {(['all', 'running', 'stalled', 'failed', 'completed'] as const).map(tab => (
                <TabsContent key={tab} value={tab} className="mt-4">
                  <AutorunMonitorTable jobs={jobs} filter={tab} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </PageTransition>
    </div>
  );
}
