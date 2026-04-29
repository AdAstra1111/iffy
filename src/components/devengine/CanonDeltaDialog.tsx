import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'; // Assuming existing dialog component
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Utility functions to fetch and compare versions
async function fetchLatestApprovedVersion(projectId: string, docType: string) {
  const { data, error } = await supabase
    .from('project_document_versions')
    .select('id, meta_json, version_number')
    .eq('project_id', projectId)
    .eq('doc_type', docType)
    .eq('approval_status', 'approved')
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  if (error) throw new Error('Failed to fetch approved version');
  return data;
}

async function fetchCurrentVersion(projectId: string, docType: string, versionId: string) {
  const { data, error } = await supabase
    .from('project_document_versions')
    .select('id, meta_json, version_number')
    .eq('project_id', projectId)
    .eq('doc_type', docType)
    .eq('id', versionId)
    .single();

  if (error) throw new Error('Failed to fetch current version');
  return data;
}

// CanonDeltaDialog component
export function CanonDeltaDialog({
  projectId,
  docType,
  currentVersionId,
  onClose,
  onConfirm,
}: {
  projectId: string;
  docType: string;
  currentVersionId: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [scrollAcknowledged, setScrollAcknowledged] = useState(false);
  const [checkboxAcknowledged, setCheckboxAcknowledged] = useState(false);

  const { data: approvedVersion, isLoading: loadingApproved } = useQuery(['latestApprovedVersion', projectId, docType], () =>
    fetchLatestApprovedVersion(projectId, docType),
  );

  const { data: currentVersion, isLoading: loadingCurrent } = useQuery(
    ['currentVersion', projectId, docType, currentVersionId],
    () => fetchCurrentVersion(projectId, docType, currentVersionId),
  );

  // Compare field-level data here, and generate diffs
  const diffs = calculateFieldDiffs(approvedVersion?.meta_json, currentVersion?.meta_json);

  useEffect(() => {
    const handleScroll = () => {
      // Logic to detect if user has scrolled to the bottom
      const scrollableDiv = document.getElementById('delta-scroll-area');
      if (scrollableDiv && scrollableDiv.scrollTop + scrollableDiv.clientHeight >= scrollableDiv.scrollHeight) {
        setScrollAcknowledged(true);
      }
    };
    const scrollableDiv = document.getElementById('delta-scroll-area');
    scrollableDiv?.addEventListener('scroll', handleScroll);
    return () => scrollableDiv?.removeEventListener('scroll', handleScroll);
  }, []);

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
            {/* Render diffs here */}
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

  // Function to calculate field diffs could be defined here or imported
  function calculateFieldDiffs(approvedMeta, currentMeta) {
    // Logic to compute and return field-level differences
    return []; // Placeholder
  }
}

// FieldDiff component
function FieldDiff({ diff }: { diff: any }) {
  // Render individual diff items, using color for NEW/CHANGED/REMOVED
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