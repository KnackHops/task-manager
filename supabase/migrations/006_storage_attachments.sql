-- ============================================
-- 006: Supabase Storage — attachments bucket + policies
-- ============================================
-- Run this AFTER creating the 'attachments' bucket in Supabase Studio
-- (Storage → New bucket → name: attachments, public: off)
--
-- Alternatively, create the bucket via SQL:
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800) -- 50 MB
on conflict (id) do nothing;

-- Authenticated users can read any file in the bucket
create policy "attachments_storage_select"
  on storage.objects for select
  using (bucket_id = 'attachments' and auth.role() = 'authenticated');

-- Authenticated users can upload to their own folder ({user_id}/*)
create policy "attachments_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own uploads
create policy "attachments_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'attachments'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- Fix attachments TABLE policies
-- (Replace project_members join policies with simple auth.uid() checks)
-- ============================================
drop policy if exists "attachments_insert" on public.attachments;
drop policy if exists "attachments_select" on public.attachments;
drop policy if exists "attachments_delete" on public.attachments;

create policy "attachments_insert" on public.attachments
  for insert with check (auth.uid() = uploaded_by);

create policy "attachments_select" on public.attachments
  for select using (true);

create policy "attachments_delete" on public.attachments
  for delete using (auth.uid() = uploaded_by);
