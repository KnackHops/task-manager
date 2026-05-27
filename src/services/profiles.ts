import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')

  if (error) throw error
  return (data ?? []) as Profile[]
}
