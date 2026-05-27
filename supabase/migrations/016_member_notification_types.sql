-- Migration 016: Add transfer/leave/kick notification types
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('comment', 'mention', 'assignment', 'invite', 'transfer', 'leave', 'kick'));
