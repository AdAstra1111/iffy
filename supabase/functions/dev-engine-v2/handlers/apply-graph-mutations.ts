import { addManualEntity } from "../../_shared/narrativeEntityEngine.ts";
export async function applyGraphMutationsHandler(supabase, serviceSupabase, input) {
  const { projectId, proposalIds, approved, reviewComment } = input;
  const entitiesCreated = [];
  const errors = [];
  for (const proposalId of proposalIds || []){
    try {
      // 1. Fetch proposal — validate it exists, belongs to project, is pending
      const { data: proposal, error: fetchError } = await supabase.from('graph_mutation_proposals').select('*').eq('id', proposalId).eq('project_id', projectId).single();
      if (fetchError || !proposal) {
        errors.push(`Proposal ${proposalId} not found or not accessible`);
        continue;
      }
      if (proposal.proposal_status !== 'pending') {
        errors.push(`Proposal ${proposalId} has status "${proposal.proposal_status}", expected "pending"`);
        continue;
      }
      if (!approved) {
        // Rejection path
        const { error: updateError } = await serviceSupabase.from('graph_mutation_proposals').update({
          proposal_status: 'rejected',
          review_comment: reviewComment || null,
          reviewed_at: new Date().toISOString()
        }).eq('id', proposalId);
        if (updateError) {
          errors.push(`Failed to reject proposal ${proposalId}: ${updateError.message}`);
        }
        continue;
      }
      // Approval path
      const pj = proposal.proposal_json;
      // 2. Generate entity_key
      const entityKey = pj.entity_key;
      // 3. Check for duplicate entity_key (additional safety net)
      const { data: existingEntity } = await supabase.from('narrative_entities').select('id').eq('project_id', projectId).eq('entity_key', entityKey).maybeSingle();
      if (existingEntity) {
        // Mark proposal as failed with duplicate error
        await serviceSupabase.from('graph_mutation_proposals').update({
          proposal_status: 'failed',
          error_log: `Entity with key ${entityKey} already exists`,
          reviewed_at: new Date().toISOString()
        }).eq('id', proposalId);
        errors.push(`Entity ${entityKey} already exists in project`);
        continue;
      }
      // 4. Call addManualEntity() to insert into narrative_entities and canon
      const result = await addManualEntity(serviceSupabase, projectId, {
        proposedName: pj.proposed_name,
        proposedRole: pj.proposed_role,
        proposedDescription: pj.proposed_description,
        entityKey: entityKey,
        sourceProposalId: proposalId
      });
      if (result.error) {
        await serviceSupabase.from('graph_mutation_proposals').update({
          proposal_status: 'failed',
          error_log: result.error,
          reviewed_at: new Date().toISOString()
        }).eq('id', proposalId);
        errors.push(`Failed to create entity for proposal ${proposalId}: ${result.error}`);
        continue;
      }
      // 5. Mark proposal as applied
      await serviceSupabase.from('graph_mutation_proposals').update({
        proposal_status: 'applied',
        applied_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString()
      }).eq('id', proposalId);
      entitiesCreated.push({
        entity_id: result.entityId,
        entity_key: entityKey,
        canonical_name: pj.proposed_name
      });
    } catch (err) {
      errors.push(`Error processing proposal ${proposalId}: ${err?.message || 'Unknown error'}`);
    }
  }
  return {
    ok: errors.length === 0 || entitiesCreated.length > 0,
    applied: entitiesCreated.length,
    entities_created: entitiesCreated,
    errors: errors.length > 0 ? errors : undefined
  };
}
