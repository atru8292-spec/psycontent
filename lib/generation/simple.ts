// Простой путь (03-PROMPTY.md раздел «ПП»): один вызов без плана, проверок и правок,
// потом «Ножницы» (раздел «ПН»): модель только называет лишние фразы, вырезает их код.
// С 01.10 это путь генерации по умолчанию (выиграл слепое сравнение 4:2), GENERATION_MODE=full вернет старую цепочку.

import { PP_SYSTEM, PP_USER, PP_REELS, PN_SYSTEM, PN_USER, SKELETONS, PZH_SYSTEM, PZH_MOVES } from './prompts.generated'
import { fill, INTENT_CARDS, FORMAT_CARDS } from './prompts'
import { callModel, callJson } from './ai'
import { finalNet, isReels, LABEL_RE, type FormatCode } from './text-guard'
import { pickExamples, examplesText, LIVE_EXAMPLES } from './examples'
import { relevantStories, storiesText } from './settings'
import { pickReelsFormat, type GenContext, type GenRequest } from './pipeline'
import { activeHyps, hypSystem, hypCall, pickVoiceExamples, voiceExamplesText, liveReelsMaxWords, hypReelsRule, H7_CUT_SYSTEM, pickLiveExamples, liveExamplesText, chooseMove, moveText } from './hypotheses'

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
      effort: 'low', verbosity: 'low', maxTokens: 3000,
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
      effort: 'low', verbosity: 'low', maxTokens: 4000,
      userId: ctx.userId, operation: 'generate_post_cut_h7', writer: true,
    })
    return applyCuts(text, Array.isArray(r?.cut) ? r.cut : [], 1 / 2)
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

export async function simpleWrite(ctx: GenContext, req: GenRequest): Promise<{ text: string; format: FormatCode; intent: string; draft: string; cut: string[] }> {
  const s = ctx.settings
  const intent = chooseIntent(ctx, req)
  const format: FormatCode = req.format === 'reels_auto' ? chooseReelsFormat(ctx, intent) : req.format
  const opts = { allowMat: s.profanityRule !== 'не использовать', rotation: ctx.memory.count, count: 3 }
  const hyps = activeHyps()
  const examples = isReels(format)
    ? pickExamples(format, intent, opts)
    : pickExamples(format === 'carousel' ? 'reels_spisok' : 'reels_monolog', intent, { ...opts, count: 2 })
  // h2: вместо банка примеров по формату живые тексты целиком, подобранные по голосу автора
  // hot и calm по явному выбору «Эмоции», а не по тексту настроек: переформулировка не сломает подбор примеров
  const voiceOpts = { allowMat: opts.allowMat, hot: s.intensity === 'hot', calm: s.intensity === 'calm', rotation: ctx.memory.count || 0 }
  const liveExamples = hyps.has('zh') ? liveExamplesText(pickLiveExamples(format, voiceOpts))
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
       extra.length ? extra[(ctx.memory.count || 0) % extra.length] : ''].filter(Boolean).join('\n') || 'нет'
  // h6, h7: потолок речи по целым живым транскриптам того же вида
  const reelMax = hyps.has('h6') || hyps.has('h7') || hyps.has('zh') ? liveReelsMaxWords(format) : reelsMaxWords(format)
  const user = fill(PP_USER, {
    live_examples: liveExamples,
    samples: s.samples.slice(0, 2).map((x, i) => `<текст ${i + 1}>\n${x}\n</текст ${i + 1}>`).join('\n') || 'нет',
    // простой путь слепок не берет (короткий промпт выиграл сравнение), но ее поправку о голосе берет всегда (8а, 04.10)
    // в Instagram «как ко мне попасть» не даем: звать на консультацию там нельзя (запрет рекламы), только в Telegram
    base_settings: [format === 'post_tg' ? s.baseSettings : s.baseSettings.replace(/^Как ко мне попасть:.*\n?/mu, ''),
      s.toneVerbal ? `Как автор сама описала свою манеру: ${s.toneVerbal}` : '',
      s.voiceCorrections ? `Автор сама сказала про свой голос: ${s.voiceCorrections}` : ''].filter(Boolean).join('\n'),
    profanity_rule: s.profanityRule,
    gender_forms: s.genderForms,
    address: s.address,
    material,
    // zh: схему задает ход, поэтому «Возможная схема» из карточки смысла убираем
    intent_card: hyps.has('zh') ? INTENT_CARDS[intent].split('\n').filter(l => !/^Возможная схема/u.test(l)).join('\n') : INTENT_CARDS[intent],
    format_card: FORMAT_CARDS[format],
    topic: req.topic,
    user_detail: req.userDetail || '',
    // zh: вместо скелета ход живого психолога, во всех форматах, включая рилсы
    skeleton: hyps.has('zh') ? moveText(chooseMove(PZH_MOVES, format, intent, ctx.memory.count || 0)) : chooseSkeleton(ctx, intent, format),
    reels_rule: isReels(format) ? hypReelsRule(fill(PP_REELS, { max_words: reelMax }), hyps, reelMax) : '',
    caption_tail: captionTail(ctx, format),
    core_block: req.coreBlock,
    neighbors: req.neighbors,
    // обучение на правках и «Не похоже» доходит и в простой путь (8а, 04.10; раньше только в полную цепочку)
    edit_pairs: ctx.editPairs,
    feedback_reasons: (ctx.memory.feedbackReasons || []).slice(0, 4).join('; '),
  })
  const text = await callModel({
    system: hyps.has('zh') ? PZH_SYSTEM : hypSystem(PP_SYSTEM, format, hyps), user, effort: 'medium', verbosity: 'medium', maxTokens: 8000, ...hypCall(hyps),
    userId: ctx.userId, operation: 'generate_post_simple_path', writer: true, knownNames: s.knownNames,
  })
  // имя автора в строке «Я Ольга, психолог»: обезличивание иногда возвращает голую метку [ИМЯ] без номера
  const named = s.name ? text.replace(/(^|\n)(Я|Меня зовут)\s+\[ИМЯ(?:-\d+)?\]/giu, `$1$2 ${s.name}`) : text
  const draft = finalNet(named)
  // h7: наговорили длинно, монтажер вырезает целые фразы до потолка (до половины текста)
  const c = hyps.has('h7') && isReels(format) && format !== 'reels_bez_slov'
    ? await cutToLength(ctx, draft, reelMax)
    : await cutText(ctx, format, draft)
  return { text: finalNet(c.text), format, intent, draft, cut: c.cut }
}
