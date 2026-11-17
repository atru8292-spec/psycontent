// Тексты остатка материалов и конца лимита (16.11, блок 1 запуска). Одни и те же везде: шапка, сайдбар,
// Профиль, «Сделать». Тексты copywriter-psycont 16.11. Оплата еще не подключена: дат и «купи сейчас» не обещаем.
// Серверный отказ (lib/energy.ts canConsume) берет LIMIT_REFUSAL отсюда же, чтобы экран и сервер не расходились.

export type Materials = { remaining: number; cap: number; kind: 'trial' | 'month' }

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function isMaterials(v: any): v is Materials {
  return !!v && typeof v.remaining === 'number' && typeof v.cap === 'number' && (v.kind === 'trial' || v.kind === 'month')
}

// Пилюля в шапке телефона и в сайдбаре
export const pillText = (m: Materials) => `${m.remaining} из ${m.cap}`
export const pillAria = (m: Materials) => m.kind === 'trial'
  ? `Пробных материалов осталось: ${m.remaining} из ${m.cap}`
  : `Материалов на этот месяц осталось: ${m.remaining} из ${m.cap}`

// Строка в Профиле над тарифами («из N материалов» не склоняется: после «из 10» всегда «материалов»)
export const profileLine = (m: Materials) => m.remaining <= 0
  ? (m.kind === 'trial' ? END.trial.title(m.cap) : END.month.title())
  : m.kind === 'trial'
  ? `Осталось ${m.remaining} из ${m.cap} пробных материалов. Срока у них нет`
  : `В этом месяце осталось ${m.remaining} из ${m.cap} материалов`

// Подсказка под кнопкой «Сделать», когда пробных осталось 1-2
export const lowHint = (m: Materials) => {
  if (m.kind !== 'trial') return ''
  if (m.remaining === 1) return 'Это последний пробный материал'
  if (m.remaining === 2) return `Осталось два пробных материала из ${m.cap}`
  return ''
}

// Конец материалов на «Сделать»
export const END = {
  trial: {
    title: (cap: number) => `Все ${cap} пробных материалов собраны`,
    text: 'Тексты, голос и темы остаются у тебя, в «Моих текстах» все на месте. Писать дальше можно будет на платном тарифе.',
    note: 'Оплату я еще подключаю, а тарифы уже можно посмотреть.',
  },
  month: {
    title: () => 'Материалы этого месяца закончились',
    text: 'Новые появятся, когда начнется следующий месяц подписки. Тексты, голос и темы на месте.',
    note: '',
  },
  button: 'Посмотреть тарифы',
  buttonPay: 'Выбрать тариф', // оплата подключена (paymentsOn из /api/me)
  disabled: 'Доступно на платном тарифе',
  // выбрано форматов больше, чем осталось материалов (смысл серверного отказа text_limit_partial)
  tooMany: 'Убери лишние форматы',
}

// Отказ сервера, если запуск все же ушел (canConsume)
export const LIMIT_REFUSAL = {
  trial: (cap: number) => `Все ${cap} пробных материалов уже собраны. Дальше можно писать на платном тарифе, оплату я еще подключаю. Твои тексты, голос и темы на месте.`,
  month: 'Материалы этого месяца закончились. Новые появятся, когда начнется следующий месяц подписки. Тексты, голос и темы на месте.',
}

// Тарифы, пока оплаты нет
export const PAY_SOON = {
  line: 'Оплату я еще подключаю, поэтому сменить тариф пока нельзя. Когда она заработает, это можно будет сделать здесь одной кнопкой.',
  popTitle: 'Оплаты пока нет',
  popText: (name: string) => `Перейти на «${name}» сейчас не получится, оплату я еще подключаю. Когда заработает, это будет здесь, одной кнопкой.`,
  popButton: 'Понятно',
}

// Обновление страницы во время генерации
export const RESUME = {
  title: 'Дописываю',
  line: 'Страница обновилась, но текст пишется дальше. Он появится здесь и в «Моих текстах», можно выйти',
  timeout: 'Текст пишется дольше обычного. Загляни в «Мои тексты» чуть позже, а если его там не будет, собери заново',
}

export const TARIFF_HREF = '/dashboard/settings#tariff'
