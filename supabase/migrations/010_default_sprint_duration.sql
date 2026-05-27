-- 010: Add default sprint duration to projects
alter table public.projects add column default_sprint_days smallint not null default 7;
