const fs = require('fs');

const path = 'src/services/proposal.service.ts';
let code = fs.readFileSync(path, 'utf8');

const targetStr = \
      // Apply transition
      const updatePayload: { status: ProposalStatus; updated_at: string; client_viewed_at?: string } = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'accepted') {
        updatePayload.client_viewed_at = new Date().toISOString();
      }
      if (note) {
        // We don't have a dedicated notes column; we could store notes in a future migration.
        // For now we skip persisting note, but it's available for future extension.
      }

      const { data: updated, error: updateErr } = await adminSupabase
        .from('proposals')
        .update(updatePayload)
        .eq('id', proposalId)
        .select('*')
        .single();

      if (updateErr) {
        throw new AppError('Failed to transition proposal status.', 500, 'DB_UPDATE_ERROR', updateErr);
      }
\;

const replacement = \
      let updated;
      
      // Apply transition
      if (newStatus === 'accepted') {
        const jobData = (proposal as any).job;
        const jobTitle = Array.isArray(jobData) ? jobData[0]?.title : jobData?.title;
        const contractType = jobData?.budget_type === 'hourly_rate' ? 'hourly' : 'fixed_price';
        
        // Transactionally create contract and update proposal to accepted
        const { error: rpcErr } = await adminSupabase.rpc('create_contract_for_proposal', {
          p_client_user_id: actorUserId,
          p_proposal_id: proposalId,
          p_title: \Contract: \\,
          p_terms_markdown: proposal.cover_letter_markdown,
          p_contract_type: contractType,
          p_total_amount_cents: proposal.proposed_price_cents
        });

        // 23505 is the PostgreSQL unique constraint violation error code.
        // If the contract already exists for this proposal, we consider this operation idempotent
        // and allow it to proceed to conversation creation.
        if (rpcErr && rpcErr.code !== '23505') {
          throw new AppError('Failed to accept proposal and create contract.', 500, 'DB_INSERT_ERROR', rpcErr);
        }
        
        // Fetch the updated proposal to maintain return shape
        const { data: refetched } = await adminSupabase.from('proposals').select('*').eq('id', proposalId).single();
        updated = refetched;
      } else {
        const updatePayload: { status: ProposalStatus; updated_at: string; client_viewed_at?: string } = {
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        if (note) {
          // Future extension
        }

        const { data: updatedData, error: updateErr } = await adminSupabase
          .from('proposals')
          .update(updatePayload)
          .eq('id', proposalId)
          .select('*')
          .single();

        if (updateErr) {
          throw new AppError('Failed to transition proposal status.', 500, 'DB_UPDATE_ERROR', updateErr);
        }
        updated = updatedData;
      }
\;

if (code.includes(targetStr.trim())) {
  code = code.replace(targetStr.trim(), replacement.trim());
  fs.writeFileSync(path, code);
  console.log('Successfully updated transition logic.');
} else {
  console.log('Target string not found.');
}
