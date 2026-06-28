import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getAccountSummary } from '@/lib/energy'

// Read-only сводка по своему аккаунту (тариф + энергия + у Free остаток проб).
// Только чтение и только свои данные. Скрытый счётчик текста платных и usage_log
// клиенту не отдаём — это серверные данные (см. CLAUDE.md).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const summary = await getAccountSummary(user.id)
  return NextResponse.json(summary)
}
