// Простой путь (03-PROMPTY.md раздел «ПП»): один вызов без плана, проверок и правок,
// потом «Ножницы» (раздел «ПН»): модель только называет лишние фразы, вырезает их код.
// С 01.10 это путь генерации по умолчанию (выиграл слепое сравнение 4:2), GENERATION_MODE=full вернет старую цепочку.

import { PP_SYSTEM, PP_USER, PP_REELS, PN_SYSTEM, PN_USER, SKELETONS, PZH_SYSTEM, PZH_MOVES, PZH3_SYSTEM, PZH3_MOVES, PZH4_SYSTEM, PZH4_MOVES, PZH4_REELS, PZH5_SYSTEM, PZH5_MOVES, PZH5_REELS, PZH5_CARDS, PN5_SYSTEM, PN5_USER } from './prompts.generated'
import { fill, INTENT_CARDS, FORMAT_CARDS } from './prompts'
import { callModel, callJson } from './ai'
import { finalNet, isReels, LABEL_RE, type FormatCode } from './text-guard'
import { pickExamples, examplesText, LIVE_EXAMPLES } from './examples'
import { relevantStories, storiesText } from './settings'
import { pickReelsFormat, type GenContext, type GenRequest } from './pipeline'
import { chooseStart, chooseEnd, chooseCaption, chooseCarousel, offerDetail, detailLine, startEndText, carouselText, captionText, zh4FormatCard, softCutFormat, applySoftCut, numberedSpeech, seedOf, PM_SYSTEM, type Zh4Choice } from './zh4'
import { chooseStart5, chooseEnd5, chooseLen5, choosePrizyv, chooseLoop, chooseAddr, chooseMat, chooseReplika, chooseCaption5, offerDetail5, detailLine5, startEndText5, carouselText5, captionText5, matRule5, allowsMat, applyFixes, type Zh5Choice } from './zh5'
import { activeHyps, hypSystem, hypCall, pickVoiceExamples, voiceExamplesText, liveReelsMaxWords, hypReelsRule, H7_CUT_SYSTEM, pickLiveExamples, liveExamplesText, chooseMove, moveText, isZh } from './hypotheses'

// Режим генерации: simple (по умолчанию с 01.10, выиграл слепое сравнение 4:2) или full (старая цепочка).
export function isSimpleMode(): boolean {
  return String(process.env.GENERATION_MODE || 'simple').trim().toLowerCase() !== 'full'
}

// Смысл: точный, если выбран; из кнопки «Что дать читателю» тот, что не стоял в двух последних материалах.
export function chooseIntent(ctx: GenContext, req: GenRequest): string {
  if (req.intent && INTENT_CARDS[req.intent]) return req.intent
  const choices = (req.intentChoices || []).filter(c => INTENT_CARDS[c])
  const recent = (ctx.memory.lastIntents || []).slice(0, 2)
  return choices.find(c => !recent.includes(c)) || choices[0] || (recent[0] === 'uznavanie' ? 'podderzhka' : 'uznavanie')
}

// Вид рилса без плана: подходящие виды по смыслу, первый, которого не было в двух последних материалах.
// Вид «объясняю как маленькому» (reels_malysh, пример d36) добавлен 01.10 по просьбе Арины: тренд, необычно и душевно.
// С 01.10 психологу видно четыре основных вида, по частоте в разборе 71 живого рилса: говоришь в камеру
// (monolog, otvet, poslanie, istoriya, около половины роликов), два голоса (сценка, в том числе «до и после»,
// около 15), список признаков (около 8), роль (около 4). Без слов и доску не выбираем: у психологов редкие
// (Арина: «такой формат не популярный»), доску еще и трудно снять.
const REELS_FOR_INTENT: Record<string, FormatCode[]> = {
  yumor: ['reels_rol', 'reels_scenka'],
  kak_v_terapii: ['reels_scenka', 'reels_otvet'],
  uznavanie: ['reels_spisok', 'reels_monolog'],
  dlya_blizkih: ['reels_spisok', 'reels_rol'],
  podderzhka: ['reels_poslanie', 'reels_malysh', 'reels_monolog'],
  razreshenie: ['reels_poslanie', 'reels_monolog'],
  mehanizm: ['reels_monolog', 'reels_malysh', 'reels_scenka'],
  obyasnenie: ['reels_otvet', 'reels_malysh', 'reels_monolog'],
  perevod_repliki: ['reels_otvet', 'reels_monolog'],
  mif: ['reels_monolog', 'reels_rol'],
  svoya_istoriya: ['reels_istoriya'],
  priglashenie: ['reels_spisok', 'reels_otvet'],
  poziciya: ['reels_monolog'],
  malenkiy_shag: ['reels_otvet', 'reels_monolog'],
}
export function chooseReelsFormat(ctx: GenContext, intent: string): FormatCode {
  const list = REELS_FOR_INTENT[intent] || ['reels_monolog']
  const recent = (ctx.memory.lastFormats || []).slice(0, 2)
  return list.find(f => !recent.includes(f)) || list[0] || pickReelsFormat(null, intent)
}

// Скелет (устройство текста с живого ролика) для постов, Telegram и каруселей.
// Подходящие по смыслу, по кругу от материала к материалу. В Reels не идет: семь шагов раздували ролик до поста.
const SKELETON_FORMATS: FormatCode[] = ['post', 'post_tg', 'carousel']

// Длина речи рилса: медиана живых роликов того же вида плюс 15%, до десятков (монолог около 120 слов).
const countWords = (s: string) => (s.match(/[\p{L}\d]+/gu) || []).length
export function reelsMaxWords(format: FormatCode): number {
  const lens = LIVE_EXAMPLES.filter(e => e.format === format).map(e => countWords(e.text)).sort((a, b) => a - b)
  if (!lens.length) return 110
  return Math.round((lens[Math.floor(lens.length / 2)] * 1.15) / 10) * 10
}
export function chooseSkeleton(ctx: GenContext, intent: string, format: FormatCode): string {
  if (!SKELETON_FORMATS.includes(format)) return ''
  const all = Object.values(SKELETONS)
  const fit = all.filter(sk => (sk.split('\n')[1] || '').includes(intent))
  const pool = fit.length ? fit : all
  return pool[(ctx.memory.count || 0) % pool.length]
}

// Ножницы. Вырезаем фразы из списка модели, только если каждая стоит в тексте дословно и один раз,
// не первая фраза материала, не оставляет метку пустой, и всего вырезано не больше трети слов.
const NO_CUT: FormatCode[] = ['reels_scenka', 'reels_bez_slov']
const words = (s: string) => (s.match(/[\p{L}\d]+/gu) || []).length
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

export function applyCuts(text: string, cuts: string[], maxShare = 1 / 3): { text: string; cut: string[] } {
  const total = words(text)
  let lines = text.split('\n')
  // первая фраза: начало первой строки с содержанием, не считая надписи на экране и списка ролей
  const firstIdx = lines.findIndex(l => l.trim() && !/^\s*(Текст на экране|Персонажи)\s*:/iu.test(l))
  const done: string[] = []
  const touched = new Set<number>()
  let removed = 0
  for (const raw of cuts) {
    const q = norm(String(raw || '')).replace(LABEL_RE, '')
    if (words(q) < 2) continue
    const hits = lines.map((l, i) => ({ i, at: l.indexOf(q) })).filter(h => h.at >= 0)
    if (hits.length !== 1 || lines.join('\n').split(q).length !== 2) continue
    const { i, at } = hits[0]
    const line = lines[i]
    const label = (line.match(LABEL_RE) || [''])[0]
    if (i === firstIdx && at <= label.length) continue
    // только целые фразы: от начала строки или после конца предложения до знака конца предложения
    const before = line.slice(label.length, at)
    if (before.trim() && !/[.!?…][»"]?\s+$/u.test(before)) continue
    if (!/[.!?…][»"]?$/u.test(q) || /^\S/u.test(line.slice(at + q.length))) continue
    if (/^\s*(Текст на экране|Персонажи)\s*:/iu.test(line)) continue
    if (removed + words(q) > total * maxShare) continue
    const rest = (line.slice(0, at) + line.slice(at + q.length)).replace(/[ \t]{2,}/g, ' ').replace(/^(\s*)\s/, '$1')
    const body = rest.slice(label.length).trim()
    if (label && !body) continue
    lines[i] = body ? (label ? label + body : rest.trim()) : '\u0000'
    touched.add(i)
    removed += words(q)
    done.push(q)
  }
  // обрывок: от абзаца после вырезания осталась одна короткая фраза (меньше 4 слов), хвост вырезанного
  // предложения («Требовательной.», «Теплый.»). Отдельной строкой его не оставляем. Строки с метками не трогаем.
  for (const i of touched) {
    const l = lines[i]
    if (l !== '\u0000' && !LABEL_RE.test(l) && words(l) < 4) { removed += words(l); done.push(l.trim()); lines[i] = '\u0000' }
  }
  lines = lines.filter(l => l !== '\u0000')
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text: out, cut: done }
}

export async function cutText(ctx: GenContext, format: FormatCode, text: string): Promise<{ text: string; cut: string[] }> {
  if (String(process.env.GENERATION_CUT || '1').trim() === '0' || NO_CUT.includes(format)) return { text, cut: [] }
  try {
    const r = await callJson<{ cut?: string[] }>({
      system: PN_SYSTEM, user: fill(PN_USER, { format_code: format, text }),
      effort: 'low', verbosity: 'low', maxTokens: 3000, timeoutMs: CUT_TIMEOUT_MS,
      userId: ctx.userId, operation: 'generate_post_cut', writer: true,
    })
    return applyCuts(text, Array.isArray(r?.cut) ? r.cut : [])
  } catch {
    return { text, cut: [] }
  }
}

// h7: вырезать целые фразы, пока речь не станет не длиннее потолка
async function cutToLength(ctx: GenContext, text: string, maxWords: number): Promise<{ text: string; cut: string[] }> {
  const speech = text.split(/\n\s*Подпись\s*:/u)[0]
  const have = words(speech.replace(/^\s*Текст на экране\s*:.*$/gimu, ''))
  if (have <= maxWords) return { text, cut: [] }
  try {
    const r = await callJson<{ cut?: string[] }>({
      system: H7_CUT_SYSTEM,
      user: `<нужно_слов_в_речи>не больше ${maxWords} (сейчас ${have}, вырезать около ${have - maxWords})</нужно_слов_в_речи>\n<текст>\n${text}\n</текст>`,
      effort: 'low', verbosity: 'low', maxTokens: 4000, timeoutMs: CUT_TIMEOUT_MS,
      userId: ctx.userId, operation: 'generate_post_cut_h7', writer: true,
    })
    return applyCuts(text, Array.isArray(r?.cut) ? r.cut : [], 1 / 2)
  } catch {
    return { text, cut: [] }
  }
}

// zh5: ножницы ПН5 еще проверяют связность и грамматику; ошибку модель дает парой «было / стало», код меняет фразу,
// только если она стоит один раз и почти той же длины. Сценки, роли и ролики без слов не режутся, но исправляются.
async function cutText5(ctx: GenContext, format: FormatCode, text: string): Promise<{ text: string; cut: string[] }> {
  if (String(process.env.GENERATION_CUT || '1').trim() === '0') return { text, cut: [] }
  try {
    const r = await callJson<{ cut?: string[]; fix?: { was?: string; now?: string }[] }>({
      system: PN5_SYSTEM, user: fill(PN5_USER, { format_code: format, text }),
      effort: 'low', verbosity: 'low', maxTokens: 3000, timeoutMs: CUT_TIMEOUT_MS,
      userId: ctx.userId, operation: 'generate_post_cut', writer: true,
    })
    const f = applyFixes(text, Array.isArray(r?.fix) ? r.fix : [])
    const c = [...NO_CUT, 'reels_rol'].includes(format) ? { text: f.text, cut: [] as string[] } : applyCuts(f.text, Array.isArray(r?.cut) ? r.cut : [])
    return { text: c.text, cut: [...c.cut, ...f.fixed.map(x => `исправлено: ${x}`)] }
  } catch {
    return { text, cut: [] }
  }
}

// h7m: мягкий монтажер (раздел «ПМ»), режет только целые абзацы речи; что нельзя резать, проверяет код (applySoftCut)
async function softCut(ctx: GenContext, text: string, maxWords: number): Promise<{ text: string; cut: string[] }> {
  const { user, words: have } = numberedSpeech(text)
  if (have <= maxWords) return { text, cut: [] }
  try {
    const r = await callJson<{ cut?: number[] }>({
      system: PM_SYSTEM,
      user: `<нужно_слов_в_речи>не больше ${maxWords} (сейчас ${have}, убрать около ${have - maxWords})</нужно_слов_в_речи>\n<абзацы>\n${user}\n</абзацы>`,
      effort: 'low', verbosity: 'low', maxTokens: 2000, timeoutMs: CUT_TIMEOUT_MS,
      userId: ctx.userId, operation: 'generate_post_cut_h7m', writer: true,
    })
    const c = applySoftCut(text, Array.isArray(r?.cut) ? r.cut : [], maxWords)
    return { text: c.text, cut: c.cut }
  } catch {
    return { text, cut: [] }
  }
}

// Конец описания под рилсом и каруселью: кто автор и один мягкий призыв, по кругу.
// Рилс и карусель живут в Instagram, а там на консультацию не зовем (запрет рекламы в РФ, 04.10):
// приглашение записаться только в Telegram (смысл priglashenie в post_tg).
export function captionTail(ctx: GenContext, format: FormatCode): string {
  if (!isReels(format) && format !== 'carousel') return ''
  const s = ctx.settings
  const ctas = [
    'предложи сохранить или отправить тому, кому это нужно',
    'предложи подписаться, если хочется еще такого, и одной фразой скажи, о чем твой блог',
    'предложи написать в комментариях одно слово или свой пункт',
  ]
  const who = [s.name ? `тебя зовут ${s.name}` : '', 'ты психолог', s.niche ? `работаешь с темой «${s.niche}» (скажи своими словами, коротко, как говоришь вслух)` : ''].filter(Boolean).join(', ')
  return `Закончи описание (текст после «Подпись:») двумя короткими строками от себя. Первая: кто ты, просто и по-человечески: ${who}. Вторая: один мягкий призыв: ${ctas[(ctx.memory.count || 0) % ctas.length]}.`
}

const WRITER_TIMEOUT_MS = Number(process.env.GENERATION_WRITER_TIMEOUT_MS) || Number(process.env.GENERATION_TIMEOUT_MS) || 100000
const CUT_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS) || 30000

export async function simpleWrite(ctx: GenContext, req: GenRequest): Promise<{ text: string; format: FormatCode; intent: string; draft: string; cut: string[]; zh4?: Zh5Choice }> {
  const s = ctx.settings
  const intent = chooseIntent(ctx, req)
  const format: FormatCode = req.format === 'reels_auto' ? chooseReelsFormat(ctx, intent) : req.format
  const opts = { allowMat: s.profanityRule !== 'не использовать', rotation: ctx.memory.count, count: 3 }
  const hyps = activeHyps()
  const zh = isZh(hyps)
  // zh5 главнее zh4 и zh3; zf это «семья ПЖ4»: начало, конец и подпись выбирает код
  const zh5 = hyps.has('zh5')
  const zh4 = hyps.has('zh4') && !zh5
  const zf = zh4 || zh5
  const zh3 = hyps.has('zh3') && !zf
  const examples = isReels(format)
    ? pickExamples(format, intent, opts)
    : pickExamples(format === 'carousel' ? 'reels_spisok' : 'reels_monolog', intent, { ...opts, count: 2 })
  // h2: вместо банка примеров по формату живые тексты целиком, подобранные по голосу автора
  // hot и calm по явному выбору «Эмоции», а не по тексту настроек: переформулировка не сломает подбор примеров
  const voiceOpts = { allowMat: opts.allowMat, hot: s.intensity === 'hot', calm: s.intensity === 'calm', rotation: ctx.memory.count || 0 }
  const liveExamples = zh ? liveExamplesText(pickLiveExamples(format, voiceOpts))
    : hyps.has('h2')
    ? voiceExamplesText(pickVoiceExamples(format, {
      allowMat: opts.allowMat, hot: s.intensity === 'hot', calm: s.intensity === 'calm', rotation: ctx.memory.count || 0,
    }))
    : examplesText(examples)
  // Материал автора: одна вещь на материал, по кругу (фразы клиентов, позиция, истории). Прогон 01.10: когда давали
  // все сразу, модель в каждый текст вставляла одну и ту же позицию и одну и ту же фразу клиентки.
  // Истории: для своей истории всегда (иначе модель оставляет заглушку [добавь: ...]), в остальных только
  // те, что совпадают с темой по словам (прогон 01.10: история про анализ попала в описание ролика про одиночество).
  const ownStory = intent === 'svoya_istoriya' || format === 'reels_istoriya'
  // zh4: ход, начало, конец, подпись, обложку выбирает код по памяти автора (lib/generation/zh4.ts)
  // zh4: у каждого автора свой сдвиг по кругу ходов (проба 21.10: двум авторам с пустой памятью и одним смыслом
  // выпал один ход, оба текста петлей-повтором)
  // zh5: петлю (ход «одна мысль повтором») код дает не чаще одного текста из 8 у автора, иначе этого хода в выборе нет
  const loop5 = zh5 ? chooseLoop(ctx.memory, s.name || '') : false
  const moves5 = zh5 ? Object.fromEntries(Object.entries(PZH5_MOVES).filter(([code]) => loop5 || code !== 'hod_povtor')) : {}
  const moveCard = zh ? chooseMove(zh5 ? moves5 : zh4 ? PZH4_MOVES : zh3 ? PZH3_MOVES : PZH_MOVES, format, intent, (ctx.memory.count || 0) + (zf ? seedOf(s.name || '') : 0)) : ''
  const z: Zh5Choice = {}
  if (zh5) {
    const who = s.name || ''
    z.start = chooseStart5(ctx.memory, format, moveCard, who)
    z.end = chooseEnd5(ctx.memory, format, intent, moveText(moveCard), who)
    if (isReels(format)) { Object.assign(z, chooseLen5(ctx.memory, format, who) || {}); z.prizyv = choosePrizyv(ctx.memory, format, who) }
    if (isReels(format) || format === 'carousel') { Object.assign(z, chooseCaption5(ctx.memory, intent, who, z.end)); z.replika = chooseReplika(ctx.memory) }
    if (format === 'carousel') Object.assign(z, chooseCarousel(ctx.memory, intent, who))
    z.detail = offerDetail5(ctx.memory, intent, req.topic, s, format)
    z.loop = loop5
    z.addr = chooseAddr(ctx.memory, s, who)
    if (allowsMat(s)) z.mat = chooseMat(ctx.memory, s)
  } else if (zh4) {
    const who = s.name || ''
    z.start = chooseStart(ctx.memory, format, moveCard, who)
    z.end = chooseEnd(ctx.memory, format, intent, moveText(moveCard), who)
    if (isReels(format) || format === 'carousel') Object.assign(z, chooseCaption(ctx.memory, intent, who))
    if (format === 'carousel') Object.assign(z, chooseCarousel(ctx.memory, intent, who))
    z.detail = offerDetail(ctx.memory, intent, s)
  }
  const zh4Detail = !!z.detail
  const topicWords = new Set(req.topic.toLowerCase().split(/[^\p{L}]+/u).filter(w => w.length > 3).map(w => w.slice(0, 5)))
  const matching = s.stories.filter(st => st.text.toLowerCase().split(/[^\p{L}]+/u).some(w => w.length > 3 && topicWords.has(w.slice(0, 5))))
  const stories = storiesText(ownStory ? relevantStories(s.stories, req.topic) : matching.slice(0, 2))
  // Фразы клиентов идут всегда: настоящая фраза, которую человек слышит или говорит, это самое сильное «это прям я»
  // (Арина 01.10: лучший пункт списка был фразой клиента из профиля). Позиция и истории по очереди, одна на материал.
  const extra = [
    s.position ? `Позиция автора: ${s.position}` : '',
    stories ? `Истории автора:\n${stories}` : '',
  ].filter(Boolean)
  // Свои фразы автора (фирменные обороты и «что повторяешь клиентам»), кроме тех, что были в последних материалах
  const used = new Set((ctx.memory.usedSignaturePhrases || []).map(x => x.toLowerCase()))
  const ownPhrases = s.signatures.filter(x => !used.has(x.toLowerCase())).slice(0, 4)
  // Для «как это на консультации» и приглашения: чего клиент боится, что пробовал и что меняется (профиль практики)
  const practice = ['kak_v_terapii', 'priglashenie'].includes(intent) ? s.practiceFacts : ''
  const material = ownStory && stories ? `Истории автора:\n${stories}`
    : [s.clientPhrases ? `Фразы клиентов (возьми одну, если подходит): ${s.clientPhrases}` : '',
       ownPhrases.length ? `Свои фразы автора (одну можно, если ложится сама): ${ownPhrases.map(x => `«${x}»`).join(', ')}` : '',
       practice,
       extra.length ? extra[(ctx.memory.count || 0) % extra.length] : '',
       // zh4: деталь предлагает код (offerDetail), в 1-2 текстах из 10 у автора
       zh4Detail ? (zh5 ? detailLine5(s) : detailLine(s)) : '',
       // zh3: смешное или странное с работы автора (вход «личная деталь»), только как материал, не в каждый текст
       zh3 && s.workDetail ? `Смешное или странное с работы автора (бери, только если само ложится в тему; в большинстве текстов не нужно): ${s.workDetail}` : ''].filter(Boolean).join('\n') || 'нет'
  // h6, h7: потолок речи по целым живым транскриптам того же вида
  const reelMax = hyps.has('h6') || hyps.has('h7') || zh ? liveReelsMaxWords(format) : reelsMaxWords(format)
  // zh4: рилс сразу своей длины; с h7m черновик в полтора раза длиннее и абзацами, потом мягкий монтажер
  const soft = zh4 && hyps.has('h7m') && softCutFormat(format)
  const zh4Reels = zh5 && isReels(format) ? fill(PZH5_REELS, { words: z.words || String(reelMax) })
    : zh4 && isReels(format)
    ? fill(PZH4_REELS, { max_words: soft ? Math.round(reelMax * 1.5 / 10) * 10 : reelMax }) +
      (soft ? ' Сейчас наговори длиннее, около этого потолка, и раздели речь на абзацы по одной мысли или сцене, пустой строкой между ними: потом лишние абзацы вырежут целиком, поэтому каждый абзац законченный.' : '')
    : ''
  const user = fill(PP_USER, {
    live_examples: liveExamples,
    samples: s.samples.slice(0, 2).map((x, i) => `<текст ${i + 1}>\n${x}\n</текст ${i + 1}>`).join('\n') || 'нет',
    // простой путь берет слепок коротко (voiceBrief, решение 04.10) и ее поправку о голосе всегда
    // в Instagram «как ко мне попасть» не даем: звать на консультацию там нельзя (запрет рекламы), только в Telegram
    base_settings: [(format === 'post_tg' ? s.baseSettings : s.baseSettings.replace(/^Как ко мне попасть:.*\n?/mu, ''))
      // zh5: мат отмечает код (примерно каждый третий текст автора с матом), общая строка про мат из настроек не идет
      .replace(zh5 && z.mat !== undefined ? /^Мат:.*\n?/mu : /$^/u, ''),
      // слепок коротко, до 5 строк; пока его нет, манера словами автора из экспресса
      s.voiceBrief ? `Как звучит автор по ее текстам:\n${s.voiceBrief}` : s.toneVerbal ? `Как автор сама описала свою манеру: ${s.toneVerbal}` : '',
      s.voiceCorrections ? `Автор сама сказала про свой голос: ${s.voiceCorrections}` : ''].filter(Boolean).join('\n'),
    profanity_rule: zh5 && z.mat !== undefined ? matRule5(z) : s.profanityRule,
    gender_forms: s.genderForms,
    address: s.address,
    material,
    // zh: схему задает ход, поэтому «Возможная схема» из карточки смысла убираем
    intent_card: zh ? INTENT_CARDS[intent].split('\n').filter(l => !/^Возможная схема/u.test(l)).join('\n') : INTENT_CARDS[intent],
    format_card: zh5 ? (PZH5_CARDS[format] || zh4FormatCard(format, FORMAT_CARDS[format])) : zh4 ? zh4FormatCard(format, FORMAT_CARDS[format]) : FORMAT_CARDS[format],
    topic: req.topic,
    user_detail: req.userDetail || '',
    // zh: вместо скелета ход живого психолога, во всех форматах, включая рилсы
    skeleton: zh ? [moveText(moveCard), zh5 ? startEndText5(z, s) : zh4 ? startEndText(z) : '', format === 'carousel' ? (zh5 ? carouselText5(z) : zh4 ? carouselText(z) : '') : ''].filter(Boolean).join('\n') : chooseSkeleton(ctx, intent, format),
    reels_rule: zh4Reels || (isReels(format) ? hypReelsRule(fill(PP_REELS, { max_words: reelMax }), hyps, reelMax) : ''),
    caption_tail: zh5 ? (z.caption ? captionText5(z, s) : '') : zh4 ? (z.caption ? captionText(z, s) : '') : captionTail(ctx, format),
    core_block: req.coreBlock,
    neighbors: req.neighbors,
    sample_block: req.sampleBlock,
    // обучение на правках и «Не похоже» доходит и в простой путь (8а, 04.10; раньше только в полную цепочку)
    edit_pairs: ctx.editPairs,
    feedback_reasons: (ctx.memory.feedbackReasons || []).slice(0, 4).join('; '),
  })
  const text = await callModel({
    system: zh5 ? PZH5_SYSTEM : zh4 ? PZH4_SYSTEM : zh3 ? PZH3_SYSTEM : hyps.has('zh') ? PZH_SYSTEM : hypSystem(PP_SYSTEM, format, hyps), user, effort: 'medium', verbosity: 'medium', maxTokens: 8000, ...hypCall(hyps),
    // таймаут писателя (21.10): длинная речь h7 с рассуждением medium шла дольше общих 55 с и падала (4 текста zh2 20.10).
    // Писателю 100 с, ножницам 30 с: вместе с ножницами запрос укладывается в proxy_read_timeout 120 с у nginx.
    timeoutMs: WRITER_TIMEOUT_MS,
    userId: ctx.userId, operation: 'generate_post_simple_path', writer: true, knownNames: s.knownNames,
  })
  // имя автора в строке «Я Ольга, психолог»: обезличивание иногда возвращает голую метку [ИМЯ] без номера
  const named = s.name ? text.replace(/(^|\n)(Я|Меня зовут)\s+\[ИМЯ(?:-\d+)?\]/giu, `$1$2 ${s.name}`) : text
  const draft = finalNet(named)
  // h7: наговорили длинно, монтажер вырезает целые фразы до потолка (до половины текста)
  // zh4: без h7 (h7 при zh4 не включается), с h7m мягкий монтажер по абзацам, иначе обычные ножницы
  const c = zh5 ? await cutText5(ctx, format, draft)
    : soft ? await softCut(ctx, draft, reelMax)
    : !zf && hyps.has('h7') && isReels(format) && format !== 'reels_bez_slov'
    ? await cutToLength(ctx, draft, reelMax)
    : await cutText(ctx, format, draft)
  return { text: finalNet(c.text), format, intent, draft, cut: c.cut, ...(zf ? { zh4: z } : {}) }
}
