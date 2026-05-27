import { supabase } from '@/lib/supabase'
import type { AttachmentWithUploader } from '@/types/database'

const BUCKET = 'attachments'

export async function uploadAttachment(
  file: File,
  uploadedBy: string,
  target: { taskId: string } | { commentId: string }
): Promise<AttachmentWithUploader> {
  const ext = file.name.split('.').pop() ?? ''
  const storagePath = `${uploadedBy}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type })

  if (uploadError) throw uploadError

  // Insert record
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      task_id: 'taskId' in target ? target.taskId : null,
      comment_id: 'commentId' in target ? target.commentId : null,
      uploaded_by: uploadedBy,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
    })
    .select(
      `
      *,
      uploader:profiles!uploaded_by(id, full_name, avatar_url)
    `
    )
    .single()

  if (error) {
    // Clean up storage on DB insert failure
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw error
  }

  return data as AttachmentWithUploader
}

export async function fetchTaskAttachments(
  taskId: string
): Promise<AttachmentWithUploader[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select(
      `
      *,
      uploader:profiles!uploaded_by(id, full_name, avatar_url)
    `
    )
    .eq('task_id', taskId)
    .order('position', { ascending: true })

  if (error) throw error
  return (data ?? []) as AttachmentWithUploader[]
}

export async function fetchCommentAttachments(
  commentId: string
): Promise<AttachmentWithUploader[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select(
      `
      *,
      uploader:profiles!uploaded_by(id, full_name, avatar_url)
    `
    )
    .eq('comment_id', commentId)
    .order('position', { ascending: true })

  if (error) throw error
  return (data ?? []) as AttachmentWithUploader[]
}

/** Reassign attachments from task to comment (for inline images uploaded before comment exists) */
export async function reassignAttachmentsToComment(
  attachmentIds: string[],
  commentId: string
): Promise<void> {
  if (attachmentIds.length === 0) return
  const { error } = await supabase
    .from('attachments')
    .update({ comment_id: commentId, task_id: null })
    .in('id', attachmentIds)
  if (error) throw error
}

export async function reorderAttachments(
  orderedIds: string[]
): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    supabase.from('attachments').update({ position: index }).eq('id', id)
  )
  const results = await Promise.all(updates)
  const firstError = results.find((r) => r.error)
  if (firstError?.error) throw firstError.error
}

export async function deleteAttachment(
  id: string,
  storagePath: string
): Promise<void> {
  const { error } = await supabase.from('attachments').delete().eq('id', id)
  if (error) throw error

  await supabase.storage.from(BUCKET).remove([storagePath])
}

export function getAttachmentUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  return data.publicUrl
}

export async function getSignedUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error) throw error
  return data.signedUrl
}
