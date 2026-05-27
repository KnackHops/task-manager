-- Add sprint auto-assign settings to projects
alter table public.projects
  add column sprint_column_id uuid references public.project_columns(id) on delete set null,
  add column auto_assign_sprint boolean not null default false;

-- Trigger: when sprint_column_id becomes null, force auto_assign_sprint to false
create or replace function public.sync_auto_assign_sprint()
returns trigger as $$
begin
  if new.sprint_column_id is null and new.auto_assign_sprint = true then
    new.auto_assign_sprint := false;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_auto_assign_sprint
  before update on public.projects
  for each row execute function public.sync_auto_assign_sprint();
