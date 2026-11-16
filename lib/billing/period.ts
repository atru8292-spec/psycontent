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

export const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })
