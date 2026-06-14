-- Migration 031: Cascade project slug updates to notifications
-- When projects.slug changes, update all notifications.project_slug to match.

CREATE OR REPLACE FUNCTION public.cascade_project_slug_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.slug != OLD.slug THEN
    UPDATE public.notifications
    SET project_slug = NEW.slug
    WHERE project_slug = OLD.slug;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cascade_project_slug
  AFTER UPDATE OF slug ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_project_slug_update();
