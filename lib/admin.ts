// Доступ к кабинету аналитики /admin (задача analitika, этап 3). Только для почт из ADMIN_EMAILS.
// Чужим и без входа кабинет отвечает 404, чтобы раздел не светился. Все данные кабинета читаются на сервере
// через service_role, в браузер уходят только готовые цифры и списки. Кабинет только читает и событий не пишет.

import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { getSessionUser } from '@/lib/auth'

import { isAdminUser } from '@/lib/admin-emails'

// списки почт и правило «кто админ» живут в lib/admin-emails.ts (без Next, их берет и аналитика)
export { adminEmails, internalEmails } from '@/lib/admin-emails'
// Опечатка в ADMIN_TZ не должна ронять кабинет: неизвестный пояс заменяем на Барнаул
export const adminTz = () => {
  const v = (process.env.ADMIN_TZ || '').trim()
  if (!v) return 'Asia/Barnaul'
  try { new Intl.DateTimeFormat('ru-RU', { timeZone: v }); return v } catch { return 'Asia/Barnaul' }
}

export function isAdmin(user: Pick<User, 'email' | 'email_confirmed_at'> | null | undefined): boolean {
  return isAdminUser(user)
}

// Для роутов /api/admin/* и данных кабинета: не админ, значит null. Один запрос к auth на рендер (cache).
export const adminOrNull = cache(async (): Promise<User | null> => {
  const user = await getSessionUser()
  return user && isAdmin(user) ? user : null
})

// Для страниц: не админ, значит 404. Звать первой строкой КАЖДОЙ страницы /admin: layout в Next 15
// при мягкой навигации может не перерисовываться, и одной проверки в layout мало.
export async function requireAdmin(): Promise<User> {
  const user = await adminOrNull()
  if (!user) notFound()
  return user
}

export const notFoundResponse = () => new Response('Not found', { status: 404 })
