-- 008: Add story_points to tasks (optional estimation field for sprint planning)
alter table public.tasks add column story_points smallint;
