// Память ленты: что было в последних 10 материалах психолога, чтобы план не повторялся.
// Новые поля generated_posts пишет только новая цепочка. Для старых записей берем то,
// что можно достать из текста: первую строку и тему.

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractOpening, findSignatures, ALL_FORMATS, type FormatCode } from './text-guard'

export type Memory = {
  count: number
  lastHookTypes: string[]
  lastArcs: string[]
  lastOpenings: string[]
  lastEndings: string[]
  lastRings: boolean[]
  lastIntents: string[]
  lastFormats: string[]            // коды форматов, чтобы виды рилсов чередовались
  usedClientPhrases: string[]
  usedDetails: string[]
  usedSignaturePhrases: string[]   // только последние 3 материала
  recentTopics: string[]
  feedbackReasons: string[]
}

const emptyMemory = (): Memory => ({
  count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [],
  lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [],
})

const FULL_COLS = 'topic, format, format_code, content, intent, hook_type, arc, ending_type, ring, opening, details, client_phrase_used, signatures_used, topic_for_text, feedback, created_at'
const BASE_COLS = 'topic, format, content, created_at'

const toFormat = (row: any): FormatCode => {
  const f = row.format_code || row.format
  return ALL_FORMATS.includes(f) ? f : 'post'
}

export async function loadMemory(db: SupabaseClient, userId: string, signatures: string[]): Promise<Memory> {
  const query = (cols: string) =>
    db.from('generated_posts')
      .select(cols)
      .eq('user_id', userId)
      .not('format', 'eq', 'hooks')
      .not('format', 'like', 'rewrite%')
      .order('created_at', { ascending: false })
      .limit(10)

  let res: any = await query(FULL_COLS)
  if (res.error) res = await query(BASE_COLS) // миграция еще не применена
  if (res.error || !Array.isArray(res.data)) return emptyMemory()
  const rows: any[] = res.data

  const uniq = <T,>(a: T[]) => Array.from(new Set(a.filter(Boolean)))
  const openings = rows.map(r => {
    if (r.opening) return String(r.opening)
    let content = String(r.content || '')
    if (toFormat(r) === 'carousel' && content.trim().startsWith('[')) {
      try { content = JSON.parse(content).map((s: any) => s.text).join('\n') } catch { /* как есть */ }
    }
    return extractOpening(content, toFormat(r)).slice(0, 140)
  })

  const sigRecent = rows.slice(0, 3).flatMap(r =>
    Array.isArray(r.signatures_used) ? r.signatures_used : findSignatures(String(r.content || ''), signatures),
  )

  const feedback = rows.flatMap(r => (r.feedback && Array.isArray(r.feedback.reasons) ? r.feedback.reasons : []))

  return {
    count: rows.length,
    lastHookTypes: rows.map(r => r.hook_type).filter(Boolean),
    lastArcs: rows.map(r => r.arc).filter(Boolean),
    lastOpenings: openings.filter(Boolean),
    lastEndings: rows.map(r => r.ending_type).filter(Boolean),
    lastRings: rows.filter(r => typeof r.ring === 'boolean').map(r => r.ring),
    lastIntents: rows.map(r => r.intent).filter(Boolean),
    lastFormats: rows.map(r => toFormat(r)),
    usedClientPhrases: uniq(rows.map(r => r.client_phrase_used)),
    usedDetails: uniq(rows.flatMap(r => (Array.isArray(r.details) ? r.details : r.details ? [r.details] : []))).slice(0, 15),
    usedSignaturePhrases: uniq(sigRecent),
    recentTopics: uniq(rows.map(r => r.topic_for_text || r.topic)).slice(0, 10),
    feedbackReasons: uniq(feedback).slice(0, 8),
  }
}

const list = (a: (string | boolean)[]) => (a.length ? a.map(String).join('; ') : 'нет')

// Плейсхолдеры памяти для П1 и П2.
export function memoryVars(m: Memory) {
  return {
    last_hook_types: list(m.lastHookTypes),
    last_arcs: list(m.lastArcs),
    last_openings: m.lastOpenings.length ? m.lastOpenings.map(o => `«${o}»`).join('; ') : 'нет',
    last_endings: list(m.lastEndings),
    last_rings: m.lastRings.length ? m.lastRings.map(r => (r ? 'да' : 'нет')).join(', ') : 'нет данных',
    last_intents: list(m.lastIntents),
    last_formats: list(m.lastFormats),
    used_client_phrases: list(m.usedClientPhrases),
    used_details: list(m.usedDetails),
    used_signature_phrases: list(m.usedSignaturePhrases),
    recent_topics: list(m.recentTopics),
    feedback_reasons: m.feedbackReasons.length ? m.feedbackReasons.join('; ') : '',
  }
}
