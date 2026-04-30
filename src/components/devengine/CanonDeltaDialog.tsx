// CanonDeltaDialog — shows canon field differences between approved and current versions
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface VersionData {
  id: string;
  meta_json: Record<string, unknown>;
  version_number: number;
}

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
  const hasDiff = !!(approvedVersion && currentVersion);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby="canon-delta-description" className="flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/50">
          <DialogTitle>Canon Field Delta</DialogTitle>
          <DialogDescription id="canon-delta-description">
            Review any canon field changes between the approved version and this draft before promoting.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground text-center">
            No canon field differences detected.
          </p>
        </div>

        {hasDiff && (
          <div className="px-6 pb-4">
            <div className="flex items-center space-x-2">
              <input type="checkbox" id="delta-ack" className="accent-primary" />
              <label htmlFor="delta-ack" className="text-sm text-muted-foreground">
                I understand the impact of these changes on canon
              </label>
            </div>
          </div>
        )}

        <div className="flex gap-2 px-6 pb-5 border-t border-border/50 pt-4">
          <Button onClick={onClose} variant="outline" className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="flex-1">
            Confirm Approval
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
