// POST /api/account/delete: человек сам удаляет аккаунт (Профиль, кнопка «Удалить аккаунт»). Сразу и навсегда:
// фото в user-photos, все строки (каскад от auth.users) и сам аккаунт. Логика в lib/account-delete.ts.
// Защита: только своя сессия; тело { confirm: 'udalit', reasons: [...] }; запрос только со своего сайта (Origin).
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { PHOTO_BUCKET } from '@/lib/carousel/server'
import { deleteAccount, cleanReasons } from '@/lib/account-delete'
import { sanitizeProps } from '@/lib/analytics/sanitize'
import { errTag } from '@/lib/safe-error'
import { publicOrigin } from '@/lib/origin'
import { billingDeps } from '@/lib/billing/deps'
import { cancelBillingForDeletion } from '@/lib/billing/core'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  const origin = req.headers.get('origin')
  if (origin && origin !== publicOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (body?.confirm !== 'udalit') return NextResponse.json({ error: 'no_confirm' }, { status: 400 })

  const db = getSupabaseAdmin()
  const res = await deleteAccount(user.id, cleanReasons(body?.reasons), {
    cancelBilling: async (id) => {
      // таблиц оплаты еще нет (миграция не применена): пропускаем, иначе удаление сломалось бы
      const probe = await db.from('payments').select('id', { head: true, count: 'exact' }).eq('user_id', id)
      if (probe.error && /relation|does not exist|42P01|PGRST205/i.test(`${probe.error.code} ${probe.error.message}`)) return
      if (probe.error) throw probe.error
      await cancelBillingForDeletion(billingDeps(), id)
      const { error } = await db.from('payments').update({ email: null }).eq('user_id', id)
      if (error) throw error
    },
    listPhotos: async (id) => {
      const { data, error } = await db.storage.from(PHOTO_BUCKET).list(id, { limit: 1000 })
      if (error) throw error
      return (data || []).filter(f => f.name).map(f => `${id}/${f.name}`)
    },
    removePhotos: async (paths) => {
      const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths)
      if (error) throw error
    },
    stats: async (id) => {
      const [{ count }, { data: u }] = await Promise.all([
        db.from('generated_posts').select('id', { count: 'exact', head: true }).eq('user_id', id).not('format', 'eq', 'hooks'),
        db.auth.admin.getUserById(id),
      ])
      const created = u?.user?.created_at ? new Date(u.user.created_at).getTime() : Date.now()
      return { days: Math.max(0, Math.floor((Date.now() - created) / 86400000)), materials: count || 0 }
    },
    logEvent: async (props) => {
      const { error } = await db.from('events').insert({ user_id: null, event: 'account_delete', props: sanitizeProps('account_delete', props) })
      if (error) console.warn('account delete event:', errTag(error))
    },
    deleteUser: async (id) => {
      const { error } = await db.auth.admin.deleteUser(id)
      if (error) throw error
    },
  })
  if (!res.ok) {
    console.error('account delete failed:', res.step)
    return NextResponse.json({ error: 'delete_failed', step: res.step }, { status: 500 })
  }
  console.info('account deleted, photos:', res.photos)
  return NextResponse.json({ ok: true })
}
