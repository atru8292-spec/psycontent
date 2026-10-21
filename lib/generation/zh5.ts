// ПЖ5 (эксперимент 22.10, задача _знания/мозг-генератора/test/PROMPT-CLAUDE-CODE-zh5.md) поверх ПЖ4 (zh4.ts).
// Чтение zh4 и сверка с живыми из live-bank.json: повод «увидела в комментариях» в 21 из 69 (у живых 9 из 76),
// петля одним словом в начале абзацев в 17 из 69 (у живых 1 из 59), обращения в 20 из 69 (у живых 5 из 76),
// мат почти в каждом тексте Ольги и строкой-реакцией, реплика в кавычках в подписи в 25 из 69.
// Поэтому код отмечает по памяти автора: начало без повода примерно в половине текстов, петлю не чаще одного из 8,
// обращение только если оно есть в голосе автора и примерно в одном из 6-8, мат у автора с матом примерно в каждом
// третьем, реплику в подписи не чаще одной из пяти, рабочую деталь только в темах доверия и не чаще одного из 10.
// Карточки в 03-PROMPTY.md, раздел «Начала, концы и подписи для ПЖ5».

import { PZH5_PICKS } from './prompts.generated'
import { chooseCaption, chooseCarousel, goalOf, seedOf, startsOfMove, emptyZh4, type Zh4Memory, type Zh4Choice } from './zh4'
import type { Memory } from './memory'
import type { AuthorSettings } from './settings'
import type { FormatCode } from './text-guard'

export type Zh5Choice = Zh4Choice & { loop?: boolean; addr?: boolean; mat?: boolean; replika?: boolean; rlen?: string; words?: string; prizyv?: boolean; karkas?: string; skeleton?: string }
// карточки ПЖ5 по умолчанию; zh5b передает свои (PZH5B_PICKS)
export type Picks = Record<string, string>
const card = (code: string, picks: Picks = PZH5_PICKS) => (picks[code] || '').split('\n').slice(1).join('\n').trim()
const mem = (m: Memory): Zh4Memory => ({ ...emptyZh4(), ...(m.zh4 || {}) })
const k0 = (m: Memory, who: string) => (m.count || 0) + seedOf(who)

// Вид первой фразы (0.13, zh3/08-ZHIVYE-NORMY.md): у живых чаще всего прямое утверждение или спор, обещание объяснить,
// заголовок списка, вопрос зрителю, представление, реплика героя; событие («мне сказали», «увидела») редко.
// Событие не чаще одного текста из четырех, «что видела вокруг» не чаще одного из восьми.
const EVENT = ['sovet', 'vopros', 'podruga', 'uvidela']
const NOT_EVENT = ['utverzhdenie', 'obeshanie', 'vopros_z', 'replika', 'predstavlenie']
const OWN_START: FormatCode[] = ['reels_scenka', 'reels_rol', 'reels_bez_slov']
function freshest(list: string[], recent: string[], gap: number, k: number): string | undefined {
  if (!list.length) return undefined
  const s = ((k % list.length) + list.length) % list.length
  const r = [...list.slice(s), ...list.slice(0, s)]
  return r.find(x => !recent.slice(0, gap).includes(x)) || r[0]
}

export function chooseStart5(m: Memory, format: FormatCode, moveCard: string, who: string): string | undefined {
  if (OWN_START.includes(format)) return undefined
  // у списка первая фраза это заголовок списка (число и о ком), у карусели обложка: повода нет
  if (format === 'reels_spisok' || format === 'carousel') return 'bez'
  if (format === 'reels_otvet') return 'vopros'
  const allowed = startsOfMove(moveCard)
  if (allowed && !allowed.length) return undefined
  const z = mem(m)
  const recent = z.starts.slice(0, 7)
  const events = EVENT.filter(x => (!allowed || allowed.includes(x)) && !(x === 'uvidela' && recent.includes('uvidela')))
  const calm = [...NOT_EVENT, ...(allowed && allowed.includes('rabota') ? ['rabota'] : [])]
  const eventOk = events.length && !recent.slice(0, 3).some(x => EVENT.includes(x)) && k0(m, who) % 2 === 0
  // ход без своих видов события (только bez или rabota) идет спокойными видами
  return freshest(eventOk ? events : calm, recent, 3, k0(m, who))
}

// Длина речи из живого разброса того же вида (таблица в zh3/08): коротко, средне, длинно, по кругу у автора
const LENS5: Record<string, [string, string, string]> = {
  reels_monolog: ['80-110', '130-170', '210-260'], reels_otvet: ['60-90', '100-140', '180-240'],
  reels_poslanie: ['80-110', '120-160', '190-240'], reels_malysh: ['80-110', '120-160', '180-220'],
  reels_istoriya: ['90-120', '140-180', '220-270'], reels_spisok: ['120-150', '160-200', '230-280'],
  reels_scenka: ['70-100', '110-140', '170-220'], reels_rol: ['140-170', '190-230', '240-270'],
}
const LEN_NAMES = ['korotko', 'sredne', 'dlinno']
export function chooseLen5(m: Memory, format: FormatCode, who: string): { rlen: string; words: string } | null {
  const r = LENS5[format]
  if (!r) return null
  const name = freshest(LEN_NAMES, mem(m).rlens || [], 2, k0(m, who))!
  return { rlen: name, words: r[LEN_NAMES.indexOf(name)] }
}

// Конец: как в zh4 по цели, но вопрос не чаще одного текста из восьми (у живых 5 из 55)
const ENDS5: Record<string, string[]> = { ohvat: ['obryv', 'scena', 'shutka', 'vopros'], doverie: ['samoironiya', 'mysl', 'obryv', 'scena'], zapis: ['priglashenie'] }
const OWN_END_MOVES = /^Ход: (СПОР В ДВА ГОЛОСА|ИГРАЮ ВРЕДНОГО|ТЕХНИКА В РАЗГОВОРЕ|ЗОВУ ПРЯМО)/mu
export function chooseEnd5(m: Memory, format: FormatCode, intent: string, moveText: string, who: string): string | undefined {
  if (format === 'carousel' || OWN_START.includes(format) || OWN_END_MOVES.test(moveText)) return undefined
  const list = ENDS5[goalOf(intent)]
  const z = mem(m)
  const pool = z.ends.slice(0, 7).includes('vopros') ? list.filter(x => x !== 'vopros') : list
  return freshest(pool.length ? pool : list, z.ends, 2, k0(m, who))
}
// Призыв голосом в последней фразе примерно в одном рилсе из семи (у живых 9 из 56), с тем, про что блог
export function choosePrizyv(m: Memory, format: FormatCode, who: string): boolean {
  if (OWN_START.includes(format)) return false
  return !(mem(m).prizyv || []).slice(0, 5).some(Boolean) && k0(m, who) % 2 === 0
}

// петля (абзацы с одного слова): не чаще одного текста из 8 у автора
export function chooseLoop(m: Memory, who: string): boolean {
  const z = mem(m)
  return !(z.loops || []).slice(0, 7).some(Boolean) && k0(m, who) % 8 === 0
}
// обращение только если оно есть в голосе автора (настройка обращения из профиля или его образцы)
const ADDR_RE = /(?<![а-яё])(?:девочки|девчонки|милая|милые|хорошая моя|мои хорошие|солнышк\S*|зайк\S*|дорогие)(?![а-яё])/iu
export const hasAddress = (s: AuthorSettings) => /девочк|милая|дорог/iu.test(s.address || '') || s.samples.some(x => ADDR_RE.test(x))
export function chooseAddr(m: Memory, s: AuthorSettings, who: string): boolean {
  if (!hasAddress(s)) return false
  const z = mem(m)
  return !(z.addr || []).slice(0, 5).some(Boolean) && k0(m, who) % 3 === 0
}
// мат у автора с матом примерно в каждом третьем тексте
export const allowsMat = (s: AuthorSettings) => s.profanityRule !== 'не использовать'
export function chooseMat(m: Memory, s: AuthorSettings): boolean {
  if (!allowsMat(s)) return false
  const z = mem(m)
  return !(z.mat || []).slice(0, 2).some(Boolean)
}
// реплика в кавычках в подписи не чаще одной из пяти
export function chooseReplika(m: Memory): boolean {
  return !(mem(m).replika || []).slice(0, 4).some(Boolean)
}
// подпись: как в zh4, но после вопроса в конце материала подпись без вопроса; короткие чаще
export function chooseCaption5(m: Memory, intent: string, who: string, end?: string): { caption: string; len: string; vizitka: boolean } {
  const c = chooseCaption(m, intent, who)
  if (end === 'vopros' && c.caption === 'vopros') c.caption = 'dobavit'
  const LENS: Record<string, string[]> = { dobavit: ['korotko', 'razvernuto', 'korotko', 'sredne'], vopros: ['korotko', 'korotko', 'sredne'], podpiska: ['korotko', 'sredne'], zapis: ['sredne'] }
  const lens = LENS[c.caption]
  c.len = lens[mem(m).captions.filter(x => x === c.caption).length % lens.length]
  c.vizitka = c.caption === 'zapis'
  return c
}
export { chooseCarousel }

// рабочая деталь: только темы доверия (как проходит сессия, зачем психолог, страх идти) и не чаще одного из 10
const TRUST_TOPIC = /психолог|терапи|сесси|консультац|первая встреча|первую встречу/iu
export function offerDetail5(m: Memory, intent: string, topic: string, s: AuthorSettings, format: FormatCode): boolean {
  if (!s.workDetail || format === 'carousel') return false
  if (intent !== 'kak_v_terapii' && !TRUST_TOPIC.test(topic)) return false
  return !mem(m).detail.slice(0, 9).some(Boolean)
}
export const detailLine5 = (s: AuthorSettings) =>
  `Смешное или странное с работы автора: ${s.workDetail}\nВозьми эту подробность, только если она прямо про тему текста; если нет, не бери.`

// блоки для промпта
export function startEndText5(c: Zh5Choice, s?: AuthorSettings, picks: Picks = PZH5_PICKS): string {
  return [c.start ? card(`nachalo_${c.start}`, picks) : '', c.end ? card(`konec_${c.end}`, picks) : '',
    c.prizyv ? card('prizyv_da', picks) + (s?.blogAbout ? ` ${picks === PZH5_PICKS ? 'Про что блог' : 'О чем блог по сути (перескажи своими словами)'}: ${s.blogAbout}.` : '') : '',
    card(c.loop ? 'petlya_da' : 'petlya_net', picks), card(c.addr ? 'obr_da' : 'obr_net', picks)].filter(Boolean).join('\n')
}
export function carouselText5(c: Zh5Choice, picks: Picks = PZH5_PICKS): string {
  return [card(`oblozhka_${c.cover}`, picks), c.podzag ? 'Под обложкой короткий подзаголовок своими словами.' : 'Подзаголовка под обложкой нет, одна строка.',
    card(`kar_konec_${c.karEnd}`, picks), card(c.karShag ? 'kar_shag_da' : 'kar_shag_net', picks), card(c.addr ? 'obr_da' : 'obr_net', picks)].filter(Boolean).join('\n')
}
export function captionText5(c: Zh5Choice, s: AuthorSettings, picks: Picks = PZH5_PICKS): string {
  const facts = [s.name ? `имя: ${s.name}` : '', s.approach ? `метод: ${s.approach}` : '', s.niche ? `с кем работает: ${s.niche}` : '',
    s.blogAbout ? `про что блог: ${s.blogAbout}` : '', c.caption === 'zapis' && s.booking ? `как попасть: ${s.booking}` : ''].filter(Boolean).join('; ')
  return [card(`podpis_${c.caption}`, picks), card(`dlina_${c.len}`, picks),
    c.vizitka ? card('vizitka', picks) : 'О себе в этой подписи не рассказывай.',
    card(c.replika ? 'replika_da' : 'replika_net', picks),
    c.end === 'vopros' ? card('bez_voprosa', picks) : '',
    (c.caption === 'podpiska' || c.vizitka) && facts ? `Данные автора: ${facts}.` : ''].filter(Boolean).join('\n')
}
export const matRule5 = (c: Zh5Choice, picks: Picks = PZH5_PICKS) => card(c.mat ? 'mat_da' : 'mat_net', picks).replace(/\.$/u, '')

// исправления ножниц ПН5: фраза стоит в тексте один раз, новая почти той же длины (до двух слов разницы)
const W = (s: string) => (s.match(/[\p{L}\d]+/gu) || []).length
export function applyFixes(text: string, fixes: { was?: string; now?: string }[]): { text: string; fixed: string[] } {
  let out = text
  const fixed: string[] = []
  for (const f of fixes || []) {
    const was = String(f?.was || '').trim(), now = String(f?.now || '').trim()
    if (!was || !now || was === now || W(was) < 2) continue
    if (out.split(was).length !== 2) continue
    if (Math.abs(W(was) - W(now)) > 2) continue
    if (/^\s*(?:Подпись|Речь|Текст на экране|Слайд\s*\d+)\s*:/iu.test(now)) continue
    out = out.replace(was, now)
    fixed.push(`${was} → ${now}`)
  }
  return { text: out, fixed }
}
