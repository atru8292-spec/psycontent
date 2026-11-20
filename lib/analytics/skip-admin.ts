// События аналитики с аккаунтов из ADMIN_EMAILS не пишем совсем (решение Арины 20.11): ее проверки и снимки
// кабинета иначе попадают в воронки и «активных» (так было 20.11, 49 событий за 10 минут удалены руками).
// Фильтр стоит в двух местах записи: app/api/ev/route.ts (клиент, пользователь из сессии) и lib/track-server.ts
// (сервер, есть только user_id, пользователя берем из auth один раз и держим ответ в памяти процесса).
// Кто админ, решает то же правило, что пускает в кабинет /admin: isAdminUser (почта из списка и подтверждена).
// Анонимные события лендинга (land_* без входа) так не отфильтровать: для снимков главной аналитику
// отключать на самой странице.

import { adminEmails, isAdminUser } from '@/lib/admin-emails'
import { getSupabaseAdmin } from '@/lib/generation/db'

// user_id → запрос «админ или нет». Храним сам запрос, чтобы события первой секунды не шли в auth каждое отдельно.
// Ошибку не кешируем (ключ удаляется) и событие пишем как раньше: лучше лишняя строка, чем потерянная.
const cacheById = new Map<string, Promise<boolean>>()

export function isAdminUserId(userId: string): Promise<boolean> {
  if (!adminEmails().length) return Promise.resolve(false)
  const hit = cacheById.get(userId)
  if (hit) return hit
  if (cacheById.size > 5000) cacheById.clear()
  const p = (async () => {
    try {
      const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId)
      if (error || !data?.user) { cacheById.delete(userId); return false }
      return isAdminUser(data.user)
    } catch {
      cacheById.delete(userId)
      return false
    }
  })()
  cacheById.set(userId, p)
  return p
}
