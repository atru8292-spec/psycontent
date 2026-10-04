// Демо-данные кабинета (только dev, /admin?demo=1): 13 выдуманных психологов в разных статусах, чтобы
// посмотреть экраны до того, как накопятся события. Почты и имена выдуманы, текстов нет.
// Статус и риск считаются тем же TS-близнецом, что в тестах (definitions.ts).

import { computeRisk, statusOf, type PersonFacts } from './definitions'
import type { PersonRow, Overview, FunnelStep, Onboarding, MakeStats, Features, Costs, PersonDetail, TimelineItem, Churn } from './admin-types'

const NOW = () => new Date()
const at = (now: Date, daysAgo: number, hour = 12) => { const d = new Date(now.getTime() - daysAgo * 86400000); d.setUTCHours(hour, 10, 0, 0); return d.toISOString() }
const day = (now: Date, daysAgo: number) => at(now, daysAgo).slice(0, 10)

type Seed = {
  name: string; email: string; reg: number; plan: [string, string, number]; src: string
  onb: number | null; onbDone: boolean; materials: number; taken: number; takeAgo: number[]; visitAgo: number | null
  notLike?: number; edits?: number; errors?: number; limit?: boolean; limitNoReturn?: boolean; voiceEmpty?: boolean; published?: boolean; cost30: number
}
const SEEDS: Seed[] = [
  { name: 'Ольга', email: 'olga.demo@example.com', reg: 40, plan: ['practice', 'Практика', 2490], src: 'telegram', onb: 5, onbDone: true, materials: 46, taken: 31, takeAgo: [0, 1, 2, 3, 5, 6, 8, 9], visitAgo: 0, published: true, cost30: 214.5 },
  { name: 'Марина', email: 'marina.demo@example.com', reg: 35, plan: ['start', 'Блог', 990], src: 'instagram', onb: 5, onbDone: true, materials: 22, taken: 12, takeAgo: [6, 13, 20, 27, 34], visitAgo: 2, cost30: 61.2 },
  { name: 'Светлана', email: 'sveta.demo@example.com', reg: 28, plan: ['free', 'Старт', 0], src: 'yandex', onb: 5, onbDone: true, materials: 18, taken: 9, takeAgo: [9, 10, 11, 12, 13, 14, 15, 16], visitAgo: 7, notLike: 1, errors: 2, cost30: 38.9 },
  { name: 'Анна', email: 'anna.demo@example.com', reg: 21, plan: ['free', 'Старт', 0], src: 'direct', onb: 5, onbDone: true, materials: 14, taken: 4, takeAgo: [7, 9, 11, 13], visitAgo: 1, notLike: 2, cost30: 44.0 },
  { name: 'Елена', email: 'elena.demo@example.com', reg: 3, plan: ['free', 'Старт', 0], src: 'telegram', onb: 4, onbDone: false, materials: 0, taken: 0, takeAgo: [], visitAgo: 3, cost30: 0 },
  { name: 'Ирина', email: 'irina.demo@example.com', reg: 1, plan: ['free', 'Старт', 0], src: 'instagram', onb: 5, onbDone: true, materials: 2, taken: 0, takeAgo: [], visitAgo: 0, cost30: 6.1 },
  { name: 'Наталья', email: 'nata.demo@example.com', reg: 60, plan: ['start', 'Блог', 990], src: 'vk', onb: 5, onbDone: true, materials: 30, taken: 17, takeAgo: [33, 36, 40, 43, 47], visitAgo: 31, cost30: 0 },
  { name: 'Татьяна', email: 'tanya.demo@example.com', reg: 12, plan: ['free', 'Старт', 0], src: 'google', onb: 5, onbDone: true, materials: 10, taken: 0, takeAgo: [], visitAgo: 4, limit: true, cost30: 31.4 },
  { name: 'Юлия', email: 'yulia.demo@example.com', reg: 18, plan: ['free', 'Старт', 0], src: 'telegram', onb: 5, onbDone: true, materials: 10, taken: 5, takeAgo: [6, 8, 10, 12, 14], visitAgo: 6, limit: true, limitNoReturn: true, voiceEmpty: true, cost30: 29.8 },
  { name: 'Ксения', email: 'ksenia.demo@example.com', reg: 9, plan: ['practice', 'Практика', 2490], src: 'other', onb: 5, onbDone: true, materials: 25, taken: 15, takeAgo: [0, 2, 4, 6, 8], visitAgo: 0, published: true, cost30: 402.7 },
  { name: 'Дарья', email: 'dasha.demo@example.com', reg: 2, plan: ['free', 'Старт', 0], src: 'direct', onb: 2, onbDone: false, materials: 0, taken: 0, takeAgo: [], visitAgo: 2, cost30: 0 },
  { name: 'Алена', email: 'alena.demo@example.com', reg: 15, plan: ['free', 'Старт', 0], src: 'yandex', onb: 5, onbDone: true, materials: 8, taken: 3, takeAgo: [3, 5, 9], visitAgo: 1, edits: 3, cost30: 22.3 },
  { name: 'Вера Т.', email: 'vera.demo@example.com', reg: 50, plan: ['expert', 'Студия', 4990], src: 'telegram', onb: 5, onbDone: true, materials: 70, taken: 52, takeAgo: [1, 2, 3, 4, 5, 6, 7, 8], visitAgo: 1, published: true, cost30: 512.0 },
]

const uid = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`

function factsOf(s: Seed, now: Date): PersonFacts {
  const takeDays = s.takeAgo.map(d => day(now, d))
  const in14 = s.takeAgo.filter(d => d < 14).length
  const prev14 = s.takeAgo.filter(d => d >= 14 && d < 28).length
  return {
    registered_at: at(now, s.reg, 9), onboarded: s.onbDone, materials: s.materials, take_days: takeDays,
    last_visit_at: s.visitAgo === null ? null : at(now, s.visitAgo, 20), last_take_at: s.takeAgo.length ? at(now, Math.min(...s.takeAgo), 21) : null,
    takes_14: in14, takes_prev_14: prev14, last3_taken: s.materials >= 3 ? (s.taken === 0 ? 0 : Math.min(3, Math.max(0, s.notLike ? 0 : 2))) : null,
    not_like_7: s.notLike || 0, strong_edits_7: s.edits || 0, errors_7: s.errors || 0, limit_no_return: !!s.limitNoReturn,
    voice_core_empty: s.voiceEmpty ?? s.reg < 7, published_14: !!s.published,
  }
}

function churnOf(s: Seed, now: Date): Churn {
  const facts = factsOf(s, now)
  const risk = computeRisk(facts, now)
  return { facts, score: risk?.score ?? 0, level: risk?.level ?? 'norm', reasons: risk?.reasons ?? [], rhythm_days: risk?.rhythm_days ?? 7, status: statusOf(facts, risk, now) }
}

export function demoPeople(now = NOW()): PersonRow[] {
  return SEEDS.map((s, i) => {
    const churn = churnOf(s, now)
    const firstTake = s.takeAgo.length ? Math.max(...s.takeAgo) : null
    return {
      user_id: uid(i), email: s.email, full_name: s.name, registered_at: at(now, s.reg, 9),
      plan_code: s.plan[0], plan_name: s.plan[1], plan_price: s.plan[2], src: s.src,
      onb_last_step: s.onb, onb_done: s.onbDone,
      first_make_at: s.materials ? at(now, s.reg - 0.2, 10) : null,
      first_material_at: s.materials ? at(now, s.reg - 0.2, 10) : null,
      first_take_at: firstTake !== null ? at(now, firstTake, 21) : null,
      second_take_at: s.takeAgo.length > 1 ? at(now, [...s.takeAgo].sort((a, b) => b - a)[1], 21) : null,
      first_paywall_at: s.limit || s.plan[2] > 0 ? at(now, Math.max(0, s.reg - 5), 15) : null,
      paying: s.plan[2] > 0,
      last_visit_at: churn.facts.last_visit_at, sessions_7: s.visitAgo !== null && s.visitAgo < 7 ? 2 + (i % 5) : 0,
      visit_days_30: s.visitAgo !== null && s.visitAgo < 30 ? Math.min(30, 3 + ((i * 7) % 20)) : 0,
      materials: s.materials, materials_taken: s.taken, cost_rub_30: s.cost30, cost_rub_all: Math.round(s.cost30 * 1.6 * 10) / 10,
      limit_hit_ever: !!s.limit, limit_hit_7: !!s.limit, error_7: !!s.errors, churn,
    }
  })
}

export function demoOverview(now = NOW()): Overview {
  const ps = demoPeople(now)
  const ago = (iso: string | null) => (iso ? (now.getTime() - Date.parse(iso)) / 86400000 : Infinity)
  return {
    took_7: ps.filter(p => ago(p.churn.facts.last_take_at) <= 7).length,
    active_today: ps.filter(p => ago(p.last_visit_at) < 1).length,
    active_7: ps.filter(p => ago(p.last_visit_at) <= 7).length,
    new_7: ps.filter(p => ago(p.registered_at) <= 7).length,
    registered_all: ps.length,
    activated_all: ps.filter(p => p.first_take_at && (Date.parse(p.first_take_at) - Date.parse(p.registered_at)) / 86400000 <= 3).length,
    cost_today_rub: demoCosts(now).by_day.at(-1)?.rub ?? 0, cost_30_rub: demoCosts(now).total_rub, limit_7: ps.filter(p => p.limit_hit_7).length,
  }
}

export function demoFunnel(now = NOW()): FunnelStep[] {
  const ps = demoPeople(now)
  const steps: [FunnelStep['key'], (p: PersonRow) => string | null][] = [
    ['registered', p => p.registered_at], ['onboarded', p => (p.onb_done ? p.registered_at : null)], ['first_make', p => p.first_make_at],
    ['first_material', p => p.first_material_at], ['first_take', p => p.first_take_at], ['second_take', p => p.second_take_at],
    ['saw_paywall', p => p.first_paywall_at], ['paying', p => (p.paying ? p.registered_at : null)],
  ]
  const med = [null, 0.2, 2.5, 0.1, 19, 70, 140, 260]
  return steps.map(([key, f], i) => { const users = ps.filter(p => f(p)).map(p => p.user_id); return { key, n: users.length, median_hours_from_prev: med[i], users } })
}

export function demoOnboarding(now = NOW()): Onboarding {
  const ps = demoPeople(now)
  const viewed = (s: number) => ps.filter(p => (p.onb_last_step || 0) >= s).length
  const ms = [6200, 9100, 3300, 48000, 15000]
  return {
    intro: ps.length + 2, finished: ps.filter(p => p.onb_done).length,
    steps: [1, 2, 3, 4, 5].map(s => {
      const dropped = ps.filter(p => !p.onb_done && p.onb_last_step === s)
      return { step: s, viewed: viewed(s) + (s === 1 ? 2 : 0), done: viewed(s + 1) + (s === 5 ? ps.filter(p => p.onb_done).length - viewed(6) : 0), median_ms: ms[s - 1], dropped: dropped.length, dropped_users: dropped.map(p => p.user_id) }
    }),
  }
}

export function demoMake(): MakeStats {
  return {
    starts: 94, done: 88, errors: 6, median_ms: 41000, materials: 171, taken: 98,
    by_format: [
      { format: 'post', started: 70, materials: 66, taken: 41 }, { format: 'carousel', started: 61, materials: 55, taken: 33 },
      { format: 'reels', started: 28, materials: 26, taken: 15 }, { format: 'post_tg', started: 17, materials: 16, taken: 7 },
      { format: 'stories', started: 9, materials: 8, taken: 2 },
    ],
    by_mode: [{ mode: 'thought', n: 51 }, { mode: 'topic', n: 30 }, { mode: 'same', n: 9 }, { mode: 'draft', n: 4 }],
    errors_by_code: [{ code: 'format_failed', n: 3 }, { code: 'text_limit', n: 2 }, { code: 'sample_closed', n: 1 }],
  }
}

export function demoFeatures(): Features {
  return {
    features: [
      { feature: 'ideas', users_7: 4, users_30: 7, times_30: 19 }, { feature: 'plan', users_7: 2, users_30: 5, times_30: 11 },
      { feature: 'voice', users_7: 3, users_30: 6, times_30: 9 }, { feature: 'sozhe', users_7: 1, users_30: 3, times_30: 5 },
      { feature: 'texts', users_7: 6, users_30: 9, times_30: 40 }, { feature: 'carousel_design', users_7: 5, users_30: 8, times_30: 31 },
      { feature: 'archetype_test', users_7: 1, users_30: 4, times_30: 4 }, { feature: 'passport', users_7: 0, users_30: 0, times_30: 0 },
    ],
    screens: [
      { screen: 'make', users_7: 8, users_30: 11, times_30: 210 }, { screen: 'texts', users_7: 6, users_30: 9, times_30: 64 },
      { screen: 'themes', users_7: 4, users_30: 7, times_30: 25 }, { screen: 'profile', users_7: 3, users_30: 6, times_30: 12 },
      { screen: 'old_hooks', users_7: 0, users_30: 0, times_30: 0 },
    ],
    formats: [
      { format: 'post', made_30: 66, taken_30: 41, users_30: 10 }, { format: 'carousel', made_30: 55, taken_30: 33, users_30: 9 },
      { format: 'reels', made_30: 26, taken_30: 15, users_30: 6 }, { format: 'post_tg', made_30: 16, taken_30: 7, users_30: 4 },
      { format: 'stories', made_30: 8, taken_30: 2, users_30: 3 },
    ],
    carousel_styles: [{ style: 't_zametki', carousels: 14, exports: 22 }, { style: 't_redakciya', carousels: 9, exports: 11 }, { style: 't_plakat', carousels: 5, exports: 6 }, { style: 't_vozduh', carousels: 2, exports: 2 }],
  }
}

export function demoCosts(now = NOW()): Costs {
  const ps = demoPeople(now)
  const by_day = Array.from({ length: 30 }, (_, i) => ({ day: day(now, 29 - i), rub: Math.round((25 + 30 * Math.abs(Math.sin(i * 0.7)) + (i > 20 ? 25 : 0)) * 10) / 10 }))
  const paying = ps.filter(p => p.paying)
  return {
    by_day,
    by_operation: [
      { operation: 'generate_post_simple_path', rub: 612.4, calls: 160 }, { operation: 'generate_post_core', rub: 88.1, calls: 70 },
      { operation: 'generate_post_cut_h7', rub: 61.0, calls: 40 }, { operation: 'carousel_layout', rub: 74.9, calls: 51 },
      { operation: 'sample_parse_vision', rub: 34.2, calls: 6 }, { operation: 'voice_core', rub: 22.0, calls: 9 },
    ],
    by_model: [{ model: 'gpt-6.1-sol', rub: 801.3, calls: 300 }, { model: 'gpt-5.4', rub: 91.3, calls: 36 }],
    top_users: [...ps].sort((a, b) => b.cost_rub_30 - a.cost_rub_30).slice(0, 8).map(p => ({ user_id: p.user_id, email: p.email, rub: p.cost_rub_30 })),
    total_rub: by_day.reduce((s, d) => s + d.rub, 0), materials: 171, taken: 98,
    over_plan: ps.filter(p => p.paying && p.plan_price && p.cost_rub_30 > 0.15 * p.plan_price).map(p => ({ user_id: p.user_id, email: p.email, plan_code: p.plan_code || '', plan_price: p.plan_price || 0, rub_30: p.cost_rub_30 })),
    economy: {
      paying: paying.length, mrr: paying.reduce((s, p) => s + (p.plan_price || 0), 0), churned_paying_30: 1,
      ai_rub_30_paying: paying.reduce((s, p) => s + p.cost_rub_30, 0),
      plans: [
        { code: 'start', name: 'Блог', price: 990, users: 2, ai_rub_30: 61.2 },
        { code: 'practice', name: 'Практика', price: 2490, users: 2, ai_rub_30: 617.2 },
        { code: 'expert', name: 'Студия', price: 4990, users: 1, ai_rub_30: 512.0 },
      ],
    },
    sources: ['telegram', 'instagram', 'yandex', 'google', 'vk', 'direct', 'other'].map(src => {
      const us = ps.filter(p => p.src === src)
      return { src, users: us.length, activated: us.filter(p => p.first_take_at || p.paying).length, paying: us.filter(p => p.paying).length }
    }).filter(s => s.users),
  }
}

export function demoPerson(id: string, now = NOW()): PersonDetail | null {
  const ps = demoPeople(now)
  const p = ps.find(x => x.user_id === id)
  if (!p) return null
  const i = ps.indexOf(p)
  const tl: TimelineItem[] = []
  const tAt = (dAgo: number, h: number, m: number) => { const d = new Date(now.getTime() - dAgo * 86400000); d.setUTCHours(h, m, 0, 0); return d.toISOString() }
  for (const d of SEEDS[i].takeAgo.slice(0, 5)) {
    tl.push({ at: tAt(d, 14, 10), type: 'event', event: 'app_open', props: { device: i % 2 ? 'desktop' : 'mobile', standalone: false, ref: 'direct' } })
    tl.push({ at: tAt(d, 14, 11), type: 'event', event: 'make_start', props: { formats: 'post,carousel', mode: 'thought', voice: i % 3 === 0, n: 2 } })
    tl.push({ at: tAt(d, 14, 12), type: 'material', format: 'post', group_id: 'g', status: 'ready' })
    tl.push({ at: tAt(d, 14, 12), type: 'material', format: 'carousel', group_id: 'g', status: 'ready' })
    tl.push({ at: tAt(d, 14, 12), type: 'event', event: 'make_done', props: { formats: 'post,carousel', ms: 38000, n_ok: 2 } })
    tl.push({ at: tAt(d, 14, 14), type: 'event', event: 'material_take', props: { how: 'copy', format: 'carousel' } })
    if (d % 2 === 0) tl.push({ at: tAt(d, 14, 20), type: 'export', method: 'share', style: 't_zametki', count: 1 })
    if (SEEDS[i].notLike) tl.push({ at: tAt(d, 14, 16), type: 'voice', kind: 'not_like', change_ratio: null })
  }
  if (SEEDS[i].limit) tl.push({ at: tAt(4, 11, 0), type: 'event', event: 'limit_hit', props: { reason: 'text_limit', plan: 'free', op: 'generate_post' } })
  tl.sort((a, b) => b.at.localeCompare(a.at))
  return {
    user_id: p.user_id, email: p.email, full_name: p.full_name, registered_at: p.registered_at, plan_code: p.plan_code, plan_name: p.plan_name,
    plan_price: p.plan_price, src: p.src, last_visit_at: p.last_visit_at, churn: p.churn,
    intro_at: p.registered_at, done_at: p.onb_done ? p.registered_at : null, mic_denied: i === 4,
    onboarding: [1, 2, 3, 4, 5].map(s => ({ step: s, viewed_at: (p.onb_last_step || 0) >= s ? p.registered_at : null, done_at: (p.onb_last_step || 0) > s || p.onb_done ? p.registered_at : null, ms: (p.onb_last_step || 0) >= s ? [5200, 8800, 2900, 51000, 13000][s - 1] : null })),
    timeline: tl,
    features: [{ feature: 'texts', n: 7 }, { feature: 'carousel_design', n: 5 }, { feature: 'ideas', n: 2 }],
    formats: [{ format: 'post', made: Math.ceil(p.materials / 2), taken: Math.ceil(p.materials_taken / 2) }, { format: 'carousel', made: Math.floor(p.materials / 2), taken: Math.floor(p.materials_taken / 2) }],
    voice: { by_kind: [{ kind: 'copied_clean', n: 9 }, { kind: 'edit_pair', n: SEEDS[i].edits || 2 }, { kind: 'not_like', n: SEEDS[i].notLike || 0 }, { kind: 'speech', n: 3 }], weeks: [] },
    money: {
      rub_30: p.cost_rub_30, rub_all: p.cost_rub_all,
      by_operation_30: [{ operation: 'generate_post_simple_path', rub: Math.round(p.cost_rub_30 * 0.7 * 10) / 10, calls: 20 }, { operation: 'carousel_layout', rub: Math.round(p.cost_rub_30 * 0.3 * 10) / 10, calls: 9 }],
      by_model_30: [{ model: 'gpt-6.1-sol', rub: p.cost_rub_30, calls: 29 }],
      by_operation_all: [{ operation: 'generate_post_simple_path', rub: Math.round(p.cost_rub_all * 0.7 * 10) / 10, calls: 31 }],
    },
    text_usage: { period: now.toISOString().slice(0, 7), count: Math.min(10, p.materials), cap: p.plan_code === 'free' ? 10 : null },
  }
}
