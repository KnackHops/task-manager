import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, createAnonClient } from './supabase.js'

export interface RequestContext {
  supabase: SupabaseClient
  userId: string
}

// Cache: key_hash → { ctx, expiresAt }
const sessionCache = new Map<
  string,
  { ctx: RequestContext; expiresAt: number }
>()
const SESSION_TTL_MS = 55 * 60 * 1000 // 55 min (Supabase sessions last 1hr)

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export async function authenticateApiKey(
  apiKey: string
): Promise<RequestContext> {
  const keyHash = hashApiKey(apiKey)

  // Check cache
  const cached = sessionCache.get(keyHash)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ctx
  }

  const admin = createAdminClient()

  // Look up key
  const { data: keyRow, error } = await admin
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .single()
  if (error || !keyRow) throw new Error('Invalid API key')

  // Update last_used_at (fire and forget)
  admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)
    .then()

  // Get user email for magic link
  const {
    data: { user },
  } = await admin.auth.admin.getUserById(keyRow.user_id)
  if (!user?.email) throw new Error('User not found')

  // Generate magic link token
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error('Failed to generate session')
  }

  // Create user-scoped client with real session (RLS enforced)
  const userClient = createAnonClient()
  const { error: verifyError } = await userClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (verifyError) throw new Error(`Session creation failed: ${verifyError.message}`)

  const ctx: RequestContext = {
    supabase: userClient,
    userId: keyRow.user_id,
  }

  // Cache session
  sessionCache.set(keyHash, {
    ctx,
    expiresAt: Date.now() + SESSION_TTL_MS,
  })

  return ctx
}
