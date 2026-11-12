// Лимит материалов в старых генераторах (решение Арины 12.11, до подключения оплаты).
// Один материал = один готовый текст. Проверка ДО вызова модели (canConsume), списание ПОСЛЕ
// успешной генерации и записи в generated_posts (commit). При падении модели commit не зовем, зовем fail().
// Новый «Сделать» (generate-post/group) и «Другой заход» (adjust) считают сами, сюда не переводились.
//
// Ответ отказа: 429 { error: текст отказа из lib/energy.ts, limit: true, code: reason }.
// Старые экраны показывают data.error как есть, поэтому текст отказа виден человеку.
// Сбой чтения счетчика (reason 'server_error') тоже 429 с понятным текстом, не 200 и не молчаливый пропуск.
import { NextResponse } from 'next/server'
import { canConsume, commitConsume, recordFailure, recordRefusal, type Decision } from './energy'

export interface GateDeps {
  canConsume: (userId: string, op: string, units?: number) => Promise<Decision>
  commitConsume: (userId: string, op: string, decision: Decision) => Promise<unknown>
  recordRefusal?: (userId: string, op: string) => Promise<void>
  recordFailure?: (userId: string, op: string) => Promise<void>
}

// fail(): модель или запись упали ПОСЛЕ проверки, материал не списываем, факт пишем в журнал (как group).
// После commit() не делает ничего, повторный вызов тоже.
export type GateResult =
  | { ok: false; response: NextResponse; decision: Decision }
  | { ok: true; decision: Decision; commit: () => Promise<void>; fail: () => Promise<void> }

const DEFAULT_DEPS: GateDeps = { canConsume, commitConsume, recordRefusal, recordFailure }

// Мягкий текст сбоя для старых роутов (12.11): сырой error.message человеку не показываем.
export const SOFT_FAIL_TEXT = 'Текст не получился из-за сбоя. Попробуй еще раз через минуту.'

// В журнал только код или имя ошибки, без текста (там может быть ответ модели или кусок профиля).
export function errTag(e: any): string {
  const t = e?.code || e?.status || e?.name || typeof e
  return String(t).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 40) || 'unknown'
}

// Ответ 500 для catch старых роутов: мягкий текст и код, без сырого сообщения.
export function softFailResponse(): NextResponse {
  return NextResponse.json({ error: SOFT_FAIL_TEXT, code: 'server_error' }, { status: 500 })
}

export async function materialGate(userId: string, op: string, units = 1, deps: GateDeps = DEFAULT_DEPS): Promise<GateResult> {
  const decision = await deps.canConsume(userId, op, units)
  if (!decision.ok) {
    // журнал отказа: его сбой отказ не отменяет и в 500 не превращается
    if (deps.recordRefusal) {
      try { await deps.recordRefusal(userId, op) } catch (e: any) { console.warn('materialGate recordRefusal:', String(e?.message || '').slice(0, 60)) }
    }
    const response = NextResponse.json(
      { error: decision.message || 'Материалы закончились', limit: true, code: decision.reason || 'limit' },
      { status: 429 },
    )
    return { ok: false, response, decision }
  }
  let done = false
  const commit = async () => {
    // не больше одного списания на запрос, даже если позвали дважды
    if (done) return
    done = true
    try {
      await deps.commitConsume(userId, op, decision)
    } catch (e: any) {
      // текст уже готов и отдан: сбой списания логируем, ответ не ломаем
      console.error('materialGate commitConsume failed:', op, String(e?.code || e?.message || 'unknown').slice(0, 60))
    }
  }
  const fail = async () => {
    if (done) return
    done = true
    if (!deps.recordFailure) return
    try { await deps.recordFailure(userId, op) } catch (e: any) { console.warn('materialGate recordFailure:', errTag(e)) }
  }
  return { ok: true, decision, commit, fail }
}
