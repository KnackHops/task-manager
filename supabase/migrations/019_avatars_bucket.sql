-- ============================================
-- 019: Supabase Storage — avatars bucket + policies
-- ============================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 2097152) -- 2 MB, public read
on conflict (id) do nothing;

-- Drop existing policies if they exist (idempotent)
drop policy if exists "avatars_storage_select" on storage.objects;
drop policy if exists "avatars_storage_insert" on storage.objects;
drop policy if exists "avatars_storage_update" on storage.objects;
drop policy if exists "avatars_storage_delete" on storage.objects;

-- Anyone can read avatars (public bucket)
create policy "avatars_storage_select"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Authenticated users can upload to their own folder ({user_id}/*)
create policy "avatars_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own avatars (overwrite)
create policy "avatars_storage_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own avatars
create policy "avatars_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
