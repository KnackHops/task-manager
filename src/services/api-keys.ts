import { supabase } from '@/lib/supabase'

export interface ApiKey {
  id: string
  key_prefix: string
  name: string
  created_at: string
  last_used_at: string | null
}

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `tm_${hex}`
}

export async function createApiKey(name: string): Promise<string> {
  const key = generateKey()
  const keyHash = await hashKey(key)
  const keyPrefix = key.slice(0, 8)

  const { error } = await supabase.from('api_keys').insert({
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name,
  })

  if (error) throw error
  return key
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, created_at, last_used_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ApiKey[]
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}
