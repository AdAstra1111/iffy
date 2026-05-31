/**
 * CharacterBibleSectionProgress — Section card progress UI for character bible rewrites.
 *
 * Splits the character bible text by ## headers on the frontend and displays
 * one card per section. Card status reflects the pipeline's overall progress:
 * - All sections "pending" before pipeline starts
 * - All sections "writing" while pipeline processes the single chunk
 * - All sections "complete" after pipeline finishes
 *
 * This works without backend deploy — the section split is purely frontend.
 * The pipeline processes the full text as one chunk; the cards provide visual
 * feedback about which sections exist in the document.
 */
import { useMemo } from 'react';
import { Loader2, CheckCircle, Clock, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface CharacterBibleSectionProgressProps {
  /** The full plaintext of the character bible version */
  versionText: string;
  /** Pipeline status */
  pipelineStatus: 'idle' | 'planning' | 'writing' | 'assembling' | 'complete' | 'error';
  /** Current chunk index (0-based) */
  currentChunk: number;
  /** Total chunks in pipeline plan */
  totalChunks: number;
  /** Smoothed percent from pipeline */
  smoothedPercent: number;
}

function extractSectionTitle(line: string): string {
  return line.replace(/^#{2,3}\s+/, '').trim();
}

export function CharacterBibleSectionProgress({
  versionText,
  pipelineStatus,
  currentChunk,
  totalChunks,
  smoothedPercent,
}: CharacterBibleSectionProgressProps) {
  // Split text by ## headers — this is the frontend split that bypasses the backend regex
  const sections = useMemo(() => {
    if (!versionText) return [];
    const lines = versionText.split('\n');
    const result: { title: string; content: string }[] = [];
    let current: { title: string; content: string } | null = null;

    for (const line of lines) {
      // Split on ### headers for character sections (e.g. "### 1. Marcus Cole (Protagonist)")
      // or "### Marcus Cole & Sarah Chen" for relationship entries
      // Skip ## headers — they're top-level containers (CHARACTER BIBLE, PRINCIPAL CHARACTERS)
      const isHeader = /^###\s+/i.test(line.trim());
      if (isHeader && line.trim()) {
        if (current && current.content.trim()) {
          result.push(current);
        }
        current = {
          title: extractSectionTitle(line),
          content: line + '\n',
        };
      } else if (current) {
        current.content += line + '\n';
      }
    }
    if (current && current.content.trim()) {
      result.push(current);
    }

    // Log the split
    console.log(
      `[CHAR_BIBLE_SECTION_SPLIT] sectionCount=${result.length} ` +
      `sectionTitles="${result.map(s => s.title).join(', ')}"`
    );

    return result;
  }, [versionText]);

  // Determine status for each section based on pipeline state
  const isPipelineRunning = pipelineStatus === 'writing' || pipelineStatus === 'assembling';
  const isPipelineComplete = pipelineStatus === 'complete';
  const isLoading = pipelineStatus === 'planning';
  const hasError = pipelineStatus === 'error';

  const sectionStatus = isPipelineComplete ? 'complete' as const
    : isPipelineRunning ? 'writing' as const
    : hasError ? 'error' as const
    : isLoading ? 'planning' as const
    : 'pending' as const;

  // Log the progress
  console.log(
    `[CHAR_BIBLE_SECTION_PROGRESS] status="${sectionStatus}" ` +
    `pipelineStatus="${pipelineStatus}" currentChunk=${currentChunk} totalChunks=${totalChunks} ` +
    `sectionCount=${sections.length}`
  );

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[100px] gap-2 text-muted-foreground">
        <p className="text-sm">No sections found in character bible text.</p>
      </div>
    );
  }

  const progressLabel = isPipelineComplete ? 'Complete'
    : sectionStatus === 'writing' ? `Writing — ${currentChunk} of ${totalChunks} chunks`
    : sectionStatus === 'planning' ? 'Planning rewrite…'
    : sectionStatus === 'error' ? 'Error'
    : 'Pending';

  return (
    <div className="flex flex-col w-full space-y-3">
      {/* Overall progress bar */}
      <div className="w-full space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">
            Character Bible Sections
          </span>
          <span className="text-muted-foreground">
            {sections.length} sections {isPipelineRunning ? `— ${Math.round(smoothedPercent)}%` : ''}
          </span>
        </div>
        <Progress
          value={isPipelineComplete ? 100 : smoothedPercent}
          className="h-1.5"
        />
        <p className="text-[10px] text-muted-foreground text-center">{progressLabel}</p>
      </div>

      {/* Section cards */}
      <div className="w-full space-y-1.5 max-h-[300px] overflow-y-auto">
        {sections.map((section, idx) => {
          const cardIcon = sectionStatus === 'complete'
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            : sectionStatus === 'writing'
              ? <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
              : sectionStatus === 'planning'
                ? <Loader2 className="h-3.5 w-3.5 text-muted-foreground/50 animate-spin shrink-0" />
                : <Clock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />;

          const borderColor = sectionStatus === 'complete'
            ? 'border-emerald-500/20'
            : sectionStatus === 'writing'
              ? 'border-blue-500/30'
              : 'border-border/20';

          const charCount = section.content.length;

          return (
            <Card key={idx} className={`transition-all duration-200 ${borderColor}`}>
              <CardContent className="p-2.5">
                <div className="flex items-center gap-2">
                  <div className="shrink-0">{cardIcon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                        <h4 className="text-xs font-medium text-foreground truncate">
                          {section.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] text-muted-foreground/60">
                          {charCount.toLocaleString()} chars
                        </span>
                        <span className={`text-[9px] capitalize ${
                          sectionStatus === 'complete' ? 'text-emerald-400' :
                          sectionStatus === 'writing' ? 'text-blue-400' :
                          'text-muted-foreground/40'
                        }`}>
                          {sectionStatus}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
