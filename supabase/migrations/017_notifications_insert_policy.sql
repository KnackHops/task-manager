-- ============================================
-- Migration 017: Add INSERT policy for notifications
-- ============================================
-- Client-side code inserts notifications for invite, transfer, leave, kick events.
-- Previously only SECURITY DEFINER triggers inserted rows (bypassing RLS).
-- Without this policy, direct inserts are silently blocked.

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
