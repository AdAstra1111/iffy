import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; // Assuming existing table component
import { toast } from 'sonner';

// Utility functions to fetch project document status
async function fetchCanonicalDocs(projectId: string) {
  const { data, error } = await supabase
    .from('project_document_versions')
    .select('doc_type, version_number, approval_status, meta_json')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .eq('approval_status', 'approved');

  if (error) {
    toast.error('Failed to fetch canonical documents');
    return [];
  }
  return data;
}

export function CanonFeedStatusPanel({ projectId }: { projectId: string }) {
  const { data: canonDocs, isLoading } = useQuery(['canonicalDocs', projectId], () =>
    fetchCanonicalDocs(projectId),
  );

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold">Current Canonical Documents</h2>
      {isLoading ? (
        <p>Loading status...</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Document Type</TableHeader>
              <TableHeader>Version</TableHeader>
              <TableHeader>Approval Status</TableHeader>
              <TableHeader>Violations</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {canonDocs?.map((doc: any) => (
              <TableRow key={doc.doc_type}>
                <TableCell>{doc.doc_type}</TableCell>
                <TableCell>{doc.version_number}</TableCell>
                <TableCell>{doc.approval_status}</TableCell>
                <TableCell>{doc.meta_json?.canon_drift?.violations || 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}