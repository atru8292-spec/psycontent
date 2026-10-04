// «Сделать так же» (задача sdelat-i-brend, раздел 5). Чужой пост → абстрактное устройство (прием, шаги, почему
// цепляет) → писатель делает свое, оригинала не видя. Две изоляции:
//  1) разбор (раздел «ТЖ» в docs/prompts/03-PROMPTY.md) видит оригинал и отдает только устройство; код
//     выкидывает шаги, где 4 слова подряд совпали с оригиналом;
//  2) писатель получает только блок <как_устроен_образец>; готовый текст сверяется с оригиналом
//     (цепочка из 5 слов или больше 10% общих троек слов) и при совпадении переписывается.
// Оригинал живет только в памяти запроса: в базу идет sample_source с устройством, без чужого текста.

import { TZH_SYSTEM, TZH_USER } from './prompts.generated'
import { fill } from './prompts'
import { callJson } from './ai'
import { LABEL_RE } from './text-guard'
import type { GenContext } from './pipeline'

export type SampleInput = { kind: 'link'; url: string } | { kind: 'text'; text: string } | { kind: 'screens'; images: string[] }
export type SampleSkeleton = {
  // текст со скринов для проверки совпадений: живет только в памяти запроса, писателю и в базу не идет
  seenText?: string
  format: string
  priem: string
  steps: string[]
  why: string
  flags: { client_story: boolean; review: boolean; promise: boolean }
}
export type SampleError = 'instagram' | 'closed' | 'failed' | 'empty' | 'private'

const MAX_ORIGINAL = 6000

export const isTelegramUrl = (u: string) => /^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\//i.test(u.trim())
export const isInstagramUrl = (u: string) => /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(u.trim()) || /^(?:https?:\/\/)?instagr\.am\//i.test(u.trim())

// Подпись источника для «По мотивам: …»: только адрес канала, никакого текста
export function sourceLabel(input: SampleInput): string {
  if (input.kind === 'screens') return 'скрины'
  if (input.kind === 'text') return 'текст'
  const m = input.url.match(/t(?:elegram)?\.me\/(?:s\/)?([A-Za-z0-9_]{3,64})/i)
  return m ? `t.me/${m[1]}` : 'ссылка'
}

const decode = (s: string) => s
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&')
  .replace(/[ \t]+\n/g, '\n').trim()

// Публичный пост Telegram: текст с веб-страницы виджета t.me/канал/123?embed=1. Закрытый канал текста не отдает.
export async function fetchTelegramPost(url: string): Promise<{ text: string } | { error: SampleError }> {
  const m = url.match(/t(?:elegram)?\.me\/(?:s\/)?([A-Za-z0-9_]{3,64})\/(\d{1,9})/i)
  if (!m) return { error: 'failed' }
  try {
    const res = await fetch(`https://t.me/${m[1]}/${m[2]}?embed=1&mode=tme`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PsyCont)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { error: 'failed' }
    const html = await res.text()
    const block = html.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (!block) return { error: /tgme_widget_message_error|private|not found/i.test(html) ? 'closed' : 'failed' }
    const text = decode(block[1]).slice(0, MAX_ORIGINAL)
    return text.length < 40 ? { error: 'empty' } : { text }
  } catch {
    return { error: 'failed' }
  }
}

// ---------- совпадения ----------
const words = (s: string) => (s.toLowerCase().replace(/ё/g, 'е').match(/[\p{L}\d]+/gu) || [])
const SHORT = new Set(['и', 'в', 'не', 'на', 'с', 'что', 'это', 'я', 'ты', 'он', 'она', 'мы', 'вы', 'а', 'но', 'как', 'то', 'у', 'к', 'по', 'за', 'из', 'же', 'ли', 'бы', 'так', 'там', 'тут', 'все', 'всё', 'его', 'ее', 'её', 'их', 'мне', 'тебе', 'себя', 'когда', 'если', 'или', 'да', 'нет', 'вот', 'уже', 'еще', 'ещё', 'очень', 'просто'])
// цепочка значима, если в ней хотя бы два не служебных слова (устойчивые «и вот я не знаю что» не в счет)
const meaningful = (ws: string[]) => ws.filter(w => w.length > 3 && !SHORT.has(w)).length >= 2

function ngrams(ws: string[], n: number): string[] {
  const out: string[] = []
  for (let i = 0; i + n <= ws.length; i++) out.push(ws.slice(i, i + n).join(' '))
  return out
}

export function overlap(original: string, text: string): { chains: string[]; trigramShare: number; hit: boolean } {
  const ow = words(original), tw = words(text)
  const o5 = new Set(ngrams(ow, 5))
  const chains = ngrams(tw, 5).filter(g => o5.has(g) && meaningful(g.split(' ')))
  const o3 = new Set(ngrams(ow, 3).filter(g => meaningful(g.split(' ')) || g.split(' ').some(w => w.length > 5)))
  const t3 = ngrams(tw, 3)
  const shared = t3.filter(g => o3.has(g)).length
  const trigramShare = t3.length ? shared / t3.length : 0
  return { chains: [...new Set(chains)], trigramShare, hit: chains.length > 0 || trigramShare > 0.1 }
}

// Предложения текста, в которых стоит общая с оригиналом цепочка: их и переписываем
export function sentencesWithChains(text: string, chains: string[]): string[] {
  if (!chains.length) return []
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(LABEL_RE, '').trim()
    for (const sent of line.split(/(?<=[.!?…])\s+/u)) {
      const w = words(sent).join(' ')
      if (chains.some(c => w.includes(c))) out.push(sent.trim())
    }
  }
  return [...new Set(out)].filter(Boolean)
}

// Совпадение только по тройкам слов (без цепочки из 5): переписываем 2-3 предложения с наибольшим числом общих троек
export function sentencesWithTrigrams(text: string, original: string): string[] {
  const o3 = new Set(ngrams(words(original), 3).filter(g => meaningful(g.split(' ')) || g.split(' ').some(w => w.length > 5)))
  const scored: { s: string; n: number }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(LABEL_RE, '').trim()
    for (const sent of line.split(/(?<=[.!?…])\s+/u)) {
      const n = ngrams(words(sent), 3).filter(g => o3.has(g)).length
      if (n >= 2) scored.push({ s: sent.trim(), n })
    }
  }
  return [...new Set(scored.sort((a, b) => b.n - a.n).map(x => x.s))].slice(0, 3)
}

// ---------- разбор ----------
const str = (v: unknown, n = 240) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').replace(/ё/g, 'е').trim().slice(0, n) : '')

export async function parseSample(ctx: GenContext, input: { kind: SampleInput['kind']; original: string; images?: string[] }): Promise<SampleSkeleton | { error: SampleError }> {
  const raw = await callJson<any>({
    system: TZH_SYSTEM,
    user: fill(TZH_USER, {
      source_kind: input.kind === 'screens' ? 'скрины поста (картинки ниже)' : input.kind === 'link' ? 'публичный пост Telegram' : 'текст поста',
      original: input.original ? `<пост>\n${input.original.slice(0, MAX_ORIGINAL)}\n</пост>` : '',
    }),
    images: input.images,
    effort: 'low', verbosity: 'low', maxTokens: 2000, timeoutMs: input.images?.length ? 90000 : 55000,
    userId: ctx.userId, operation: input.images?.length ? 'sample_parse_vision' : 'sample_parse',
  })
  // переписка, личные сообщения, медкарта: не публичный пост, данные клиентов не трогаем (152-ФЗ)
  if (raw?.private === true) return { error: 'private' }
  if (raw?.empty === true) return { error: 'empty' }
  const sk: SampleSkeleton = {
    seenText: input.images?.length ? str(raw?.seen_text, 6000) : undefined,
    format: str(raw?.format, 20) || 'other',
    priem: str(raw?.priem),
    steps: Array.isArray(raw?.steps) ? raw.steps.map((x: unknown) => str(x, 160)).filter(Boolean).slice(0, 6) : [],
    why: str(raw?.why),
    flags: {
      client_story: raw?.flags?.client_story === true,
      review: raw?.flags?.review === true,
      promise: raw?.flags?.promise === true,
    },
  }
  // вторая страховка изоляции: шаг, где 4 слова подряд из оригинала, писателю не отдаем
  const orig = input.original || sk.seenText || ''
  if (orig) {
    const o4 = new Set(ngrams(words(orig), 4))
    const clean = (s: string) => (ngrams(words(s), 4).some(g => o4.has(g) && meaningful(g.split(' '))) ? '' : s)
    sk.priem = clean(sk.priem)
    sk.why = clean(sk.why)
    sk.steps = sk.steps.map(clean).filter(Boolean)
  }
  if (!sk.priem && sk.steps.length < 2) return { error: 'empty' }
  return sk
}

// Блок для писателя (<как_устроен_образец>): только устройство, плюс этические пометки
export function sampleBlock(sk: SampleSkeleton): string {
  const lines = [
    sk.priem ? `Прием: ${sk.priem}` : '',
    sk.steps.length ? `Порядок:\n${sk.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
    sk.why ? `Почему цепляет: ${sk.why}` : '',
    sk.flags.client_story ? 'В образце была история клиента: возьми форму, но без клиента (своя сцена из жизни читателя или обобщенно).' : '',
    sk.flags.review ? 'В образце был отзыв: отзывы не пишем.' : '',
    sk.flags.promise ? 'В образце было обещание результата: результат не обещаем.' : '',
  ].filter(Boolean)
  return '\n' + lines.join('\n') + '\n'
}
