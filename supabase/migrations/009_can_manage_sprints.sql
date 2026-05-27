-- 009: Add can_manage_sprints permission to project_members
alter table public.project_members
  add column can_manage_sprints boolean not null default false;

-- Update has_member_permission function to include new permission
create or replace function public.has_member_permission(p_project_id uuid, p_user_id uuid, p_permission text)
returns boolean as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = p_user_id
    and (
      role = 'owner'
      or (p_permission = 'can_create_task' and can_create_task)
      or (p_permission = 'can_edit_task' and can_edit_task)
      or (p_permission = 'can_delete_task' and can_delete_task)
      or (p_permission = 'can_archive_task' and can_archive_task)
      or (p_permission = 'can_manage_columns' and can_manage_columns)
      or (p_permission = 'can_manage_members' and can_manage_members)
      or (p_permission = 'can_manage_sprints' and can_manage_sprints)
    )
  );
$$ language sql security definer stable;

-- Update sprint RLS policies: permission-based instead of owner-only
drop policy "sprints_insert" on public.sprints;
drop policy "sprints_update" on public.sprints;
drop policy "sprints_delete" on public.sprints;

create policy "sprints_insert" on public.sprints for insert with check (
  public.has_member_permission(sprints.project_id, auth.uid(), 'can_manage_sprints')
);
create policy "sprints_update" on public.sprints for update using (
  public.has_member_permission(sprints.project_id, auth.uid(), 'can_manage_sprints')
);
create policy "sprints_delete" on public.sprints for delete using (
  public.has_member_permission(sprints.project_id, auth.uid(), 'can_manage_sprints')
);
