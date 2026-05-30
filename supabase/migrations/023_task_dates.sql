-- Scheduling dates for tasks, used by the Gantt timeline view.
-- Both nullable: a task only renders a Gantt bar when both are set; otherwise it is
-- listed as "unscheduled". No due >= start check at the DB level — the UI enforces it
-- (drag/resize can transiently invert before commit).

alter table public.tasks add column start_date date;
alter table public.tasks add column due_date date;
