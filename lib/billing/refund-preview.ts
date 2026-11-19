// Что случится при возврате платежа: для текста подтверждения в /admin/oplata (19.11). Чистая функция, без базы.
// Повторяет расчет refundPayment в lib/billing/core.ts (сумма по дням через refundByDays, дни bonus:N не входят,
// продление, которое еще не началось, возвращается целиком, возврат только последнего платежа в цепочке).
// Меняешь расчет там, поменяй и здесь. Итоговую сумму все равно считает сервер, экран показывает ее после ответа.
import { refundByDays } from './period'

const H = 3600 * 1000

export type RefundPay = { user_id: string | null; status: string; amount: number; period_start: string | null; period_end: string | null; note?: string | null }
export type RefundSub = { status: string; period_end: string | null } | null | undefined

export type RefundPreview =
  | { can: false; why: 'not_paid' | 'refunded' | 'not_latest' | 'nothing_left' }
  | { can: true; amount: number; daysLeft: number; daysTotal: number; full: boolean; effect: 'no_account' | 'future' | 'off_now'; keepUntil: string | null }

export function refundPreview(p: RefundPay, sub: RefundSub, now: Date): RefundPreview {
  if (p.status !== 'succeeded') return { can: false, why: 'not_paid' }
  if (/refunded:/.test(p.note || '')) return { can: false, why: 'refunded' }
  if (p.user_id && p.period_end && sub?.period_end && sub.status !== 'expired' && new Date(sub.period_end).getTime() > new Date(p.period_end).getTime() + 60000) return { can: false, why: 'not_latest' }
  const amount = Number(p.amount)
  // как сервер: окна нет (аккаунт удален во время оплаты) -> вся сумма; окно есть -> по дням, даже если аккаунт удален потом
  if (!p.period_start || !p.period_end) return { can: true, amount, daysLeft: 0, daysTotal: 0, full: true, effect: 'no_account', keepUntil: null }
  const bonus = Number((p.note || '').match(/bonus:(\d+)/)?.[1]) || 0
  const calc = refundByDays(amount, new Date(p.period_start), new Date(new Date(p.period_end).getTime() - bonus * 24 * H), now)
  if (calc.amount <= 0) return { can: false, why: 'nothing_left' }
  const future = new Date(p.period_start).getTime() > now.getTime()
  const effect = !p.user_id ? 'no_account' : future ? 'future' : 'off_now'
  return { can: true, ...calc, full: calc.amount >= amount, effect, keepUntil: effect === 'future' ? p.period_start : null }
}
