import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_USER_EMAIL = process.env.SUPABASE_USER_EMAIL
const SUPABASE_USER_PASSWORD = process.env.SUPABASE_USER_PASSWORD

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
}

if (!SUPABASE_USER_EMAIL || !SUPABASE_USER_PASSWORD) {
  throw new Error('SUPABASE_USER_EMAIL and SUPABASE_USER_PASSWORD are required')
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function authenticate(): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: SUPABASE_USER_EMAIL!,
    password: SUPABASE_USER_PASSWORD!,
  })
  if (error) throw new Error(`Auth failed: ${error.message}`)
  return data.user.id
}
