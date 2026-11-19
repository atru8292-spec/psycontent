// Окно подписки и возврат по дням (17.11). Оферта: «Каждый месяц в день первой оплаты списывается цена тарифа»;
// возврат: «цену тарифа делим на число дней в оплаченном месяце и умножаем на число дней, которые остались после
// твоей просьбы». Время храним в UTC, день считаем по Москве (Europe/Moscow, UTC+3 без перехода).
const DAY = 86400000
const MSK = 3 * 3600000

// Следующая дата окна: тот же день месяца (якорь), а если такого дня нет (31 февраля), последний день месяца.
// Время суток сохраняем. Якорь хранится отдельно, чтобы после февраля не съехать с 31 на 28 навсегда.
export function addMonthAnchored(from: Date, anchorDay: number): Date {
  const msk = new Date(from.getTime() + MSK)
  const y = msk.getUTCFullYear(), m = msk.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const day = Math.min(Math.max(1, anchorDay), lastDay)
  const res = new Date(Date.UTC(y, m, day, msk.getUTCHours(), msk.getUTCMinutes(), msk.getUTCSeconds()))
  return new Date(res.getTime() - MSK)
}

export const anchorDayOf = (d: Date) => new Date(d.getTime() + MSK).getUTCDate()

// Начало московских суток
export function mskDayStart(d: Date): Date {
  const msk = new Date(d.getTime() + MSK)
  return new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) - MSK)
}

// Возврат за оставшиеся дни. Дни считаем по московским суткам: оплаченных дней в окне daysTotal, оставшихся после
// дня просьбы daysLeft (день просьбы не возвращается: в этот день тариф еще работал). Сумма до копеек вниз.
export function refundByDays(price: number, periodStart: Date, periodEnd: Date, requestAt: Date): { amount: number; daysLeft: number; daysTotal: number } {
  const daysTotal = Math.max(1, Math.round((mskDayStart(periodEnd).getTime() - mskDayStart(periodStart).getTime()) / DAY))
  const nextDay = mskDayStart(requestAt).getTime() + DAY
  const daysLeft = Math.max(0, Math.min(daysTotal, Math.round((mskDayStart(periodEnd).getTime() - nextDay) / DAY)))
  const amount = Math.floor((price * daysLeft / daysTotal) * 100) / 100
  return { amount, daysLeft, daysTotal }
}

// ── Ручное продление (19.11, автоплатежи выключены флагом AUTOPAY_ENABLED) ──
// Окно новой оплаты по тому, что уже оплачено. Чистая функция: ее зовет сервер при оплате (lib/billing/core.ts) и экран
// оплаты для подсказки «будет оплачено до», поэтому человек видит ровно то, что посчитает сервер.
// - new: оплаченного нет (или кончилось): месяц с момента оплаты;
// - extend: тот же тариф еще работает: месяц добавляется к концу оплаченного, с тем же днем месяца (якорь);
// - switch: другой тариф, пока текущий работает: новый включается сразу, на месяц, а оставшееся время старого
//   пересчитывается по цене в дни нового (12 дней по 1 290 ₽ = 6,2 дня по 2 490 ₽, округляем вверх, в пользу человека).
export type ManualMode = 'new' | 'extend' | 'switch'
export type ManualWin = { start: Date; end: Date; anchor: number; mode: ManualMode; daysLeft: number; bonusDays: number }
export function manualWindow(now: Date, cur: { planCode: string; price: number; end: Date | null; anchor: number | null } | null, next: { code: string; price: number }): ManualWin {
  const live = !!(cur && cur.end && cur.end.getTime() > now.getTime() && cur.price > 0)
  if (live && cur!.planCode === next.code) {
    const anchor = cur!.anchor || anchorDayOf(cur!.end!)
    return { start: cur!.end!, end: addMonthAnchored(cur!.end!, anchor), anchor, mode: 'extend', daysLeft: 0, bonusDays: 0 }
  }
  const anchor = anchorDayOf(now)
  const month = addMonthAnchored(now, anchor)
  if (live) {
    const leftMs = cur!.end!.getTime() - now.getTime()
    const daysLeft = Math.ceil(leftMs / DAY)
    const bonusDays = Math.ceil((leftMs * cur!.price) / next.price / DAY)
    return { start: now, end: new Date(month.getTime() + bonusDays * DAY), anchor, mode: 'switch', daysLeft, bonusDays }
  }
  return { start: now, end: month, anchor, mode: 'new', daysLeft: 0, bonusDays: 0 }
}

// Начало текущего месяца внутри оплаченного окна: лимит текстов считается по месяцам, даже если окно длиннее месяца
// (продлила заранее, двойная оплата, смена тарифа с пересчетом). Месяцы идут от начала окна с якорем.
export function monthSegmentStart(periodStart: Date, anchor: number | null, now: Date): Date {
  const a = anchor || anchorDayOf(periodStart)
  let s = periodStart
  for (let i = 0; i < 60; i++) {
    const n = addMonthAnchored(s, a)
    if (n.getTime() > now.getTime()) break
    s = n
  }
  return s
}

// Начало следующего месяца текстов (20.11, ревью «Сейчас»): тот же расчет, что у сервера (monthSegmentStart и
// windowKey в lib/energy.ts), от начала окна period_start, а не от конца: после смены тарифа конец сдвинут бонусными
// днями, и восстановление от него дает не тот день. null: следующий месяц начинается не раньше конца срока, значит
// новые тексты будут только после продления. Одна функция для «Написать», Профиля и экрана оплаты.
export function nextSegmentStart(periodStart: Date, anchor: number | null, until: Date, now: Date): Date | null {
  if (isNaN(periodStart.getTime()) || isNaN(until.getTime())) return null
  const a = anchor || anchorDayOf(periodStart)
  const next = addMonthAnchored(monthSegmentStart(periodStart, anchor, now), a)
  return next.getTime() < until.getTime() ? next : null
}

export const fmtDate =(d: Date | string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })
