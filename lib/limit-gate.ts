// Лимит материалов в старых генераторах (решение Арины 12.11, до подключения оплаты).
// Один материал = один готовый текст. Проверка ДО вызова модели (canConsume), списание ПОСЛЕ
// успешной генерации и записи в generated_posts (commit). При падении модели commit не зовем.
// Новый «Сделать» (generate-post/group) и «Другой заход» (adjust) считают сами, сюда не переводились.
//
// Ответ отказа: 429 { error: текст отказа из lib/energy.ts, limit: true, code: reason }.
// Старые экраны показывают data.error как есть, поэтому текст отказа виден человеку.
// Сбой чтения счетчика (reason 'server_error') тоже 429 с понятным текстом, не 200 и не молчаливый пропуск.
import { NextResponse } from 'next/server'
import { canConsume, commitConsume, recordRefusal, type Decision } from './energy'

export interface GateDeps {
  canConsume: (userId: string, op: string, units?: number) => Promise<Decision>
  commitConsume: (userId: string, op: string, decision: Decision) => Promise<unknown>
  recordRefusal?: (userId: string, op: string) => Promise<void>
}

export type GateResult =
  | { ok: false; response: NextResponse; decision: Decision }
  | { ok: true; decision: Decision; commit: () => Promise<void> }

const DEFAULT_DEPS: GateDeps = { canConsume, commitConsume, recordRefusal }

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
  return { ok: true, decision, commit }
}
