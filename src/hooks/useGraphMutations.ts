import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

interface GraphMutationProposal {
  id: string;
  project_id: string;
  run_id: string | null;
  source_note_id: string | null;
  mutation_type: string;
  entity_type: string;
  proposal_json: {
    proposed_name: string;
    proposed_role: string;
    proposed_description: string;
    entity_key: string;
    rationale: string;
    confidence: number;
    editor_notes?: string;
  };
  proposal_status: 'pending' | 'approved' | 'rejected' | 'failed' | 'applied';
  review_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
  applied_at: string | null;
  error_log: string | null;
}

interface ClassifyMutationsParams {
  projectId: string;
  documentId: string;
  versionId: string;
  approvedNotes: any[];
}

export function useGraphMutations() {
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<GraphMutationProposal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const classifyMutations = async (params: ClassifyMutationsParams): Promise<GraphMutationProposal[]> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('dev-engine-v2', {
        body: { action: 'classify_mutations', ...params },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || 'Classification failed');
      setProposals(data.proposals || []);
      return data.proposals || [];
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const approveMutation = async (proposalId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('dev-engine-v2', {
        body: { action: 'apply_graph_mutations', projectId: proposals[0]?.project_id, proposalIds: [proposalId], approved: true },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || 'Approval failed');
      setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, proposal_status: 'applied' } : p));
      return true;
    } catch (err: any) {
      setError(err?.message || 'Approval failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const rejectMutation = async (proposalId: string, comment?: string): Promise<boolean> => {
    setLoading(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('dev-engine-v2', {
        body: { action: 'apply_graph_mutations', projectId: proposals[0]?.project_id, proposalIds: [proposalId], approved: false, reviewComment: comment },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || 'Rejection failed');
      setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, proposal_status: 'rejected', review_comment: comment } : p));
      return true;
    } catch (err: any) {
      setError(err?.message || 'Rejection failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const approveAll = async (): Promise<boolean> => {
    const pending = proposals.filter(p => p.proposal_status === 'pending');
    let allSuccess = true;
    for (const p of pending) {
      const ok = await approveMutation(p.id);
      if (!ok) allSuccess = false;
    }
    return allSuccess;
  };

  const fetchPendingProposals = async (projectId: string): Promise<GraphMutationProposal[]> => {
    try {
      const { data, error } = await supabase
        .from('graph_mutation_proposals')
        .select('*')
        .eq('project_id', projectId)
        .eq('proposal_status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProposals(data || []);
      return data || [];
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch proposals');
      return [];
    }
  };

  return { proposals, loading, error, classifyMutations, approveMutation, rejectMutation, approveAll, fetchPendingProposals };
}

export type { GraphMutationProposal, ClassifyMutationsParams };