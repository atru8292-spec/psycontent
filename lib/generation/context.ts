// Флаг новой цепочки и сборка контекста генерации (настройки автора + память ленты).

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAuthorSettings } from './settings'
import { loadMemory } from './memory'
import { loadLearning } from './learning'
import { INTENT_BUTTONS, INTENT_CODES } from './prompts'
import type { GenContext } from './pipeline'
import { ALL_FORMATS, type FormatCode } from './text-guard'

// NEW_GENERATION_PIPELINE: не задана или off — старая генерация у всех;
// on — новая только у тех, у кого в профиле new_pipeline = true; all — новая у всех.
export function isNewPipeline(profile: any): boolean {
  const mode = String(process.env.NEW_GENERATION_PIPELINE || '').trim().toLowerCase()
  if (mode === 'all') return true
  if (mode === 'on') return profile?.new_pipeline === true
  return false
}

// NEW_GENERATION_SYNC=1: проверка и правка в том же запросе (для тестов и замеров времени).
export function isSyncMode(): boolean {
  return String(process.env.NEW_GENERATION_SYNC || '') === '1'
}

export async function buildContext(db: SupabaseClient, userId: string, profile: any): Promise<GenContext> {
  const first = buildAuthorSettings(profile)
  const [memory, learning] = await Promise.all([
    loadMemory(db, userId, first.signatures),
    loadLearning(db, userId, profile).catch(() => ({ editPairs: '', habits: '' })),
  ])
  // привычки по кнопкам идут туда же, куда причины «Не похоже»: в план и текст
  if (learning.habits) memory.feedbackReasons = [learning.habits, ...memory.feedbackReasons]
  // сдвиг по числу материалов: образцы чередуются между генерациями
  const settings = buildAuthorSettings(profile, { rotation: memory.count })
  return { userId, settings, memory, editPairs: learning.editPairs }
}

export function toFormatCode(format: unknown): FormatCode {
  const f = String(format || 'post')
  if ((ALL_FORMATS as string[]).includes(f)) return f as FormatCode
  // «Подбери сама»: вид рилса выбирает план (pipeline.draft)
  if (f === 'reels' || f === 'reels_auto') return 'reels_auto'
  return 'post'
}

// Смысл из запроса: точный код (intent) или кнопка «Что дать читателю» (intentButton).
export function intentFromBody(body: any): { intent: string | null; intentChoices: string[] | null } {
  const intent = typeof body?.intent === 'string' && INTENT_CODES.includes(body.intent) ? body.intent : null
  const choices = typeof body?.intentButton === 'string' ? INTENT_BUTTONS[body.intentButton] || null : null
  return { intent, intentChoices: choices }
}
