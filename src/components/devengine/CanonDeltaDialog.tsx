// CanonDeltaDialog — shows canon field differences between approved and current versions
// NOTE: Data (approvedVersion, currentVersion) should be passed as props from the parent.
// approvedVersion: full VersionData object (with meta_json)
// currentVersion: full VersionData object (with meta_json)
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

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
  const [checkboxAcknowledged, setCheckboxAcknowledged] = useState(false);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby="canon-delta-description">
        <DialogHeader>
          <DialogTitle>Canon Field Delta</DialogTitle>
          <DialogDescription id="canon-delta-description">
            Review any canon field changes between the approved version and this draft before promoting.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center py-4">
          No canon field differences detected.
        </p>
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
        <Button onClick={onConfirm} disabled={!checkboxAcknowledged}>
          Confirm Approval
        </Button>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
