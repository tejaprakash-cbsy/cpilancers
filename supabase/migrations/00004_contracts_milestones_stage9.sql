-- Stage 9: hiring contracts and milestone lifecycle.
-- Payment provider integration is intentionally not included; funding is represented
-- by the milestone state only until the payment ledger is wired to a provider.

ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'funded';
ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'disputed';

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE public.contracts
SET contract_type = CASE
  WHEN payment_structure = 'hourly_capped' THEN 'hourly'
  ELSE 'fixed_price'
END
WHERE contract_type IS NULL;

ALTER TABLE public.contracts
  ALTER COLUMN contract_type SET DEFAULT 'fixed_price',
  ADD CONSTRAINT contracts_contract_type_check CHECK (contract_type IN ('fixed_price', 'hourly')),
  ADD CONSTRAINT contracts_date_order_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

-- Keep the database as a second authorization boundary. Service methods also check
-- the same ownership rules before using the admin client for controlled writes.
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_client_profile_owner(profile_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_profiles WHERE id = profile_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_consultant_profile_owner(profile_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.consultant_profiles WHERE id = profile_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.can_access_contract(contract_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_uuid
      AND (public.is_client_profile_owner(c.client_id) OR public.is_consultant_profile_owner(c.consultant_id))
  )
$$;

DROP POLICY IF EXISTS contracts_participants_select ON public.contracts;
CREATE POLICY contracts_participants_select ON public.contracts
  FOR SELECT USING (
    public.is_client_profile_owner(client_id)
    OR public.is_consultant_profile_owner(consultant_id)
  );

DROP POLICY IF EXISTS milestones_participants_select ON public.milestones;
CREATE POLICY milestones_participants_select ON public.milestones
  FOR SELECT USING (
    public.can_access_contract(contract_id)
  );
