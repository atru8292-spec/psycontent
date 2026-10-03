// Общий admin-клиент Supabase для роутов новой цепочки (как в остальных роутах проекта).
import { createClient } from '@supabase/supabase-js'

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env variables')
  return createClient(url, key)
}
