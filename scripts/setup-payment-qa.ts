import { createAdminClient } from '../src/lib/supabase/admin';

async function setup() {
  const supabase = createAdminClient();
  
  // Get QA client and consultant
  const { data: client } = await supabase.from('users').select('id, email').eq('email', 'client.qa.test@example.com').single();
  const { data: consultant } = await supabase.from('users').select('id, email').eq('email', 'consultant.qa.test@example.com').single();
  
  const { data: clientProfile } = await supabase.from('client_profiles').select('id').eq('user_id', client.id).single();
  const { data: consultantProfile } = await supabase.from('consultant_profiles').select('id').eq('user_id', consultant.id).single();
  
  // Make sure payout enabled
  await supabase.from('consultant_profiles').update({ 
    razorpay_account_id: 'acc_mock123', 
    payouts_enabled: true 
  }).eq('id', consultantProfile.id);

  // Create Job
  const { data: job, error: jobErr } = await supabase.from('jobs').insert({
    client_id: clientProfile.id,
    title: `Payment QA Job ${Date.now()}`,
    description_markdown: 'Test job for payments',
    status: 'open',
    visibility: 'public',
    budget_type: 'fixed_price',
    budget_min: 5000,
    budget_max: 10000,
    currency: 'USD'
  }).select('*').single();

  if (jobErr) console.error(jobErr);

  // Create Proposal
  const { data: proposal, error: propErr } = await supabase.from('proposals').insert({
    job_id: job.id,
    consultant_id: consultantProfile.id,
    status: 'submitted',
    proposed_price_cents: 800000,
    currency: 'USD',
    cover_letter_markdown: 'Payment test proposal'
  }).select('*').single();

  if (propErr) console.error(propErr);

  // Accept Proposal
  const { error: accErr } = await supabase.rpc('create_contract_for_proposal', {
    p_client_user_id: client.id,
    p_proposal_id: proposal.id,
    p_title: `Contract: ${job.title}`,
    p_terms_markdown: proposal.cover_letter_markdown,
    p_contract_type: 'fixed_price',
    p_total_amount_cents: proposal.proposed_price_cents
  });

  if (accErr) console.error(accErr);

  // Wait
  await new Promise(r => setTimeout(r, 1000));

  const { data: contract } = await supabase.from('contracts').select('id').eq('proposal_id', proposal.id).single();
  console.log(`Created contract: ${contract.id}`);
}

setup().catch(console.error);
