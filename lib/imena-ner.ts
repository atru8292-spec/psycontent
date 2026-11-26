// Клиент службы imena (26.11.2026, 152-ФЗ): spaCy + словарь имен ищут имена людей в тексте перед отправкой
// в нейросеть. Служба стоит на том же сервере, слушает только 127.0.0.1 (папка imena в репо, systemd psycont-imena).
// Решение Арины: если служба не ответила, генерацию НЕ останавливаем, работает прежнее обезличивание на правилах
// (lib/anonymize.ts), а Арине уходит сигнал в бот.
// Без IMENA_SERVICE_URL (локальная разработка, проверки) служба не зовется и сигнала нет.
//
// Защита от лавины и учет обходов (ревью 26.11):
//  - сбой (нет ответа, 5xx кроме 503, плохой ответ): минуту службу не зовем, чтобы каждый вызов модели не ждал
//    по 2 с; сигнал в бот после FAILS_FOR_SIGNAL сбоев подряд;
//  - 503 busy (служба занята параллельными запросами, например 4 формата набора разом): повторяем в пределах тех же
//    2 с, общей паузы не ставим;
//  - обход (busy до конца бюджета или текст длиннее MAX_CHARS): текст ушел на одних правилах. Считаем; если за
//    10 минут обходов больше BYPASS_FOR_SIGNAL, сигнал в бот. В журнал только код и длина, текст никогда.
//  - сигналы не чаще раза в 30 минут.
import type { NerImya } from '@/lib/anonymize'
import { logIncident } from '@/lib/bot/incidents'

const BUDGET_MS = 2000
const MAX_CHARS = 40000
const PAUSE_MS = 60 * 1000
const FAILS_FOR_SIGNAL = 3
const BYPASS_WINDOW_MS = 10 * 60 * 1000
const BYPASS_FOR_SIGNAL = 5
const SIGNAL_EVERY_MS = 30 * 60 * 1000

let fails = 0
let pausedUntil = 0
let lastSignal = 0
let bypasses: number[] = []

function sendSignal(code: string): void {
  if (Date.now() - lastSignal < SIGNAL_EVERY_MS) return
  logIncident('gen', code)
  lastSignal = Date.now()
}

function failed(code: string): void {
  fails++
  pausedUntil = Date.now() + PAUSE_MS
  console.warn('imena:', code, 'подряд:', fails) // только код: текст человека в журнал не пишем
  if (fails >= FAILS_FOR_SIGNAL) sendSignal(code)
}

function bypassed(code: string, len: number): void {
  const now = Date.now()
  bypasses = bypasses.filter(t => now - t < BYPASS_WINDOW_MS)
  bypasses.push(now)
  console.info('imena:', code, 'длина:', len)
  if (bypasses.length > BYPASS_FOR_SIGNAL) sendSignal(code)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function imenaNer(text: string): Promise<NerImya[] | null> {
  const url = process.env.IMENA_SERVICE_URL
  const token = process.env.IMENA_SERVICE_TOKEN
  if (!url || !token || !text) return null
  if (text.length > MAX_CHARS) { bypassed('anon_ner_long', text.length); return null }
  if (Date.now() < pausedUntil) return null
  const deadline = Date.now() + BUDGET_MS
  try {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`${url.replace(/\/$/, '')}/imena`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(Math.max(100, deadline - Date.now())),
      })
      if (r.status === 503) {
        const wait = 150 + attempt * 150
        if (Date.now() + wait >= deadline - 100) { bypassed('anon_ner_busy', text.length); return null }
        await sleep(wait)
        continue
      }
      if (!r.ok) { failed(`anon_ner_${r.status}`); return null }
      const j: any = await r.json()
      if (!Array.isArray(j?.imena)) { failed('anon_ner_bad_answer'); return null }
      fails = 0
      return j.imena
        .filter((x: any) => x && typeof x.t === 'string')
        .map((x: any) => ({ t: x.t, g: x.g === 'm' || x.g === 'f' ? x.g : '' }))
    }
  } catch (e: any) {
    failed(e?.name === 'TimeoutError' ? 'anon_ner_timeout' : 'anon_ner_down')
    return null
  }
}

// только для тестов: сбросить счетчики и узнать, сколько сигналов ушло бы
export function _resetImenaForTest(): void { fails = 0; pausedUntil = 0; lastSignal = 0; bypasses = [] }
export function _lastSignalForTest(): number { return lastSignal }
