-- Task-level done flag
ALTER TABLE tasks ADD COLUMN is_done boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN done_at timestamptz;

-- Story points target per sprint
ALTER TABLE sprints ADD COLUMN story_points_target integer;

-- Project-level toggle for auto-archiving done tasks on sprint complete
ALTER TABLE projects ADD COLUMN auto_archive_done boolean NOT NULL DEFAULT true;
