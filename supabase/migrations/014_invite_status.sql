-- ============================================
-- Migration 014: Invite Status + Invite Notifications
-- ============================================

-- 1. Add status column to project_members (pending/active)
ALTER TABLE public.project_members
  ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active'));

-- 2. Add invited_by column (who sent the invite)
ALTER TABLE public.project_members
  ADD COLUMN invited_by uuid REFERENCES public.profiles(id);

-- 3. Expand notification type to include 'invite'
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('comment', 'mention', 'assignment', 'invite'));

-- 4. Make task_id nullable (invite notifications have no task)
ALTER TABLE public.notifications
  ALTER COLUMN task_id DROP NOT NULL;

-- 5. Add project_member_id to link invite notifications to membership row
ALTER TABLE public.notifications
  ADD COLUMN project_member_id uuid REFERENCES public.project_members(id) ON DELETE CASCADE;
