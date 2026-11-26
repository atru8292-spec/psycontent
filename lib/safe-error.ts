// Безопасные ошибки (16.11, блок 1 запуска). В журнал pm2 и человеку не уходит ни текст ответа модели,
// ни куски профиля или поста: только код ошибки. Причина: сырой ответ OpenAI попадал в psycont-error.log
// (lib/openrouter.ts, lib/generation/ai.ts) и человеку на экран.

// Ошибка с кодом без текста: статус OpenAI (openai_429, openai_401, openai_500), openai_bad_json, openai_empty.
export class CodedError extends Error {
  code: string
  status?: number
  constructor(code: string, status?: number) {
    super(code)
    this.name = 'CodedError'
    this.code = code
    if (status != null) this.status = status
  }
}

// Ошибка OpenAI по статусу ответа. Из тела берем только код OpenAI (insufficient_quota, rate_limit_exceeded),
// он из словаря OpenAI, текста запроса в нем нет.
export function openAiError(status: number, raw?: string): CodedError {
  let kind = ''
  try {
    const j = JSON.parse(raw || '')
    kind = String(j?.error?.code || j?.error?.type || '').replace(/[^a-z0-9_]/gi, '').slice(0, 30)
  } catch {}
  return new CodedError(kind ? `openai_${status}_${kind}` : `openai_${status}`, status)
}

// Метка для журнала: код, статус или имя ошибки. Сообщение не пишем: в нем бывает ответ модели
// (например, «Unexpected token ... is not valid JSON» с куском текста) или значения строки базы.
export function errTag(e: any): string {
  const t = e?.code || e?.status || e?.name || typeof e
  return String(t).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60) || 'unknown'
}
