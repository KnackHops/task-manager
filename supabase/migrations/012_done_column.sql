-- Add is_done flag to project_columns
-- Marks which columns represent "done" state for sprint analytics + auto-archive on sprint completion
ALTER TABLE project_columns ADD COLUMN is_done boolean NOT NULL DEFAULT false;
