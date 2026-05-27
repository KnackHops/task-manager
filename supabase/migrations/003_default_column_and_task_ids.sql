-- Migration 003: Default Column + Task IDs (Prefix + Sequential Number)
-- Run this in Supabase Studio SQL Editor

-- =============================================
-- 1. Project prefix + default column
-- =============================================

alter table public.projects
  add column prefix text not null default '';

alter table public.projects
  add column default_column_id uuid references public.project_columns(id) on delete set null;

-- =============================================
-- 2. Task sequential number
-- =============================================

alter table public.tasks
  add column task_number bigint;

-- Backfill existing tasks with sequential numbers per project (ordered by created_at)
with numbered as (
  select id, row_number() over (partition by project_id order by created_at) as rn
  from public.tasks
)
update public.tasks t
set task_number = numbered.rn
from numbered
where t.id = numbered.id;

-- Now make it not null
alter table public.tasks
  alter column task_number set not null;

-- Unique constraint per project
alter table public.tasks
  add constraint tasks_project_number_unique unique (project_id, task_number);

-- =============================================
-- 3. Auto-assign trigger for new tasks
-- =============================================

create or replace function public.assign_task_number()
returns trigger as $$
begin
  if NEW.task_number is null then
    select coalesce(max(task_number), 0) + 1
    into NEW.task_number
    from public.tasks
    where project_id = NEW.project_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_assign_task_number
  before insert on public.tasks
  for each row
  execute function public.assign_task_number();
