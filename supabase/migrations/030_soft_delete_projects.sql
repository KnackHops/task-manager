-- Migration 030: Soft-delete projects (deactivate → reactivate or permanent delete)

-- 1. Add deactivated_at column to projects
ALTER TABLE public.projects
  ADD COLUMN deactivated_at timestamptz DEFAULT NULL;

-- 2. Fix FK constraints on tasks and sprints to allow CASCADE delete
--    Previously RESTRICT (default), which blocked project deletion when tasks/sprints existed.
ALTER TABLE public.tasks
  DROP CONSTRAINT tasks_project_id_fkey,
  ADD CONSTRAINT tasks_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.sprints
  DROP CONSTRAINT sprints_project_id_fkey,
  ADD CONSTRAINT sprints_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- 3. Deactivate project function
--    Sets deactivated_at, kicks non-owner members, cleans their task assignees, notifies them.
CREATE OR REPLACE FUNCTION public.deactivate_project(
  p_project_id uuid,
  p_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_project_name text;
  v_project_slug text;
  v_member_ids uuid[];
BEGIN
  -- Verify caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_owner_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the project owner can deactivate a project';
  END IF;

  -- Get project info
  SELECT name, slug INTO v_project_name, v_project_slug
  FROM public.projects WHERE id = p_project_id;

  -- Set deactivated_at
  UPDATE public.projects
  SET deactivated_at = now()
  WHERE id = p_project_id;

  -- Collect non-owner member user_ids
  SELECT array_agg(user_id) INTO v_member_ids
  FROM public.project_members
  WHERE project_id = p_project_id AND user_id != p_owner_id;

  IF v_member_ids IS NOT NULL THEN
    -- Remove kicked members from task_assignees for this project's tasks
    DELETE FROM public.task_assignees
    WHERE assignee_id = ANY(v_member_ids)
      AND task_id IN (SELECT id FROM public.tasks WHERE project_id = p_project_id);

    -- Delete non-owner members
    DELETE FROM public.project_members
    WHERE project_id = p_project_id AND user_id != p_owner_id;

    -- Notify kicked members
    INSERT INTO public.notifications (user_id, type, task_id, actor_id, message, project_slug)
    SELECT unnest(v_member_ids), 'kick', NULL, p_owner_id,
           '"' || v_project_name || '" was deactivated',
           v_project_slug;
  END IF;
END;
$$;

-- 4. Reactivate project function
CREATE OR REPLACE FUNCTION public.reactivate_project(
  p_project_id uuid,
  p_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Verify caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_owner_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the project owner can reactivate a project';
  END IF;

  -- Verify project is actually deactivated
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND deactivated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Project is not deactivated';
  END IF;

  UPDATE public.projects
  SET deactivated_at = NULL
  WHERE id = p_project_id;
END;
$$;
