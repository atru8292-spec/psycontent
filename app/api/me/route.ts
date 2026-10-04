import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getAccountSummary } from '@/lib/energy'
import { createClient } from '@/utils/supabase/server'
import { isNewPipeline } from '@/lib/generation/context'

// Read-only сводка по своему аккаунту (тариф + энергия + у Free остаток проб).
// Только чтение и только свои данные. Скрытый счётчик текста платных и usage_log
// клиенту не отдаём — это серверные данные (см. CLAUDE.md).
// newPipeline: включен ли новый мозг именно для этого человека. Считает сервер тем же
// isNewPipeline, что и генерация, чтобы экран и генерация не расходились.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const summary = await getAccountSummary(user.id)
  // null = не смогли прочитать профиль: клиент тогда возьмет свой запасной вариант
  let newPipeline: boolean | null = null
  try {
    const db = await createClient()
    const { data: profile, error } = await db.from('onboarding_profiles').select('new_pipeline').eq('user_id', user.id).maybeSingle()
    if (!error) newPipeline = isNewPipeline(profile)
  } catch {}
  return NextResponse.json({ ...summary, newPipeline })
}
