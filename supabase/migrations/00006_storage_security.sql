-- Private storage configuration for user-owned message attachments.
-- This migration is intended for Supabase projects where storage.objects exists.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv']::text[]
)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

-- Supabase manages storage.objects and already enables RLS on this table.
-- The project database role is not the table owner, so this state is verified
-- rather than altered here.

DROP POLICY IF EXISTS message_attachments_storage_insert ON storage.objects;
CREATE POLICY message_attachments_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

DROP POLICY IF EXISTS message_attachments_storage_select ON storage.objects;
CREATE POLICY message_attachments_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.message_attachments attachment
    JOIN public.messages message ON message.id = attachment.message_id
    JOIN public.conversation_members member ON member.conversation_id = message.conversation_id
    WHERE member.user_id = auth.uid()
      AND attachment.storage_path = name
  )
);

DROP POLICY IF EXISTS message_attachments_storage_delete ON storage.objects;
CREATE POLICY message_attachments_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- Atomic hiring/contract creation. The application passes only validated values;
-- ownership, proposal state, and all related writes are checked in one transaction.
CREATE OR REPLACE FUNCTION public.create_contract_for_proposal(
  p_client_user_id UUID,
  p_proposal_id UUID,
  p_title TEXT,
  p_terms_markdown TEXT,
  p_contract_type TEXT,
  p_total_amount_cents BIGINT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_client public.client_profiles%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status NOT IN ('shortlisted', 'accepted') THEN
    RAISE EXCEPTION 'Proposal is not eligible for hiring';
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_proposal.job_id FOR UPDATE;
  SELECT * INTO v_client FROM public.client_profiles WHERE id = v_job.client_id;
  IF v_client.user_id <> p_client_user_id THEN RAISE EXCEPTION 'Client is not the job owner'; END IF;
  IF p_contract_type NOT IN ('fixed_price', 'hourly') OR p_total_amount_cents <= 0 THEN RAISE EXCEPTION 'Invalid contract terms'; END IF;

  INSERT INTO public.contracts (job_id, proposal_id, client_id, consultant_id, title, terms_markdown, contract_type, payment_structure, total_amount_cents, status, start_date, end_date)
  VALUES (v_job.id, v_proposal.id, v_job.client_id, v_proposal.consultant_id, p_title, p_terms_markdown, p_contract_type,
          CASE WHEN p_contract_type = 'hourly' THEN 'hourly_capped'::payment_structure ELSE 'fixed_milestones'::payment_structure END,
          p_total_amount_cents, 'pending_acceptance', p_start_date, p_end_date)
  RETURNING * INTO v_contract;

  UPDATE public.proposals SET status = 'accepted', updated_at = now() WHERE id = v_proposal.id;
  UPDATE public.jobs SET status = 'hired', hired_at = now(), updated_at = now() WHERE id = v_job.id;
  RETURN v_contract;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contract_for_proposal(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, DATE) FROM PUBLIC;
