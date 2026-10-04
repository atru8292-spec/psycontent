// Выгрузка кабинета в таблицы (задача analitika, этап 5): CSV под русский Excel и Google Таблицы.
// UTF-8 с BOM, разделитель точка с запятой, даты ДД.ММ.ГГГГ ЧЧ:ММ в ADMIN_TZ, дробные числа с запятой,
// заголовки по-русски. Текстов постов нет, как и в кабинете. Почты и имена есть: файлы содержат персональные данные,
// их не пересылать и не класть в git (CLAUDE.md).

import { STATUS_RU, RISK_LEVEL_RU, reasonText, PAYMENT_FEE, TAX, share } from './definitions'
import { FUNNEL_RU, type PersonRow, type Overview, type FunnelStep, type Onboarding, type MakeStats, type Features, type Costs, type PersonDetail } from './admin-types'
import { FORMAT_RU, MODE_RU } from './events'
import { FEATURE_RU, SCREEN_RU, opRu, styleRu, srcRu, stepOf, timelineLine, onbStepRu } from './admin-view'

export type Table = { name: string; headers: string[]; rows: (string | number | boolean | null | undefined)[][] }

export function fmtDate(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)?.value || ''
  return `${g('day')}.${g('month')}.${g('year')} ${g('hour')}:${g('minute')}`
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'да' : 'нет'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',')
  let s = String(v)
  // защита от формул: имя или почта с = + - @ в начале не должны исполниться в Excel и Таблицах
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const lines = (t: Table) => [t.headers.map(cell).join(';'), ...t.rows.map(r => r.map(cell).join(';'))]
const BOM = '\uFEFF'

export function toCsv(t: Table): string {
  return BOM + lines(t).join('\r\n') + '\r\n'
}

// Экран с несколькими таблицами в одном файле: название таблицы строкой, между таблицами пустая строка
export function toCsvSections(ts: Table[]): string {
  if (ts.length === 1) return toCsv(ts[0])
  return BOM + ts.map(t => [cell(TABLE_RU[t.name] || t.name), ...lines(t)].join('\r\n')).join('\r\n\r\n') + '\r\n'
}

export const TABLE_RU: Record<string, string> = {
  svodka: 'Сводка', voronka: 'Воронка', onboarding: 'Онбординг по шагам', lyudi: 'Люди', sdelat: 'Сделать', sdelat_formaty: 'Сделать по форматам',
  sdelat_rezhimy: 'Сделать по режимам', sdelat_oshibki: 'Ошибки по кодам', funkcii: 'Функции', ekrany: 'Экраны', formaty: 'Форматы',
  stili_karuseley: 'Стили каруселей', traty_po_dnyam: 'Траты по дням', traty_po_operaciyam: 'Траты по операциям', traty_po_modelyam: 'Траты по моделям',
  traty_po_lyudyam: 'Траты по людям', dorozhe_tarifa: 'Дороже своего тарифа', ekonomika: 'Экономика', marzha_po_tarifam: 'Маржа по тарифам',
  istochniki: 'Откуда пришли', chelovek: 'Человек', onboarding_shagi: 'Онбординг', traty: 'Траты', lenta: 'Лента действий',
}

const rub = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 100) / 100)

// ---------- таблицы экранов ----------
export function overviewTable(o: Overview): Table {
  return {
    name: 'svodka', headers: ['Показатель', 'Значение'],
    rows: [
      ['Взяли текст за 7 дней', o.took_7], ['Активные сегодня', o.active_today], ['Активные за 7 дней', o.active_7],
      ['Новые регистрации за 7 дней', o.new_7], ['Всего регистраций', o.registered_all], ['Дошли до активации', o.activated_all],
      ['Траты на ИИ сегодня, ₽', rub(o.cost_today_rub)], ['Траты на ИИ за 30 дней, ₽', rub(o.cost_30_rub)], ['Упирались в лимит за 7 дней', o.limit_7],
    ],
  }
}

export function funnelTable(steps: FunnelStep[]): Table {
  return {
    name: 'voronka', headers: ['Шаг', 'Людей', 'Переход с прошлого шага', 'Медиана времени с прошлого шага, ч'],
    rows: steps.map((s, i) => [FUNNEL_RU[s.key], s.n, i ? share(s.n, steps[i - 1].n) : '', s.median_hours_from_prev]),
  }
}

export function onboardingTable(o: Onboarding): Table {
  return {
    name: 'onboarding', headers: ['Шаг', 'Увидели', 'Прошли', 'Медиана времени, с', 'Ушли на шаге'],
    rows: [['Вход с Верой', o.intro, '', '', ''], ...o.steps.map(s => [`${s.step}. ${onbStepRu(s.step)}`, s.viewed, s.done, s.median_ms === null ? null : Math.round(s.median_ms / 100) / 10, s.dropped]), ['Онбординг пройден', o.finished, '', '', '']],
  }
}

export function peopleTable(ps: PersonRow[], tz: string, now = new Date()): Table {
  return {
    name: 'lyudi',
    headers: ['Почта', 'Имя', 'Регистрация', 'Откуда', 'Тариф', 'Шаг', 'Статус', 'Риск ухода', 'Уровень риска', 'Причины', 'Ритм, дней', 'Последний визит', 'Визитов за 7 дней', 'Дней с визитами за 30', 'Материалов', 'Взято', 'Доля взятых', 'Себестоимость за 30 дней, ₽', 'Платит', 'Упиралась в лимит', 'Ошибка за 7 дней'],
    rows: ps.map(p => [
      p.email, p.full_name, fmtDate(p.registered_at, tz), srcRu(p.src), p.plan_name || p.plan_code || '', stepOf(p), STATUS_RU[p.churn.status],
      p.churn.score, RISK_LEVEL_RU[p.churn.level], p.churn.reasons.filter(r => r.points > 0).map(r => reasonText(r, p.churn.facts, p.churn, now)).join(', '),
      p.churn.rhythm_days, fmtDate(p.last_visit_at, tz), p.sessions_7, p.visit_days_30, p.materials, p.materials_taken,
      `${p.materials_taken} из ${p.materials}`, rub(p.cost_rub_30), p.paying, p.limit_hit_ever, p.error_7,
    ]),
  }
}

export function makeTables(m: MakeStats): Table[] {
  return [
    { name: 'sdelat', headers: ['Показатель', 'Значение'], rows: [['Запусков', m.starts], ['Готово', m.done], ['Ошибок', m.errors], ['Медиана времени, с', m.median_ms === null ? null : Math.round(m.median_ms / 1000)], ['Материалов', m.materials], ['Взято', m.taken]] },
    { name: 'sdelat_formaty', headers: ['Формат', 'Запускали', 'Материалов', 'Взято'], rows: m.by_format.map(f => [FORMAT_RU[f.format] || f.format, f.started, f.materials, f.taken]) },
    { name: 'sdelat_rezhimy', headers: ['Режим', 'Запусков'], rows: m.by_mode.map(x => [MODE_RU[x.mode] || x.mode, x.n]) },
    { name: 'sdelat_oshibki', headers: ['Код ошибки', 'Сколько'], rows: m.errors_by_code.map(x => [x.code, x.n]) },
  ]
}

export function featuresTables(f: Features): Table[] {
  return [
    { name: 'funkcii', headers: ['Функция', 'Людей за 7 дней', 'Людей за 30 дней', 'Раз за 30 дней'], rows: f.features.map(x => [FEATURE_RU[x.feature] || x.feature, x.users_7, x.users_30, x.times_30]) },
    { name: 'ekrany', headers: ['Экран', 'Людей за 7 дней', 'Людей за 30 дней', 'Раз за 30 дней'], rows: f.screens.map(x => [SCREEN_RU[x.screen] || x.screen, x.users_7, x.users_30, x.times_30]) },
    { name: 'formaty', headers: ['Формат', 'Сделано за 30 дней', 'Взято за 30 дней', 'Людей'], rows: f.formats.map(x => [FORMAT_RU[x.format] || x.format, x.made_30, x.taken_30, x.users_30]) },
    { name: 'stili_karuseley', headers: ['Стиль', 'Каруселей сохранили', 'Сохранений'], rows: f.carousel_styles.map(x => [styleRu(x.style), x.carousels, x.exports]) },
  ]
}

export function economyRows(c: Costs) {
  const e = c.economy
  const ratio = e.ai_rub_30_paying > 0 ? e.mrr / e.ai_rub_30_paying : null
  const plans = e.plans.map(p => {
    const perUser = p.users ? p.ai_rub_30 / p.users : 0
    const margin = p.price ? p.price * (1 - PAYMENT_FEE - TAX) - perUser : null
    return { ...p, perUser, margin }
  })
  return { ratio, plans, avgCheck: e.paying ? e.mrr / e.paying : 0, aiPerPaying: e.paying ? e.ai_rub_30_paying / e.paying : 0 }
}

export function costsTables(c: Costs): Table[] {
  const eco = economyRows(c)
  return [
    { name: 'traty_po_dnyam', headers: ['День', 'Траты, ₽'], rows: c.by_day.map(d => [d.day.split('-').reverse().join('.'), rub(d.rub)]) },
    { name: 'traty_po_operaciyam', headers: ['Операция', 'Код операции', 'Траты, ₽', 'Вызовов'], rows: c.by_operation.map(x => [opRu(x.operation), x.operation, rub(x.rub), x.calls]) },
    { name: 'traty_po_modelyam', headers: ['Модель', 'Траты, ₽', 'Вызовов'], rows: c.by_model.map(x => [x.model, rub(x.rub), x.calls]) },
    { name: 'traty_po_lyudyam', headers: ['Почта', 'Траты, ₽'], rows: c.top_users.map(x => [x.email, rub(x.rub)]) },
    { name: 'dorozhe_tarifa', headers: ['Почта', 'Тариф', 'Цена, ₽', 'Себестоимость за 30 дней, ₽'], rows: c.over_plan.map(x => [x.email, x.plan_code, x.plan_price, rub(x.rub_30)]) },
    {
      name: 'ekonomika', headers: ['Показатель', 'Значение'],
      rows: [
        ['Платящих', c.economy.paying], ['Выручка в месяц (MRR), ₽', c.economy.mrr], ['Средний чек, ₽', rub(eco.avgCheck)],
        ['Отток платящих за 30 дней', c.economy.churned_paying_30], ['ИИ на одного платящего в месяц, ₽', rub(eco.aiPerPaying)],
        ['Выручка к тратам на ИИ', eco.ratio === null ? '' : `${String(Math.round(eco.ratio * 10) / 10).replace('.', ',')} к 1`],
        ['Траты на ИИ всего за период, ₽', rub(c.total_rub)], ['Цена готового материала, ₽', c.materials ? rub(c.total_rub / c.materials) : ''], ['Цена взятого текста, ₽', c.taken ? rub(c.total_rub / c.taken) : ''],
      ],
    },
    { name: 'marzha_po_tarifam', headers: ['Тариф', 'Цена, ₽', 'Людей', 'ИИ на человека за 30 дней, ₽', 'Маржа после ИИ, комиссии и налога, ₽'], rows: eco.plans.map(p => [p.name, p.price, p.users, rub(p.perUser), p.margin === null ? '' : rub(p.margin)]) },
    { name: 'istochniki', headers: ['Источник', 'Пришло', 'Активировались', 'Платят'], rows: c.sources.map(s => [srcRu(s.src), s.users, s.activated, s.paying]) },
  ]
}

// Лента действий без текстов: одна строка на действие
export function timelineTable(p: PersonDetail, tz: string): Table {
  return { name: 'lenta', headers: ['Почта', 'Когда', 'Действие'], rows: p.timeline.map(t => [p.email, fmtDate(t.at, tz), timelineLine(t).text]) }
}

export function personTables(p: PersonDetail, tz: string, now = new Date()): Table[] {
  const c = p.churn
  return [
    {
      name: 'chelovek', headers: ['Показатель', 'Значение'],
      rows: [
        ['Почта', p.email], ['Имя', p.full_name], ['Регистрация', fmtDate(p.registered_at, tz)], ['Откуда', srcRu(p.src)], ['Тариф', p.plan_name || p.plan_code],
        ['Последний визит', fmtDate(p.last_visit_at, tz)], ['Статус', STATUS_RU[c.status]], ['Риск ухода', c.score], ['Уровень риска', RISK_LEVEL_RU[c.level]],
        ['Ритм, дней', c.rhythm_days], ['Причины', c.reasons.map(r => `${reasonText(r, c.facts, c, now)} (${r.points > 0 ? '+' : ''}${r.points})`).join(', ')],
        ['Онбординг начат', fmtDate(p.intro_at, tz)], ['Онбординг пройден', fmtDate(p.done_at, tz)], ['Микрофон не дали', p.mic_denied],
        ['Траты за 30 дней, ₽', rub(p.money.rub_30)], ['Траты за все время, ₽', rub(p.money.rub_all)],
        ['Пробных текстов в этом месяце', p.text_usage.cap ? `${p.text_usage.count} из ${p.text_usage.cap}` : p.text_usage.count],
      ],
    },
    { name: 'onboarding_shagi', headers: ['Вопрос', 'Увидела', 'Ответила', 'Секунд на шаге'], rows: p.onboarding.map(s => [`${s.step}. ${onbStepRu(s.step)}`, fmtDate(s.viewed_at, tz), fmtDate(s.done_at, tz), s.ms === null ? null : Math.round(s.ms / 1000)]) },
    { name: 'formaty', headers: ['Формат', 'Сделано', 'Взято'], rows: p.formats.map(f => [FORMAT_RU[f.format] || f.format, f.made, f.taken]) },
    { name: 'funkcii', headers: ['Функция', 'Раз'], rows: p.features.map(f => [FEATURE_RU[f.feature] || f.feature, f.n]) },
    { name: 'traty', headers: ['Операция', 'Код операции', 'Траты за 30 дней, ₽', 'Вызовов'], rows: p.money.by_operation_30.map(x => [opRu(x.operation), x.operation, rub(x.rub), x.calls]) },
    timelineTable(p, tz),
  ]
}
