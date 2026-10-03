// Вызов модели для новой цепочки. Отличия от generateWithAI (lib/openrouter.ts):
// - reasoning_effort и verbosity вместо temperature. У gpt-5.4 temperature работает только
//   при reasoning_effort none, при low и выше ее не поддерживают, поэтому не передаем;
// - режим JSON для плана и проверок;
// - таймаут на вызов задается снаружи.
// Обезличивание (152-ФЗ) и журнал расхода те же, что везде.

import { appendFileSync } from 'node:fs'
import { anonymize, deanonymize } from '@/lib/anonymize'
import { logAiUsage, type OpenAIUsage } from '@/lib/energy'
import { DEFAULT_MODEL } from '@/lib/openrouter'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export type CallOpts = {
  system: string
  user: string
  json?: boolean
  effort?: 'none' | 'low' | 'medium'
  verbosity?: 'low' | 'medium'
  maxTokens?: number
  timeoutMs?: number
  userId?: string
  operation?: string
  knownNames?: string[]
  writer?: boolean // пишет текст (П2, П5, П6, П8): может идти на отдельной модели
  model?: string   // явная модель (например, дешевая для выбора черновика); иначе modelFor(writer)
  temperature?: number // только вместе с effort 'none' (гипотеза h5): с рассуждением temperature не принимают
}

// Модель новой цепочки (посты, карусели, Reels, сторис, слепок голоса): gpt-6.1-sol (решение 30.09).
// По официальной странице OpenAI она новее gpt-5.4 и дешевле ($2 / $10 против $2.5 / $15 за 1 млн токенов).
// Старые генераторы (паспорт, контент-план, темы, анализ) пока на DEFAULT_MODEL gpt-5.4: они шлют temperature,
// которую новые модели могут не принять, их переводить отдельно после проверки.
// Сменить без правки кода: GENERATION_MODEL (все вызовы цепочки), GENERATION_WRITER_MODEL (только П2, П5, П6, П8).
export const GENERATION_MODEL = 'gpt-6.1-sol'
export function modelFor(writer?: boolean): string {
  const all = String(process.env.GENERATION_MODEL || '').trim()
  const w = String(process.env.GENERATION_WRITER_MODEL || '').trim()
  return (writer && w) || all || GENERATION_MODEL
}

export async function callModel(o: CallOpts): Promise<string> {
  const { masked, map } = anonymize(o.user, { extraNames: o.knownNames })
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  let model = o.model || modelFor(o.writer)
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: o.system },
      { role: 'user', content: masked },
    ],
    reasoning_effort: o.effort || 'low',
    verbosity: o.verbosity || 'low',
    max_completion_tokens: o.maxTokens || 6000,
  }
  if (o.json) body.response_format = { type: 'json_object' }
  if (o.temperature != null && o.effort === 'none') body.temperature = o.temperature

  const send = () => fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(o.timeoutMs || 55000),
    body: JSON.stringify(body),
  })
  let res = await send()
  let raw = await res.text()
  // другая модель может не знать verbosity или reasoning_effort: повторяем без них один раз
  if (res.status === 400 && /verbosity|reasoning_effort|reasoning\.effort|temperature/i.test(raw)) {
    if (/verbosity/i.test(raw)) delete body.verbosity
    if (/reasoning/i.test(raw)) delete body.reasoning_effort
    if (/temperature/i.test(raw)) { console.warn(`model ${model} rejected temperature: ${raw.slice(0, 200)}`); delete body.temperature }
    res = await send()
    raw = await res.text()
  }
  // модели нет у ключа или она не принимает запрос: не роняем генерацию, пишем на gpt-5.4
  if (!res.ok && model !== DEFAULT_MODEL && (res.status === 404 || (res.status === 400 && /model/i.test(raw)))) {
    console.warn(`generation model ${model} failed (${res.status}), fallback to ${DEFAULT_MODEL}: ${raw.slice(0, 200)}`)
    model = DEFAULT_MODEL
    body.model = model
    body.reasoning_effort = o.effort || 'low'
    body.verbosity = o.verbosity || 'low'
    res = await send()
    raw = await res.text()
  }
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${raw.slice(0, 500)}`)
  let data: any
  try { data = JSON.parse(raw) } catch { throw new Error('OpenAI returned invalid JSON') }
  const usage: OpenAIUsage | undefined = data?.usage
  let content = data?.choices?.[0]?.message?.content
  if (Array.isArray(content)) content = content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('')
  if (typeof content !== 'string' || !content.trim()) throw new Error('Empty model response')
  if (o.userId && o.operation) await logAiUsage(o.userId, o.operation, model, usage).catch(() => {})
  // локальный учет токенов для массовых прогонов (scripts/usage-cost.ts считает рубли); в проде переменной нет
  if (process.env.USAGE_LOG_FILE && usage) {
    try {
      appendFileSync(process.env.USAGE_LOG_FILE, JSON.stringify({ model, op: o.operation || '', usage }) + '\n')
    } catch {}
  }
  return deanonymize(content.trim(), map)
}

// JSON из ответа: снимаем обертку ```json и берем от первой скобки до последней.
export function parseJsonLoose<T = any>(text: string): T {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const firstObj = t.indexOf('{')
  const firstArr = t.indexOf('[')
  const start = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj) ? firstArr : firstObj
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
  if (start === -1 || end === -1) throw new Error('No JSON in model response')
  t = t.slice(start, end + 1)
  return JSON.parse(t) as T
}

export async function callJson<T = any>(o: CallOpts): Promise<T> {
  const first = await callModel({ json: true, ...o })
  try {
    return parseJsonLoose<T>(first)
  } catch {
    // одна повторная попытка: модель иногда обрывает JSON
    const second = await callModel({ json: true, ...o })
    return parseJsonLoose<T>(second)
  }
}
