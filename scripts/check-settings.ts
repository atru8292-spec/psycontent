// Проверка связности настроек и генерации (задача sdelat-i-brend, раздел 8а), без настоящей модели.
// Собирает промпты нового мозга для нескольких сочетаний профиля и проверяет, что каждая настройка
// реально меняет текст промпта: в простом пути (simple.ts, по умолчанию) и в полной цепочке (pipeline.ts, GENERATION_MODE=full).
// Запуск: npx tsx scripts/check-settings.ts

import { buildAuthorSettings } from '../lib/generation/settings'
import { draft, type GenContext, type GenRequest } from '../lib/generation/pipeline'
import { simpleWrite } from '../lib/generation/simple'
import { coreBlockFor, GOAL_INTENTS } from '../lib/generation/group'
import { normalizeCore } from '../lib/generation/core'
import type { FormatCode } from '../lib/generation/text-guard'

process.env.OPENAI_API_KEY = 'test'
process.env.GENERATION_CANDIDATES = '1'
process.env.GENERATION_SIMPLIFY = '0'
process.env.GENERATION_CUT = '0'

// Подмена модели: запоминаем все промпты, отвечаем заглушкой
let captured: string[] = []
globalThis.fetch = (async (_u: any, init: any) => {
  const b = JSON.parse(init.body)
  const sys = String(b.messages[0].content), user = String(b.messages[1].content)
  captured.push(sys + '\n<<USER>>\n' + user)
  const content = b.response_format
    ? (sys.startsWith('Ты редактор блога') ? JSON.stringify({ intent: 'mehanizm', topic_for_text: 'тревога после сообщения', hook_type: 'golos_chitatelya', material: 'нет', length: 'sredne' }) : '{"cut":[]}')
    : (sys.startsWith('Ты редактор блога') ? JSON.stringify({ intent: 'mehanizm', topic_for_text: 'тревога после сообщения', hook_type: 'golos_chitatelya', material: 'нет', length: 'sredne' })
      : 'Телефон лежит экраном вниз, а ты все равно его переворачиваешь.\n\nПодпись: про тревогу')
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 })
}) as any

const emptyMemory = () => ({
  count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [],
  lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [],
})

const BASE: Record<string, any> = {
  full_name: 'Анна Ветрова', approaches: ['КПТ'], one_niche: 'тревога у взрослых', client_avatar: 'взрослые 25-40, работают',
  tone_verbal: 'пишу просто', disclosure: 2, reader_address: 'ty', author_gender: 'female',
  profanity: 'no', intensity: 'live', tone_formal: 50, tone_serious: 50, tone_cautious: 50,
}

// Настройка → изменение профиля. Значения ровно те, что пишет интерфейс.
const SETTINGS: [string, Record<string, any>][] = [
  ['reader_address (обращение)', { reader_address: 'vy' }],
  ['author_gender (пол)', { author_gender: 'male' }],
  ['profanity (мат)', { profanity: 'free' }],
  ['intensity (эмоции)', { intensity: 'calm' }],
  ['tone_formal (ползунок)', { tone_formal: 90 }],
  ['tone_serious (ползунок)', { tone_serious: 10 }],
  ['tone_cautious (ползунок)', { tone_cautious: 90 }],
  ['disclosure (самораскрытие)', { disclosure: 1, story_bank: [{ text: 'Как я сама боялась тревоги перед выступлением', level: 'personal' }] }],
  ['approaches (подход)', { approaches: ['Гештальт'] }],
  ['one_niche (ниша)', { one_niche: 'выгорание у врачей' }],
  ['client_avatar (аудитория)', { client_avatar: 'мамы в декрете' }],
  ['audience (аудитория, новое поле)', { audience: 'в основном мужчины 30-45' }],
  ['client_pain_phrases (фразы клиентов)', { client_pain_phrases: 'я опять не справилась' }],
  ['first_session_info (первая встреча)', { first_session_info: 'знакомимся и ищем запрос' }],
  ['character_text (персонаж)', { character_text: 'кот Тревожка, паникует по пустякам' }],
  ['position_text (позиция)', { position_text: 'терапия не про то, чтобы стать удобной' }],
  ['story_bank (истории)', { story_bank: [{ text: 'Как тревога после сообщения мешала мне спать', level: 'work' }] }],
  ['voice_samples (образцы)', { voice_samples: [{ text: 'Ну вот правда, я сто раз проверяла телефон. Смешно, да? А потом поняла, что жду не сообщения, а разрешения выдохнуть.', fit: true }] }],
  ['live_voice (живой голос)', { live_voice: 'Я всегда говорю клиентам: давай без героизма, просто посмотрим, что происходит.' }],
  ['voice_core (слепок)', { voice_core: '1. Фразы короткие.\n7. Ирония.\n11. Обороты: «ну вот правда»' }],
  ['voice_corrections (поправка голоса)', { voice_corrections: 'я не использую уменьшительные' }],
  ['tone_verbal (манера из экспресса)', { tone_verbal: 'говорю коротко и с иронией' }],
  ['client_job (чем занимается клиент)', { client_avatar: '', client_job: 'учителя в школе' }],
  ['signature_phrases (свои фразы)', { signature_phrases: ['ну вот правда', 'давай без героизма'] }],
  ['archetype_primary (тест-архетип)', { archetype_primary: 'jester' }],
]
// Настройки, которые нужны только при своем смысле: факты практики идут в «как на консультации» и приглашение
const INTENT_SETTINGS: [string, Record<string, any>, string][] = [
  ['client_fear (чего боится клиент)', { client_fear: 'что его осудят' }, 'kak_v_terapii'],
  ['client_result (что меняется)', { client_result: 'спит спокойно' }, 'kak_v_terapii'],
  ['client_tried (что пробовал)', { client_tried: 'медитации и книги' }, 'kak_v_terapii'],
]

// Осознанно не доходят (решение за Ариной, 04.10): простой путь не берет слепок голоса целиком
// (короткий промпт выиграл слепое сравнение 01.10); полная цепочка берет свои фразы через слепок (пункт 11),
// а отдельное поле signature_phrases там служит только запретом повтора.
const KNOWN = new Set(['simple voice_core (слепок)', 'full signature_phrases (свои фразы)'])

const TOPIC = 'тревога после сообщения без ответа'
type Mode = 'simple' | 'full'

async function prompts(mode: Mode, profile: Record<string, any>, req: Partial<GenRequest> = {}, ctxPatch: Partial<GenContext> = {}): Promise<string> {
  process.env.GENERATION_MODE = mode
  captured = []
  const ctx: GenContext = { userId: 'check', settings: buildAuthorSettings(profile), memory: emptyMemory() as any, editPairs: '', ...ctxPatch }
  const r: GenRequest = { topic: TOPIC, format: 'post', intent: 'mehanizm', ...req } as GenRequest
  if (mode === 'simple') await simpleWrite(ctx, r)
  else await draft(ctx, r, { skipDetail: true })
  return captured.join('\n=====\n')
}

;(async () => {
  const rows: string[] = []
  let fails = 0
  for (const mode of ['simple', 'full'] as Mode[]) {
    const base = await prompts(mode, BASE)
    for (const [name, patch] of SETTINGS) {
      const p = await prompts(mode, { ...BASE, ...patch })
      const ok = p !== base
      const known = KNOWN.has(`${mode} ${name}`)
      if (!ok && !known) fails++
      rows.push(`${ok ? 'ok  ' : known ? 'знаю' : 'НЕТ '} ${mode.padEnd(6)} ${name}${!ok && known ? ' (осознанно, решение Арины)' : ''}`)
    }
    for (const [name, patch, intent] of INTENT_SETTINGS) {
      const b = await prompts(mode, BASE, { intent })
      const p = await prompts(mode, { ...BASE, ...patch }, { intent })
      const ok = p !== b
      if (!ok) fails++
      rows.push(`${ok ? 'ok  ' : 'НЕТ '} ${mode.padEnd(6)} ${name}`)
    }
    // «Как ко мне попасть» доходит в Telegram и НЕ доходит в Instagram (запрет рекламы, 04.10)
    {
      const bk = { ...BASE, booking_info: 'пиши в директ слово «встреча»' }
      const tg = (await prompts(mode, bk, { format: 'post_tg' as FormatCode })).includes('слово «встреча»')
      const ig = (await prompts(mode, bk, { format: 'post' as FormatCode })).includes('слово «встреча»')
      const ok = mode === 'simple' ? tg && !ig : tg
      if (!ok) fails++
      rows.push(`${ok ? 'ok  ' : 'НЕТ '} ${mode.padEnd(6)} booking_info (как попасть): Telegram ${tg ? 'да' : 'нет'}, Instagram ${ig ? 'да' : 'нет'}${mode === 'full' && ig ? ' (полная цепочка: убирает реклама-проверка после текста)' : ''}`)
    }
    // обучение: правки перед копированием и «Не похоже»
    for (const [name, patch] of [
      ['Правки автора (voice_events edit_pair)', { editPairs: 'Правка 1.\nБыло: «Важно принимать эмоции.»\nСтало: «Злиться можно.»' }],
      ['«Не похоже» и кнопки «Поправить» (feedback, habits)', { memory: { ...emptyMemory(), feedbackReasons: ['слишком умно'] } as any }],
    ] as [string, Partial<GenContext>][]) {
      const p = await prompts(mode, BASE, {}, patch)
      const ok = p !== base
      if (!ok) fails++
      rows.push(`${ok ? 'ok  ' : 'НЕТ '} ${mode.padEnd(6)} ${name}`)
    }
    // поля запроса: цель, форматы, ядро мысли, своя мысль
    const reqChecks: [string, Partial<GenRequest>][] = [
      ['Цель (intent из GOAL_INTENTS.podderzhat)', { intent: GOAL_INTENTS.podderzhat[0] }],
      ['Формат (carousel)', { format: 'carousel' as FormatCode }],
      ['Формат (post_tg)', { format: 'post_tg' as FormatCode }],
      ['Формат (stories)', { format: 'stories' as FormatCode }],
      ['Ядро мысли (coreBlock)', { coreBlock: coreBlockFor(normalizeCore({ thought: 'Тревога ищет разрешения выдохнуть', scene: 'Переворачиваешь телефон', author_detail: '' }, 'mehanizm'), 'post') }],
      ['Соседи набора (neighbors)', { neighbors: '\nКарусель: начинает так: обложка с обещанием. Не начинай так же.\n' }],
      ['Своя мысль (userDetail)', { userDetail: 'Мне кажется, тревога тут про контроль' }],
    ]
    for (const [name, req] of reqChecks) {
      const p = await prompts(mode, BASE, req)
      const ok = p !== base
      if (!ok) fails++
      rows.push(`${ok ? 'ok  ' : 'НЕТ '} ${mode.padEnd(6)} ${name}`)
    }
  }
  // сочетания профиля: промпты разные у всех восьми
  const combos: Record<string, any>[] = [
    BASE,
    { ...BASE, profanity: 'free', intensity: 'hot', tone_formal: 90, tone_cautious: 90 }, // спор: явный выбор главнее
    { ...BASE, profanity: 'no', intensity: 'calm', tone_formal: 90, tone_serious: 90, tone_cautious: 90 },
    { ...BASE, reader_address: 'vy', author_gender: 'male', tone_formal: 10, tone_serious: 10, tone_cautious: 10 },
    { ...BASE, disclosure: 3, story_bank: [{ text: 'Как я боялась тревоги', level: 'personal' }], position_text: 'без героизма' },
    { ...BASE, intensity: 'calm', tone_cautious: 0 },
    { ...BASE, profanity: 'light', tone_formal: 70 },
    { ...BASE, voice_core: '1. Фразы короткие.', voice_corrections: 'без уменьшительных', character_text: 'кот Тревожка' },
  ]
  const outs = new Set<string>()
  for (const c of combos) outs.add(await prompts('simple', c))
  rows.push(`${outs.size === combos.length ? 'ok  ' : 'НЕТ '} simple 8 сочетаний профиля дают ${outs.size} разных промптов`)
  if (outs.size !== combos.length) fails++
  // спор ползунков с явным выбором: при «мат свободно» и «на эмоциях» сдержанной и бережной стороны нет
  const hot = buildAuthorSettings(combos[1]).baseSettings
  const okHot = !/сдержанно|бережно/u.test(hot)
  rows.push(`${okHot ? 'ok  ' : 'НЕТ '} спор: мат и «на эмоциях» главнее ползунков (${(hot.match(/^Тон:.*$/mu) || ['Тон: нет'])[0]})`)
  if (!okHot) fails++
  const calm = buildAuthorSettings(combos[2]).baseSettings.match(/^Тон:.*$/mu)?.[0] || ''
  rows.push(`${/сдержанно-официально/u.test(calm) ? 'ok  ' : 'НЕТ '} без спора ползунки доходят: ${calm}`)

  console.log(rows.join('\n'))
  console.log(fails ? `\nНЕ ДОХОДЯТ: ${fails}` : '\nВсе настройки меняют промпт')
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('FAIL', e); process.exit(1) })
