// Обучение голосу без вопросов (08-GOLOS-I-OBUCHENIE.md).
// Модель не дообучаем: копим память голоса (события voice_events) и подставляем ее в промпты.
// Правила: сгенерированный текст без правок психолога в образцы не попадает; данные клиентов не берем;
// все тексты перед моделью проходят обезличивание (в callModel).

import type { SupabaseClient } from '@supabase/supabase-js'
import { callJson } from './ai'
import { buildVoiceCore } from './pipeline'
import { fill } from './prompts'
import { P0B_SYSTEM, P0B_USER } from './prompts.generated'

export const EVENT_KINDS = [
  'edit_pair', 'copied_clean', 'mine', 'not_like', 'button', 'hook_pick', 'rephrase',
  'repeat_phrases', 'speech', 'rewrite_input', 'pasted_post', 'tg_post', 'voice_feedback',
] as const
export type EventKind = typeof EVENT_KINDS[number]

// Из чего собирается слепок голоса (тексты самого психолога).
const SAMPLE_KINDS: EventKind[] = ['pasted_post', 'tg_post', 'rewrite_input', 'speech']

export type VoiceEvent = { kind: EventKind; postId?: string | null; before?: string | null; after?: string | null; data?: Record<string, unknown> | null }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

export async function recordEvent(db: SupabaseClient, userId: string, ev: VoiceEvent): Promise<boolean> {
  if (!EVENT_KINDS.includes(ev.kind)) return false
  const { error } = await db.from('voice_events').insert({
    user_id: userId,
    post_id: ev.postId || null,
    kind: ev.kind,
    before_text: ev.before ? clip(String(ev.before), 8000) : null,
    after_text: ev.after ? clip(String(ev.after), 8000) : null,
    data: ev.data || null,
  })
  if (error) console.warn('voice_events insert:', error.message)
  return !error
}

// ---------- сравнение текстов ----------

const norm = (t: string) => t.replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
const sentencesOf = (t: string) => t.split(/(?<=[.!?…])\s+|\n+/u).map(s => s.trim()).filter(Boolean)

// Доля изменений по фразам: сколько текста убрано и добавлено от общего объема.
export function changeRatio(before: string, after: string): number {
  const b = sentencesOf(before), a = sentencesOf(after)
  const bs = new Set(b.map(norm)), as = new Set(a.map(norm))
  const removed = b.filter(s => !as.has(norm(s))).join(' ').length
  const added = a.filter(s => !bs.has(norm(s))).join(' ').length
  const total = before.length + after.length
  return total ? +((removed + added) / total).toFixed(3) : 0
}

export function diffPieces(before: string, after: string): { removed: string[]; added: string[] } {
  const b = sentencesOf(before), a = sentencesOf(after)
  const bs = new Set(b.map(norm)), as = new Set(a.map(norm))
  return { removed: b.filter(s => !as.has(norm(s))), added: a.filter(s => !bs.has(norm(s))) }
}

// Психолог скопировала текст: без правок, только заполнила [добавь: ...], или правила по-настоящему.
export function classifyCopy(generated: string, copied: string): 'clean' | 'placeholders_only' | 'edit' {
  if (norm(generated) === norm(copied)) return 'clean'
  if (/\[добавь:[^\]]*\]/.test(generated)) {
    const parts = norm(generated).split(/\[добавь:[^\]]*\]/)
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp('^' + parts.map(esc).join('[\\s\\S]*?') + '$')
    if (re.test(norm(copied))) return 'placeholders_only'
  }
  return 'edit'
}

// ---------- память для промптов ----------

// Пары «было → стало» для блока «как автор правит»: сначала «скажи по-своему» (короткие и точные),
// потом заметные правки перед копированием. Только измененные фразы, не весь пост.
export function formatPairs(rows: { kind: string; before_text: string | null; after_text: string | null; data: any }[]): string {
  const out: string[] = []
  // «скажи по-своему» вперед (не больше двух): они короче и точнее
  const ordered = [...rows.filter(r => r.kind === 'rephrase').slice(0, 2), ...rows.filter(r => r.kind === 'edit_pair')]
  for (const r of ordered) {
    if (out.length >= 3) break
    const before = String(r.before_text || ''), after = String(r.after_text || '')
    if (!before || !after) continue
    if (r.kind === 'rephrase') {
      out.push(`Было: «${clip(before, 250)}»\nСтало: «${clip(after, 300)}»`)
      continue
    }
    if (r.kind === 'edit_pair' && Number(r.data?.change_ratio || 0) >= 0.1) {
      const d = diffPieces(before, after)
      if (!d.removed.length && !d.added.length) continue
      const was = d.removed.slice(0, 3).map(s => clip(s, 250)).join(' / ') || '(ничего не убрано)'
      const now = d.added.slice(0, 3).map(s => clip(s, 250)).join(' / ') || '(просто убрала)'
      out.push(`Было: «${was}»\nСтало: «${now}»`)
    }
  }
  return out.map((p, i) => `Правка ${i + 1}.\n${p}`).join('\n\n')
}

// Привычки по кнопкам «Поправить»: частая просьба становится подсказкой плану и тексту.
export function habitsNote(habits: any): string {
  if (!habits || typeof habits !== 'object') return ''
  const notes: string[] = []
  if ((habits['короче'] || 0) >= 3) notes.push('часто просит короче, пиши короче обычного')
  if ((habits['теплее'] || 0) >= 3) notes.push('часто просит теплее')
  if ((habits['живее'] || 0) >= 3) notes.push('часто просит живее, ближе к устной речи')
  if ((habits['без клише'] || 0) >= 3) notes.push('часто жалуется на штампы')
  return notes.join('; ')
}

export type Learning = { editPairs: string; habits: string }

export async function loadLearning(db: SupabaseClient, userId: string, profile: any): Promise<Learning> {
  const res = await db.from('voice_events')
    .select('kind, before_text, after_text, data')
    .eq('user_id', userId)
    .in('kind', ['edit_pair', 'rephrase'])
    .order('created_at', { ascending: false })
    .limit(20)
  const rows = res.error || !Array.isArray(res.data) ? [] : res.data
  return { editPairs: formatPairs(rows as any), habits: habitsNote(profile?.habits) }
}

// ---------- пересборка голоса ----------

type Source = { text: string; source: string }

export async function collectVoiceSources(db: SupabaseClient, userId: string, profile: any): Promise<Source[]> {
  const res = await db.from('voice_events')
    .select('kind, before_text, after_text, created_at')
    .eq('user_id', userId)
    .in('kind', ['pasted_post', 'tg_post', 'rewrite_input', 'speech', 'rephrase', 'edit_pair'])
    .order('created_at', { ascending: false })
    .limit(60)
  const rows: any[] = res.error || !Array.isArray(res.data) ? [] : res.data
  const texts = (kind: string) => rows.filter(r => r.kind === kind).map(r => String(r.after_text || '').trim()).filter(Boolean)

  const out: Source[] = []
  const push = (text: string, source: string) => { if (text.trim().length >= 60 && out.length < 8) out.push({ text: clip(text.trim(), 2500), source }) }

  texts('pasted_post').slice(0, 4).forEach(t => push(t, 'pasted'))
  texts('tg_post').slice(0, 4).forEach(t => push(t, 'telegram'))
  texts('rewrite_input').slice(0, 2).forEach(t => push(t, 'rewrite'))
  // Речь: длинные расшифровки по одной, короткие склеиваем в один образец устной речи
  const speech = texts('speech')
  speech.filter(t => t.length >= 250).slice(0, 2).forEach(t => push(t, 'speech'))
  const shortSpeech = speech.filter(t => t.length < 250).slice(0, 8).join('\n')
  if (shortSpeech) push(shortSpeech, 'speech')
  const rephrased = texts('rephrase').slice(0, 6).join('\n')
  if (rephrased) push(rephrased, 'rephrase')
  if (profile?.live_voice) push(String(profile.live_voice), 'live_voice')
  // Ее правленые посты: смесь ее и нашего, поэтому не больше одного и в самом конце
  texts('edit_pair').slice(0, 1).forEach(t => push(t, 'edited'))
  return out
}

export type RebuildResult = { summary: string; signatures: string[]; changeLine: string; fitCount: number; needMoreSamples: boolean }

export async function rebuildVoice(db: SupabaseClient, userId: string, profile: any): Promise<RebuildResult> {
  const sources = await collectVoiceSources(db, userId, profile)
  if (!sources.length) throw new Error('Пока нет твоих текстов, из которых можно услышать голос')
  const names = profile?.full_name ? [String(profile.full_name)] : []
  const core = await buildVoiceCore(userId, sources.map(s => s.text), names)

  // П0б: как я тебя слышу + пол, обращение, мат по образцам
  let brief: any = {}
  try {
    brief = await callJson({
      system: P0B_SYSTEM,
      user: fill(P0B_USER, { voice_core: core.voiceCore, prev_summary: profile?.voice_summary }),
      effort: 'low', verbosity: 'low', maxTokens: 2000, userId, operation: 'voice_core_brief', knownNames: names,
    })
  } catch (e: any) {
    console.warn('voice brief failed:', e?.message)
  }

  const repeat = await db.from('voice_events').select('after_text').eq('user_id', userId).eq('kind', 'repeat_phrases').order('created_at', { ascending: false }).limit(3)
  const repeated = (repeat.data || []).flatMap((r: any) => String(r.after_text || '').split(/[\n;]+/)).map((s: string) => s.replace(/[«»"]/g, '').trim()).filter((s: string) => s.split(/\s+/).length >= 2 && s.length <= 60)
  const signatures = Array.from(new Set([...repeated, ...core.signatures])).slice(0, 8)

  const samples = core.cleaned.map((text, i) => ({ text, source: sources[core.keptIndex[i]]?.source || 'pasted', fit: core.fit[i] }))
  const fitCount = samples.filter(s => s.fit !== false).length
  const update: Record<string, any> = {
    voice_core_prev: profile?.voice_core || null,
    voice_core: core.voiceCore,
    voice_core_updated_at: new Date().toISOString(),
    voice_samples: samples,
    signature_phrases: signatures,
    voice_summary: typeof brief.summary === 'string' ? brief.summary : profile?.voice_summary || null,
    voice_change_line: typeof brief.change_line === 'string' && brief.change_line.trim() ? brief.change_line.trim() : null,
  }
  // Настройки из образцов, только если психолог их не задала сама
  if (!profile?.author_gender && (brief.gender === 'female' || brief.gender === 'male')) update.author_gender = brief.gender
  if (!profile?.reader_address && (brief.address === 'ty' || brief.address === 'vy')) update.reader_address = brief.address
  if (!profile?.profanity && (brief.profanity === 'no' || brief.profanity === 'light')) update.profanity = brief.profanity

  const upd = await db.from('onboarding_profiles').update(update).eq('user_id', userId)
  if (upd.error) throw new Error('Не получилось сохранить голос: ' + upd.error.message)
  return {
    summary: update.voice_summary || '',
    signatures: Array.isArray(brief.signatures) && brief.signatures.length ? brief.signatures.slice(0, 4) : signatures.slice(0, 4),
    changeLine: update.voice_change_line || '',
    fitCount,
    needMoreSamples: fitCount < 2,
  }
}

// Пересобираем сами, когда накопилось: 3 новых текста психолога, или 5 правок, или 3 «скажи по-своему».
// Первый слепок: как только есть хоть один ее текст.
export async function maybeRebuildVoice(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await db.from('onboarding_profiles').select('*').eq('user_id', userId).single()
  if (!profile) return false
  const since = profile.voice_core_updated_at || '1970-01-01T00:00:00Z'
  const res = await db.from('voice_events').select('kind').eq('user_id', userId).gt('created_at', since).limit(200)
  const kinds: string[] = (res.data || []).map((r: any) => r.kind)
  const count = (k: string[]) => kinds.filter(x => k.includes(x)).length
  const samples = count(SAMPLE_KINDS)
  const need = profile.voice_core
    ? samples >= 3 || count(['edit_pair']) >= 5 || count(['rephrase']) >= 3
    : samples >= 1 || count(['rephrase']) >= 2
  if (!need) return false
  await rebuildVoice(db, userId, profile)
  return true
}
