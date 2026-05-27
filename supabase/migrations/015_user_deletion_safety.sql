-- Migration 015: User Deletion Safety
-- Change RESTRICT FKs on profiles(id) to SET NULL so user deletion doesn't block.
-- Owner deletion cascades to delete their projects.
-- Allow members to self-delete (leave project) via RLS.

-- 1. tasks.created_by → SET NULL
ALTER TABLE public.tasks DROP CONSTRAINT tasks_created_by_fkey;
ALTER TABLE public.tasks ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. comments.author_id → SET NULL
ALTER TABLE public.comments DROP CONSTRAINT comments_author_id_fkey;
ALTER TABLE public.comments ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE public.comments ADD CONSTRAINT comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. activity_log.actor_id → SET NULL
ALTER TABLE public.activity_log DROP CONSTRAINT activity_log_actor_id_fkey;
ALTER TABLE public.activity_log ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. attachments.uploaded_by → SET NULL
ALTER TABLE public.attachments DROP CONSTRAINT attachments_uploaded_by_fkey;
ALTER TABLE public.attachments ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. notifications.actor_id → SET NULL
ALTER TABLE public.notifications DROP CONSTRAINT notifications_actor_id_fkey;
ALTER TABLE public.notifications ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 6. project_members.invited_by → SET NULL (already nullable from 014)
ALTER TABLE public.project_members DROP CONSTRAINT project_members_invited_by_fkey;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 7. projects.created_by → CASCADE (owner deleted = project deleted)
ALTER TABLE public.projects DROP CONSTRAINT projects_created_by_fkey;
ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 8. RLS: allow members to delete their own membership (leave project)
DROP POLICY "members_delete" ON public.project_members;
CREATE POLICY "members_delete" ON public.project_members FOR DELETE USING (
  public.has_member_permission(project_members.project_id, auth.uid(), 'can_manage_members')
  OR auth.uid() = project_members.user_id
);
