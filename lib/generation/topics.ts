// План тем (21.10, раздел «ТП» в 03-PROMPTY.md, _знания/мозг-генератора/zh3/07-TEMY-ANALIZ.md раздел 4).
// Тема это ситуация плюс угол. Угол на каждом месте плана и можно ли там затертую группу, задает код заранее:
// угол не повторяется раньше чем через пять тем (семь углов идут по кругу, у каждого автора свой порядок),
// затертая группа (мама и детство, нарциссы и типы, тревога и депрессия) не чаще одной темы из четырех.
// Модель заполняет места. Проверка готового плана: checkPlan. В продукт (контент-план кабинета) пока не подключено.

import { TP_SYSTEM, TP_USER, TP5_SYSTEM, TP5_USER } from './prompts.generated'
import { fill } from './prompts'

export const ANGLES = ['povedenie', 'fraza', 'rol', 'iznutri', 'spor', 'dva_sluchaya', 'ironiya'] as const
export const ANGLE_NAMES: Record<string, string> = {
  povedenie: 'обычный поступок', fraza: 'слова, которые слышал каждый', rol: 'роль или вредный совет всерьез',
  iznutri: 'как видно из кабинета', spor: 'несогласие с ходовым советом', dva_sluchaya: 'два случая вместо «всегда»', ironiya: 'ирония над собой или психологией',
}
export const WORN = ['mama', 'narciss', 'trevoga']
export type PlanTopic = { n: number; situation: string; angle: string; group: string; title: string }
export type TopicMemory = { angles: string[]; groups: string[]; topics: string[] }

const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

// места плана: угол и разрешена ли затертая группа. Порядок углов свой у автора, продолжает память (последний угол
// прошлого плана не повторится в первых пяти местах).
export function planSlots(n: number, who: string, mem: TopicMemory = { angles: [], groups: [], topics: [] }): { n: number; angle: string; worn: boolean }[] {
  const seed = seedOf(who)
  const order = [...ANGLES].sort((a, b) => ((seedOf(a + seed) % 97) - (seedOf(b + seed) % 97)))
  const recent = mem.angles.slice(0, 5)
  // начинаем с угла, которого не было в последних пяти
  let start = order.findIndex(a => !recent.includes(a))
  if (start < 0) start = 0
  // сколько тем назад была затертая группа: место для нее не раньше, чем через три темы
  const lastWorn = mem.groups.findIndex(g => WORN.includes(g))
  const offset = lastWorn < 0 ? seed % 4 : Math.max(0, 3 - lastWorn)
  return Array.from({ length: n }, (_, i) => ({ n: i + 1, angle: order[(start + i) % order.length], worn: (i - offset) >= 0 && (i - offset) % 4 === 0 }))
}

export function authorBlock(p: any): string {
  return [
    `Ниша: ${p.one_niche || ''}`, p.audience ? `Аудитория: ${p.audience}` : '',
    p.approaches ? `Подход: ${[].concat(p.approaches).join(', ')}` : '',
    p.blog_about ? `Про что блог: ${p.blog_about}` : '',
    p.client_pain_phrases ? `Фразы клиентов: ${p.client_pain_phrases}` : '',
    p.position_text ? `Позиция и что злит в профессии: ${p.position_text}` : '',
    p.author_gender === 'male' ? 'Автор мужчина.' : 'Автор женщина.',
  ].filter(Boolean).join('\n')
}

export function planPrompt(p: any, who: string, n: number, mem?: TopicMemory, v = 4): { system: string; user: string; slots: ReturnType<typeof planSlots> } {
  const slots = planSlots(n, who, mem)
  const user = fill(v === 5 ? TP5_USER : TP_USER, {
    author: authorBlock(p),
    recent: (mem?.topics || []).slice(0, 20).join('; '),
    slots: slots.map(s => `${s.n}. угол ${s.angle} (${ANGLE_NAMES[s.angle]}); ${s.worn ? 'можно из заезженного круга, только с неожиданной стороны' : 'не из заезженных кругов'}`).join('\n'),
    n: String(n),
  })
  return { system: v === 5 ? TP5_SYSTEM : TP_SYSTEM, user, slots }
}

// ---------- проверка плана ----------
const stems = (s: string) => new Set((s.toLowerCase().match(/[\p{L}]{4,}/gu) || []).map(w => w.slice(0, 5)).filter(w => !STOP.has(w)))
const STOP = new Set(['котор', 'когда', 'потом', 'после', 'перед', 'чтобы', 'этого', 'своих', 'свою', 'своей', 'своим', 'вашей', 'очень', 'всегда', 'снова', 'тебя', 'себя', 'него', 'нему', 'потом', 'почем', 'вместо'])
export const similar = (a: string, b: string) => {
  const x = stems(a), y = stems(b)
  const inter = [...x].filter(w => y.has(w)).length
  return inter / (Math.min(x.size, y.size) || 1)
}
export function checkPlan(topics: PlanTopic[], slots?: ReturnType<typeof planSlots>) {
  const worn = topics.filter(t => WORN.includes(t.group))
  // затертых не больше одной из четырех подряд: окно в 4 темы
  let windowBreaks = 0
  for (let i = 0; i + 4 <= topics.length; i++) if (topics.slice(i, i + 4).filter(t => WORN.includes(t.group)).length > 1) windowBreaks++
  // повтор угла раньше чем через пять тем
  let angleRepeats = 0
  topics.forEach((t, i) => { if (topics.slice(Math.max(0, i - 5), i).some(x => x.angle === t.angle)) angleRepeats++ })
  const offSlot = slots ? topics.filter(t => { const s = slots.find(x => x.n === t.n); return s && (s.angle !== t.angle || (!s.worn && WORN.includes(t.group))) }).length : 0
  const dups: string[] = []
  for (let i = 0; i < topics.length; i++) for (let j = i + 1; j < topics.length; j++)
    if (similar(topics[i].situation + ' ' + topics[i].title, topics[j].situation + ' ' + topics[j].title) >= 0.5) dups.push(`${topics[i].n}/${topics[j].n}`)
  return {
    n: topics.length, worn: worn.length, wornShare: Math.round((worn.length / (topics.length || 1)) * 100),
    windowBreaks, angles: new Set(topics.map(t => t.angle)).size, angleRepeats, offSlot, dups,
    groups: [...new Set(topics.map(t => t.group))].length,
  }
}
// общие темы у разных авторов: одинаковые ситуации по словам (грубо, глазами проверить)
export function crossCommon(plans: Record<string, PlanTopic[]>): string[] {
  const who = Object.keys(plans)
  const out: string[] = []
  for (let a = 0; a < who.length; a++) for (let b = a + 1; b < who.length; b++)
    for (const x of plans[who[a]]) for (const y of plans[who[b]])
      if (similar(x.situation, y.situation) >= 0.5) out.push(`${who[a]}${x.n} «${x.title}» и ${who[b]}${y.n} «${y.title}»`)
  return out
}

// тире и «ё» из названий тем: тема уходит в промпт генерации как есть (проба 21.10: модель плана ставила оба)
export const cleanTopic = (t: string) => t.replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/\s+[—–]\s+/gu, ', ').replace(/[—–]/gu, '-').trim()

// zh5 (22.10): схема угла в названии («в кабинете» у угла изнутри, «Как X: делай Y» у роли) и популярный совет без спора.
// Тема, которая сама звучит как ходовой совет, проходит, только если в названии видно несогласие с ним.
export const angleScheme = (t: string) => /в кабинете/iu.test(t) || /^как [^:]{3,60}:/iu.test(t)
const POPULAR = /сначала полюби себя|боится близости|доверься интуиции|сосчитай до десяти|отпусти ситуацию|просто отпусти|займись собой|будь собой|просто поговори|работай над собой|живи здесь и сейчас|не принимай близко|думай позитивно|выйди из зоны комфорта|все к лучшему|прости и отпусти|не накручивай|просто перестань|главное любить себя|никто тебе ничего не должен|ты никому ничего не должна/iu
const DISPUTE = /почему|не работает|не помогает|плох|вредн|спор|против|а если|только хуже|сомнительн|бесит|зачем|не обязательно|неправ|миф|не так|чушь|ерунд|ловушк|не значит|не решает|не спасает|не лечит/iu
export const bareAdvice = (t: string) => POPULAR.test(t) && !DISPUTE.test(t)
export const topicOk = (t: PlanTopic) => !bareAdvice(t.title) && !angleScheme(t.title)
