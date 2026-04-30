import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface VersionData {
  id: string;
  meta_json: Record<string, unknown>;
  version_number: number;
}

// CanonDeltaDialog — shows canon field differences between approved and current versions
// NOTE: Data (approvedVersion, currentVersion) should be passed as props from the parent.
// The parent should fetch this data using its own useQuery/useDevEngineV2 hook.
// This component only handles diff display and user acknowledgment.
export function CanonDeltaDialog({
  projectId,
  docType,
  currentVersionId,
  onClose,
  onConfirm,
  approvedVersion,
  currentVersion,
}: {
  projectId: string;
  docType: string;
  currentVersionId: string;
  onClose: () => void;
  onConfirm: () => void;
  approvedVersion?: VersionData;
  currentVersion?: VersionData;
}) {
  const [checkboxAcknowledged, setCheckboxAcknowledged] = useState(false);
  const diffs = calculateFieldDiffs(approvedVersion?.meta_json, currentVersion?.meta_json);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby="canon-delta-description">
        <DialogHeader>
          <DialogTitle>Canon Field Delta</DialogTitle>
          <DialogDescription id="canon-delta-description">
            Review any canon field changes between the approved version and this draft before promoting.
          </DialogDescription>
        </DialogHeader>
        {diffs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No canon field differences detected.
          </p>
        ) : (
          <div id="delta-scroll-area" className="overflow-y-scroll h-[60vh]">
            {diffs.map((diff, index) => (
              <FieldDiff key={index} diff={diff} />
            ))}
          </div>
        )}
        {approvedVersion && currentVersion && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="delta-ack"
              checked={checkboxAcknowledged}
              onCheckedChange={(checked) => setCheckboxAcknowledged(!!checked)}
            />
            <label htmlFor="delta-ack" className="text-sm text-muted-foreground">
              I understand the impact of these changes on canon
            </label>
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button
          onClick={onConfirm}
          disabled={!checkboxAcknowledged}
        >
          Confirm Approval
        </Button>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
      </DialogFooter>
    </Dialog>
  );

  function calculateFieldDiffs(approvedMeta: Record<string, unknown> | undefined, currentMeta: Record<string, unknown> | undefined) {
    if (!approvedMeta || !currentMeta) return [];
    // Compare top-level string fields between approved and current
    const diffs: Array<{type: string; field: string; oldValue?: string; newValue?: string}> = [];
    const approvedFields = Object.entries(approvedMeta).filter(([, v]) => typeof v === 'string');
    const currentFields = Object.entries(currentMeta);
    const currentMap = new Map(currentFields);

    for (const [key, oldVal] of approvedFields) {
      const newVal = currentMap.get(key);
      if (newVal === undefined) {
        diffs.push({ type: 'removed', field: key });
      } else if (newVal !== oldVal) {
        diffs.push({ type: 'changed', field: key, oldValue: oldVal as string, newValue: newVal as string });
      }
    }
    for (const [key, newVal] of currentFields) {
      if (!currentMap.has(key) && !(key in Object.fromEntries(approvedFields))) {
        diffs.push({ type: 'new', field: key });
      }
    }
    return diffs;
  }
}

function FieldDiff({ diff }: { diff: any }) {
  return (
    <div className="py-1 text-sm">
      {diff.type === 'new' && <span className="text-green-600 font-medium">+ NEW: {diff.field}</span>}
      {diff.type === 'changed' && (
        <span className="text-yellow-600 font-medium">
          ~ CHANGED: {diff.field}
          <br />
          <span className="text-muted-foreground">  before: </span>{diff.oldValue}
          <br />
          <span className="text-muted-foreground">  after: </span>{diff.newValue}
        </span>
      )}
      {diff.type === 'removed' && <span className="text-red-600 font-medium">- REMOVED: {diff.field}</span>}
    </div>
  );
}
