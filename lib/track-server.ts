// Запись события на сервере (задача analitika, этап 2): надежнее клиента, блокировщики ее не режут.
// Тот же список событий и тот же санитайзер, что у /api/ev. Через общий admin-клиент (service_role).
// Никогда не бросает и не задерживает ответ: зовется без await или с catch, ошибки только в console.warn.

import { getSupabaseAdmin } from '@/lib/generation/db'
import { isEventName } from '@/lib/analytics/events'
import { sanitizeProps, cleanPath } from '@/lib/analytics/sanitize'

export function serverTrack(userId: string | null | undefined, event: string, props?: Record<string, unknown>, path?: string): void {
  try {
    if (!userId || !isEventName(event)) return
    const row = { user_id: userId, event, props: sanitizeProps(event, props || {}), path: path ? cleanPath(path) : null }
    getSupabaseAdmin().from('events').insert(row).then(({ error }) => {
      // пока миграция не применена, таблицы нет: тихо, одной строкой
      if (error) console.warn('serverTrack:', event, error.code || error.message)
    }, (e: unknown) => console.warn('serverTrack:', event, (e as Error)?.message))
  } catch (e) {
    console.warn('serverTrack:', event, (e as Error)?.message)
  }
}
