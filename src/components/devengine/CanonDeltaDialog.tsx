import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface VersionData {
  id: string;
  meta_json: Record<string, unknown>;
  version_number: number;
}

// CanonDeltaDialog component
// NOTE: Data fetching (approvedVersion, currentVersion) is done in the parent (PDE)
// to avoid useQuery context issues. This component only handles the display.
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
  const [scrollAcknowledged, setScrollAcknowledged] = useState(false);
  const [checkboxAcknowledged, setCheckboxAcknowledged] = useState(false);

  const diffs = calculateFieldDiffs(approvedVersion?.meta_json, currentVersion?.meta_json);

  useEffect(() => {
    const handleScroll = () => {
      const scrollableDiv = document.getElementById('delta-scroll-area');
      if (scrollableDiv && scrollableDiv.scrollTop + scrollableDiv.clientHeight >= scrollableDiv.scrollHeight) {
        setScrollAcknowledged(true);
      }
    };
    const scrollableDiv = document.getElementById('delta-scroll-area');
    scrollableDiv?.addEventListener('scroll', handleScroll);
    return () => scrollableDiv?.removeEventListener('scroll', handleScroll);
  }, []);

  const loadingApproved = !approvedVersion;
  const loadingCurrent = !currentVersion;

  return (
    <Dialog open={true} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Canon Field Delta</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {loadingApproved || loadingCurrent ? (
          <p>Loading...</p>
        ) : (
          <div id="delta-scroll-area" className="overflow-y-scroll h-[60vh]">
            {diffs.map((diff, index) => (
              <FieldDiff key={index} diff={diff} />
            ))}
          </div>
        )}
        <Checkbox
          label="I understand the impact"
          checked={checkboxAcknowledged}
          onChange={(e) => setCheckboxAcknowledged(e.target.checked)}
        />
      </DialogContent>
      <DialogFooter>
        <Button
          onClick={onConfirm}
          disabled={!scrollAcknowledged && !checkboxAcknowledged}
        >
          Confirm Approval
        </Button>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
      </DialogFooter>
    </Dialog>
  );

  function calculateFieldDiffs(approvedMeta, currentMeta) {
    return [];
  }
}

function FieldDiff({ diff }: { diff: any }) {
  return (
    <div>
      {diff.type === 'new' && <span className="text-green-600">NEW: {diff.field}</span>}
      {diff.type === 'changed' && (
        <span className="text-yellow-600">
          CHANGED: {diff.field} ({diff.oldValue} &rarr; {diff.newValue})
        </span>
      )}
      {diff.type === 'removed' && <span className="text-red-600">REMOVED: {diff.field}</span>}
    </div>
  );
}