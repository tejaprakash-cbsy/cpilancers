-- =============================================================================
-- STAGE 16: FORUM
-- Tables and RLS policies for the community forum
-- =============================================================================

-- 1. ENUMS
CREATE TYPE forum_discussion_status AS ENUM ('open', 'locked', 'deleted');
CREATE TYPE forum_post_status AS ENUM ('active', 'deleted');

-- 2. TABLES

CREATE TABLE IF NOT EXISTS public.forum_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.forum_categories(id) ON DELETE RESTRICT,
    author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status forum_discussion_status NOT NULL DEFAULT 'open',
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    view_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    upvote_count INTEGER NOT NULL DEFAULT 0,
    accepted_post_id UUID, -- self-referencing to forum_posts added later
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discussion_id UUID NOT NULL REFERENCES public.forum_discussions(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    status forum_post_status NOT NULL DEFAULT 'active',
    upvote_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.forum_discussions ADD CONSTRAINT fk_accepted_post FOREIGN KEY (accepted_post_id) REFERENCES public.forum_posts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.forum_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    discussion_id UUID REFERENCES public.forum_discussions(id) ON DELETE CASCADE,
    post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT one_target_only CHECK ((discussion_id IS NOT NULL AND post_id IS NULL) OR (discussion_id IS NULL AND post_id IS NOT NULL)),
    CONSTRAINT one_vote_per_discussion UNIQUE (user_id, discussion_id),
    CONSTRAINT one_vote_per_post UNIQUE (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS public.forum_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    discussion_id UUID REFERENCES public.forum_discussions(id) ON DELETE CASCADE,
    post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT one_target_only CHECK ((discussion_id IS NOT NULL AND post_id IS NULL) OR (discussion_id IS NULL AND post_id IS NOT NULL))
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_forum_discussions_category_id ON public.forum_discussions(category_id);
CREATE INDEX IF NOT EXISTS idx_forum_discussions_author_id ON public.forum_discussions(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_discussions_last_activity ON public.forum_discussions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_discussion_id ON public.forum_posts(discussion_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author_id ON public.forum_posts(author_id);

-- 4. TRIGGERS FOR TIMESTAMPS
CREATE TRIGGER set_forum_discussions_updated_at BEFORE UPDATE ON public.forum_discussions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_forum_posts_updated_at BEFORE UPDATE ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS POLICIES
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;

-- Forum Categories
CREATE POLICY "Public can view categories" ON public.forum_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.forum_categories FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin'));

-- Forum Discussions
CREATE POLICY "Public can view active discussions" ON public.forum_discussions FOR SELECT USING (status != 'deleted');
CREATE POLICY "Users can create discussions" ON public.forum_discussions FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can edit their own discussions" ON public.forum_discussions FOR UPDATE TO authenticated USING (auth.uid() = author_id AND status != 'deleted') WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can delete their own discussions" ON public.forum_discussions FOR UPDATE TO authenticated USING (auth.uid() = author_id AND status != 'deleted') WITH CHECK (auth.uid() = author_id); -- Logical deletion handled by service

-- Forum Posts
CREATE POLICY "Public can view active posts" ON public.forum_posts FOR SELECT USING (status != 'deleted');
CREATE POLICY "Users can create posts" ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can edit their own posts" ON public.forum_posts FOR UPDATE TO authenticated USING (auth.uid() = author_id AND status != 'deleted') WITH CHECK (auth.uid() = author_id);

-- Forum Votes
CREATE POLICY "Public can view votes" ON public.forum_votes FOR SELECT USING (true);
CREATE POLICY "Users can manage their own votes" ON public.forum_votes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Forum Reports
CREATE POLICY "Admins can view reports" ON public.forum_reports FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin'));
CREATE POLICY "Users can create reports" ON public.forum_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- 6. DEFAULT CATEGORIES
INSERT INTO public.forum_categories (slug, name, description, sort_order) VALUES
('sap-integration', 'SAP & Integration', 'Discuss SAP CPI, PI/PO, API Management, and broader integration architecture.', 10),
('development', 'Development', 'Web, backend, frontend, and software engineering topics.', 20),
('ai-automation', 'AI & Automation', 'Artificial Intelligence, machine learning, and workflow automation.', 30),
('cybersecurity', 'Cybersecurity', 'Security best practices, compliance, and threat mitigation.', 40),
('freelancing', 'Freelancing', 'Tips, advice, and strategies for independent consultants.', 50),
('career', 'Career', 'Resume reviews, interview tips, and professional growth.', 60),
('projects', 'Projects', 'Showcase your work or ask for feedback on ongoing projects.', 70),
('troubleshooting', 'Troubleshooting', 'Get help with specific bugs, errors, or technical roadblocks.', 80),
('general', 'General', 'Anything else that doesn''t fit into other categories.', 90)
ON CONFLICT (slug) DO NOTHING;
