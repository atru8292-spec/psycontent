// События аналитики с аккаунтов из ADMIN_EMAILS не пишем совсем (решение Арины 20.11): ее проверки и снимки
// кабинета иначе попадают в воронки и «активных» (так было 20.11, 49 событий за 10 минут удалены руками).
// Фильтр стоит в двух местах записи: app/api/ev/route.ts (клиент, почта из сессии) и lib/track-server.ts
// (сервер, есть только user_id, почту берем из auth один раз и держим в памяти процесса).
// Анонимные события лендинга (land_* без входа) так не отфильтровать: для снимков главной аналитику
// отключать на самой странице.

import { adminEmails } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/generation/db'

export function isAdminEmail(email: string | null | undefined): boolean {
  const e = (email || '').trim().toLowerCase()
  return !!e && adminEmails().includes(e)
}

// user_id → админ или нет. Ошибку чтения не кешируем и событие пишем как раньше: лучше лишняя строка, чем потерянная.
const cacheById = new Map<string, boolean>()

export async function isAdminUserId(userId: string): Promise<boolean> {
  if (!adminEmails().length) return false
  const hit = cacheById.get(userId)
  if (hit !== undefined) return hit
  try {
    const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId)
    if (error || !data?.user) return false
    const yes = isAdminEmail(data.user.email)
    if (cacheById.size > 5000) cacheById.clear()
    cacheById.set(userId, yes)
    return yes
  } catch {
    return false
  }
}
