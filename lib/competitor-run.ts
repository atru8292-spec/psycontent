// Разбор конкурента: шаги 2-4 только после оплаченного шага 1 этого же разбора (решение Арины 12.11).
// Шаг 1 заводит строку в competitor_runs (миграция 20261112110000), после успешного списания энергии
// ставит paid_at и отдает id в заголовке X-Analysis-Id. Шаги 2-4 приходят с analysisId, сервер проверяет:
// строка того же человека (чужой id выглядит как несуществующий), оплачена, не старше RUN_MAX_AGE_MS,
// та же расшифровка (sha256, сам текст не храним), этот шаг еще не делался (каждый шаг один раз).
// Шаг занимается до модели условным update и снимается обратно, если модель упала.
// Тексты отказов без сырых ошибок; экран показывает их как плашку лимита (402 и 403).
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const RUN_MAX_AGE_MS = 24 * 60 * 60 * 1000
export type ContinuationStep = 2 | 3 | 4

export interface RunRow {
  id: string
  user_id: string
  transcript_hash: string
  paid_at: string | null
  created_at: string
  step2_at?: string | null
  step3_at?: string | null
  step4_at?: string | null
}

export type RunCheck =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string }

const START_OVER = 'Этот разбор нужно начать заново. Нажми «Анализировать под психолога» еще раз.'
export const RUN_TEXTS = {
  required: START_OVER,
  notFound: START_OVER,
  notPaid: 'Первый шаг разбора не прошел до конца, поэтому продолжения нет. Нажми «Анализировать под психолога» еще раз.',
  expired: 'Разбор старше суток. Чтобы продолжить, начни его заново.',
  mismatch: START_OVER,
  stepUsed: START_OVER,
  checkFailed: 'Не получилось проверить разбор. Попробуй еще раз через минуту.',
  startFailed: 'Разбор сейчас не запускается. Попробуй еще раз через минуту, энергия не потрачена.',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function hashTranscript(transcript: string): string {
  return createHash('sha256').update(String(transcript || '').trim(), 'utf8').digest('hex')
}

export function isRunId(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

// Чистая проверка строки (без базы). row null = нет строки с таким id у этого человека.
export function validateRun(row: RunRow | null, ctx: { userId: string; transcriptHash: string; step: ContinuationStep; now?: number }): RunCheck {
  if (!row || row.user_id !== ctx.userId) return { ok: false, status: 403, code: 'run_not_found', message: RUN_TEXTS.notFound }
  if (!row.paid_at) return { ok: false, status: 402, code: 'run_not_paid', message: RUN_TEXTS.notPaid }
  const now = ctx.now ?? Date.now()
  const born = Date.parse(row.created_at)
  if (!Number.isFinite(born) || now - born > RUN_MAX_AGE_MS) return { ok: false, status: 403, code: 'run_expired', message: RUN_TEXTS.expired }
  if (row.transcript_hash !== ctx.transcriptHash) return { ok: false, status: 403, code: 'run_mismatch', message: RUN_TEXTS.mismatch }
  if (row[`step${ctx.step}_at` as const]) return { ok: false, status: 403, code: 'step_used', message: RUN_TEXTS.stepUsed }
  return { ok: true }
}

// Хранилище разборов. В роуте supabaseRunStore (service_role), в тесте память.
export interface RunStore {
  create(userId: string, transcriptHash: string): Promise<string | null>
  markPaid(id: string, userId: string): Promise<boolean>
  // undefined: сбой чтения (не путать с «нет строки» = null)
  get(id: string, userId: string): Promise<RunRow | null | undefined>
  // true: шаг занят этим запросом; false: уже занят кем-то (параллельный повтор)
  claimStep(id: string, userId: string, step: ContinuationStep): Promise<boolean>
  releaseStep(id: string, userId: string, step: ContinuationStep): Promise<void>
}

const code = (e: any) => String(e?.code || e?.name || 'unknown').slice(0, 40)

export function supabaseRunStore(db: SupabaseClient): RunStore {
  const T = 'competitor_runs'
  return {
    async create(userId, transcriptHash) {
      const { data, error } = await db.from(T).insert({ user_id: userId, transcript_hash: transcriptHash }).select('id').single()
      if (error) { console.warn('competitor_runs create:', code(error)); return null }
      return (data as any)?.id ?? null
    },
    async markPaid(id, userId) {
      const { data, error } = await db.from(T).update({ paid_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).is('paid_at', null).select('id')
      if (error) { console.warn('competitor_runs markPaid:', code(error)); return false }
      return Array.isArray(data) && data.length === 1
    },
    async get(id, userId) {
      const { data, error } = await db.from(T)
        .select('id, user_id, transcript_hash, paid_at, created_at, step2_at, step3_at, step4_at')
        .eq('id', id).eq('user_id', userId).maybeSingle()
      if (error) { console.warn('competitor_runs get:', code(error)); return undefined }
      return (data as RunRow) ?? null
    },
    async claimStep(id, userId, step) {
      const col = `step${step}_at`
      const { data, error } = await db.from(T).update({ [col]: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).not('paid_at', 'is', null).is(col, null).select('id')
      if (error) { console.warn('competitor_runs claim:', code(error)); return false }
      return Array.isArray(data) && data.length === 1
    },
    async releaseStep(id, userId, step) {
      const { error } = await db.from(T).update({ [`step${step}_at`]: null }).eq('id', id).eq('user_id', userId)
      if (error) console.warn('competitor_runs release:', code(error))
    },
  }
}

// Проверка продолжения целиком: id, строка, оплата, срок, расшифровка, шаг; при успехе шаг уже занят.
export async function checkContinuation(store: RunStore, req: { runId: unknown; userId: string; transcript: string; step: ContinuationStep; now?: number }): Promise<RunCheck> {
  if (!isRunId(req.runId)) return { ok: false, status: 403, code: 'run_required', message: RUN_TEXTS.required }
  let row: RunRow | null | undefined
  try { row = await store.get(req.runId, req.userId) } catch (e) { console.warn('competitor_runs get:', code(e)); row = undefined }
  if (row === undefined) return { ok: false, status: 503, code: 'run_check_failed', message: RUN_TEXTS.checkFailed }
  const v = validateRun(row, { userId: req.userId, transcriptHash: hashTranscript(req.transcript), step: req.step, now: req.now })
  if (!v.ok) return v
  let claimed = false
  try { claimed = await store.claimStep(req.runId, req.userId, req.step) } catch (e) { console.warn('competitor_runs claim:', code(e)) }
  if (!claimed) return { ok: false, status: 403, code: 'step_used', message: RUN_TEXTS.stepUsed }
  return { ok: true }
}
