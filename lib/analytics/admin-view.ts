// Вывод кабинета: русские названия кодов, фильтр и сортировка людей, строки ленты.
// Общий для экранов /admin и выгрузки, чтобы файл совпадал с тем, что на экране. Текстов постов здесь нет.

import { STYLES, isTemplateStyle } from '@/lib/carousel/styles'
import { FORMAT_RU, MODE_RU } from './events'
import { STATUS_RU, type Status } from './definitions'
import type { PersonRow, TimelineItem, Period } from './admin-types'

export const FEATURE_RU: Record<string, string> = {
  ideas: 'Темы, идеи', plan: 'Темы, план', voice: 'Голос', sozhe: 'Сделать так же', texts: 'Мои тексты',
  carousel_design: 'Оформление карусели', archetype_test: 'Тест-архетип', passport: 'Бренд-паспорт',
}
export const SCREEN_RU: Record<string, string> = {
  make: 'Сделать', themes: 'Темы', texts: 'Мои тексты', profile: 'Настройки', voice: 'Голос', edit_profile: 'Профиль практики',
  passport: 'Бренд-паспорт', home: 'Главная', onboarding: 'Онбординг', archetype_test: 'Тест-архетип', onboarding_full: 'Старая анкета',
  old_carousel: 'Старая карусель', old_reels: 'Старые рилс', old_hooks: 'Старые хуки', old_rewrite: 'Старый рерайт', old_competitor: 'Анализ конкурента', other: 'Другое',
}
const OP_RU: [RegExp, string][] = [
  [/^generate_post_simple/, 'текст'], [/^generate_post_cut/, 'ножницы'], [/^generate_post_core/, 'суть'], [/^generate_post_cover/, 'обложка'],
  [/^generate_post_hooks/, 'заходы'], [/^generate_post_(plan|text|pick|check|fix|set_fix)/, 'полная цепочка'], [/^generate_post$/, 'текст, старый путь'],
  [/^carousel_layout/, 'раскладка карусели'], [/^sample_parse/, 'разбор образца'], [/^voice_core/, 'слепок голоса'], [/^rewrite_post/, 'черновик'],
  [/^research_topics/, 'ресерч тем'], [/^generate_content_plan/, 'контент-план'], [/^archetype_story/, 'архетип'], [/^generate_(reels|hooks|carousel)/, 'старые генераторы'],
]
const ERROR_RU: Record<string, string> = {
  format_failed: 'формат не собрался', server: 'сбой сервера', sample_failed: '«так же»: образец не прочитался',
  sample_instagram: '«так же»: ссылка Instagram', sample_closed: '«так же»: закрытый канал', text_limit: 'кончились пробные тексты',
  text_limit_partial: 'пробных текстов не хватило на все форматы', insufficient: 'не хватило энергии', no_access: 'нет на тарифе', limit: 'лимит',
}
export const errorRu = (code: string) => ERROR_RU[code] || (code.startsWith('http_') ? `ошибка ответа ${code.slice(5)}` : code)
export const opRu = (op: string) => OP_RU.find(([re]) => re.test(op))?.[1] || op
export const styleRu = (s: string) => (isTemplateStyle(s) ? STYLES[s].label : s)
export const formatRu = (f: string) => FORMAT_RU[f] || f
export const SRC_RU: Record<string, string> = { telegram: 'Telegram', instagram: 'Instagram', yandex: 'Яндекс', google: 'Google', vk: 'ВК', direct: 'напрямую', other: 'другое', internal: 'изнутри' }
export const srcRu = (s: string | null) => (s ? SRC_RU[s] || s : 'неизвестно')
export const PERIOD_RU: Record<Period, string> = { '7': 'за 7 дней', '30': 'за 30 дней', all: 'за все время' }

// ---------- люди: фильтр и сортировка ----------
export type PeopleFilter = Status | 'attention' | 'all'
export const PEOPLE_FILTERS: { id: PeopleFilter; label: string }[] = [
  { id: 'all', label: 'Все' }, { id: 'attention', label: 'Внимание' }, { id: 'new', label: STATUS_RU.new }, { id: 'stuck', label: STATUS_RU.stuck },
  { id: 'trying', label: STATUS_RU.trying }, { id: 'active', label: STATUS_RU.active }, { id: 'cooling', label: STATUS_RU.cooling }, { id: 'gone', label: STATUS_RU.gone },
]
export type PeopleSort = 'risk' | 'visit' | 'reg' | 'taken' | 'cost' | 'email'
export const SORT_RU: Record<PeopleSort, string> = { risk: 'риск', visit: 'последний визит', reg: 'регистрация', taken: 'взято', cost: 'траты', email: 'почта' }
export const isSort = (v: unknown): v is PeopleSort => typeof v === 'string' && v in SORT_RU
export const isFilter = (v: unknown): v is PeopleFilter => PEOPLE_FILTERS.some(f => f.id === v)

export function filterPeople(ps: PersonRow[], q: string, filter: PeopleFilter, sort: PeopleSort): PersonRow[] {
  const needle = q.trim().toLowerCase()
  const t = (s: string | null) => (s ? Date.parse(s) : 0)
  return ps
    .filter(p => !needle || p.email.toLowerCase().includes(needle))
    .filter(p => filter === 'all' ? true : filter === 'attention' ? p.churn.score >= 30 && p.churn.status !== 'gone' : p.churn.status === filter)
    .sort((a, b) => {
      switch (sort) {
        case 'risk': return b.churn.score - a.churn.score || t(b.last_visit_at) - t(a.last_visit_at)
        case 'visit': return t(b.last_visit_at) - t(a.last_visit_at)
        case 'reg': return t(b.registered_at) - t(a.registered_at)
        case 'taken': return b.materials_taken - a.materials_taken
        case 'cost': return b.cost_rub_30 - a.cost_rub_30
        case 'email': return a.email.localeCompare(b.email)
      }
    })
}

// Шаг воронки, где человек сейчас
export function stepOf(p: PersonRow): string {
  if (p.paying) return 'платит'
  if (p.first_paywall_at && p.second_take_at) return 'видела тарифы'
  if (p.second_take_at) return 'вернулась и взяла второй'
  if (p.first_take_at) return 'первый взятый текст'
  if (p.first_material_at) return 'есть материал, не взят'
  if (p.first_make_at) return 'запускала «Сделать»'
  if (p.onb_done) return 'прошла онбординг'
  return p.onb_last_step ? `онбординг, вопрос ${p.onb_last_step}` : 'только регистрация'
}

// ---------- лента: строка действия словами, без текстов ----------
export type TimelineKind = 'take' | 'trouble' | 'other'
const HOW_RU: Record<string, string> = {
  copy: 'скопировала', copy_caption: 'скопировала описание', copy_text: 'скопировала текст рилса', share: 'сохранила в Фото',
  zip: 'скачала архив', single: 'скачала слайд', list: 'сохранила слайды', published: 'отметила «опубликовала»',
}
const ADJ_RU: Record<string, string> = { more_format: 'еще формат из этого', other: 'другой заход' }
const VOICE_RU: Record<string, string> = {
  edit_pair: 'правка перед копированием', copied_clean: 'скопировала без правок', mine: '«похоже на меня»', not_like: '«не похоже»',
  button: 'кнопка «Поправить»', hook_pick: 'выбрала заход', rephrase: '«скажи по-своему»', repeat_phrases: 'фразы, что повторяет клиентам',
  speech: 'надиктовала', rewrite_input: 'принесла черновик', pasted_post: 'вставила свой пост', tg_post: 'пост из Telegram', voice_feedback: 'отзыв о слепке голоса',
}
export const voiceKindRu = (k: string) => VOICE_RU[k] || k
const FROM_RU: Record<string, string> = { thought: 'из мысли', topic: 'из темы', same: 'по образцу', draft: 'из черновика' }
// Вопросы экспресс-онбординга по порядку (app/onboarding/express)
export const ONB_STEP_RU: Record<number, string> = { 1: 'Имя', 2: 'Подход', 3: 'Ниша', 4: 'Как говоришь с клиентами', 5: 'Слова клиента' }
export const onbStepRu = (n: number) => ONB_STEP_RU[n] || `Вопрос ${n}`
const fmts = (v: unknown) => String(v || '').split(',').filter(Boolean).map(formatRu).join(' + ')
const sec = (ms: unknown) => (typeof ms === 'number' ? `${Math.round(ms / 1000)} с` : '')

export function timelineLine(t: TimelineItem): { text: string; kind: TimelineKind } {
  if (t.type === 'material') return { text: `готов материал: ${formatRu(t.format)}`, kind: 'other' }
  if (t.type === 'published') return { text: `отметила «опубликовала»: ${formatRu(t.format)}`, kind: 'take' }
  if (t.type === 'export') return { text: `сохранила карусель${t.style ? `, ${styleRu(t.style)}` : ''}${t.method ? ` (${HOW_RU[t.method] || t.method})` : ''}`, kind: 'take' }
  if (t.type === 'voice') return { text: `голос: ${voiceKindRu(t.kind)}${t.change_ratio !== null ? `, правка ${Math.round(t.change_ratio * 100)}%` : ''}`, kind: t.kind === 'not_like' ? 'trouble' : 'other' }
  const p = t.props
  switch (t.event) {
    case 'app_open': return { text: `зашла${p.device === 'mobile' ? ' с телефона' : p.device === 'desktop' ? ' с компьютера' : ''}${p.standalone ? ', с иконки' : ''}`, kind: 'other' }
    case 'screen_view': return { text: `экран «${SCREEN_RU[String(p.screen)] || p.screen}»`, kind: 'other' }
    case 'signup_source': return { text: `пришла: ${srcRu(String(p.src || ''))}`, kind: 'other' }
    case 'onb_intro': return { text: 'онбординг: вход с Верой', kind: 'other' }
    case 'onb_step_view': return { text: `онбординг: ${onbStepRu(Number(p.step)).toLowerCase()}`, kind: 'other' }
    case 'onb_step_done': return { text: `онбординг: ответила, ${onbStepRu(Number(p.step)).toLowerCase()}${p.ms ? `, ${sec(p.ms)}` : ''}`, kind: 'other' }
    case 'onb_skip': return { text: `онбординг: пропустила, ${onbStepRu(Number(p.step)).toLowerCase()}`, kind: 'other' }
    case 'onb_situation_change': return { text: 'онбординг: другая ситуация', kind: 'other' }
    case 'onb_mic_denied': return { text: 'микрофон не дали', kind: 'trouble' }
    case 'onb_done': return { text: 'онбординг пройден', kind: 'other' }
    case 'onb_first_click': return { text: 'нажала «Сделать» на финале онбординга', kind: 'other' }
    case 'make_start': return { text: `Сделать: ${fmts(p.formats)}${p.mode ? `, ${FROM_RU[String(p.mode)] || p.mode}` : ''}${p.voice ? ', голосом' : ''}`, kind: 'other' }
    case 'make_done': return { text: `готово: ${p.n_ok ?? '?'} из ${String(p.formats || '').split(',').filter(Boolean).length || '?'}${p.ms ? `, ${sec(p.ms)}` : ''}`, kind: 'other' }
    case 'make_error': return { text: `ошибка «Сделать»: ${p.code}${p.format ? `, ${formatRu(String(p.format))}` : ''}`, kind: 'trouble' }
    case 'material_take': return { text: `${HOW_RU[String(p.how)] || 'взяла'}${p.format ? `: ${formatRu(String(p.format))}` : ''}`, kind: 'take' }
    case 'material_adjust': return { text: `поправила: ${ADJ_RU[String(p.action)] || p.action}`, kind: 'other' }
    case 'limit_hit': return { text: `уперлась в лимит (${p.reason})`, kind: 'trouble' }
    case 'paywall_view': return { text: 'видела тарифы', kind: 'other' }
    case 'plan_click': return { text: `нажала на тариф ${p.plan}`, kind: 'other' }
    case 'error_shown': return { text: `показали ошибку${p.screen ? ` на экране «${SCREEN_RU[String(p.screen)] || p.screen}»` : ''}`, kind: 'trouble' }
    case 'feature_open': return { text: `открыла «${FEATURE_RU[String(p.feature)] || p.feature}»`, kind: 'other' }
    default: return { text: t.event, kind: 'other' }
  }
}
