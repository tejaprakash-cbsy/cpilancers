-- Security hardening for Stages 1-9.
-- Server services use the service role for controlled mutations. Browser clients
-- receive read-only access subject to these ownership/public visibility policies.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.users, public.profiles, public.companies,
  public.client_profiles, public.consultant_profiles, public.skills,
  public.consultant_skills, public.certifications, public.consultant_certifications,
  public.portfolios, public.jobs, public.job_skills, public.proposals
  FROM anon, authenticated;

-- These tables contain billing, payout, and private account fields. They must
-- only be read through server endpoints that project a safe response.
REVOKE SELECT ON public.users, public.companies, public.client_profiles,
  public.consultant_profiles FROM anon, authenticated;
GRANT SELECT ON public.users TO authenticated;

CREATE OR REPLACE FUNCTION public.is_job_owner(job_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_uuid AND public.is_client_profile_owner(j.client_id)
  )
$$;

DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
CREATE POLICY profiles_select_public ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS skills_select_active ON public.skills;
CREATE POLICY skills_select_active ON public.skills FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS consultant_skills_select_public ON public.consultant_skills;
CREATE POLICY consultant_skills_select_public ON public.consultant_skills FOR SELECT USING (true);

DROP POLICY IF EXISTS certifications_select_active ON public.certifications;
CREATE POLICY certifications_select_active ON public.certifications FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS consultant_certifications_select_public ON public.consultant_certifications;
CREATE POLICY consultant_certifications_select_public ON public.consultant_certifications FOR SELECT USING (verification_status = 'verified' OR public.is_consultant_profile_owner(consultant_id));

DROP POLICY IF EXISTS portfolios_select_public ON public.portfolios;
CREATE POLICY portfolios_select_public ON public.portfolios FOR SELECT USING (true);

DROP POLICY IF EXISTS jobs_select_public ON public.jobs;
CREATE POLICY jobs_select_public ON public.jobs FOR SELECT USING (status IN ('open', 'in_review') OR public.is_job_owner(id));

DROP POLICY IF EXISTS job_skills_select_public ON public.job_skills;
CREATE POLICY job_skills_select_public ON public.job_skills FOR SELECT USING (job_id IN (SELECT id FROM public.jobs WHERE status IN ('open', 'in_review')) OR public.is_job_owner(job_id));

DROP POLICY IF EXISTS proposals_select_participant ON public.proposals;
CREATE POLICY proposals_select_participant ON public.proposals FOR SELECT USING (
  public.is_consultant_profile_owner(consultant_id)
  OR public.is_job_owner(job_id)
);
