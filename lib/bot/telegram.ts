// Отправка в Telegram Bot API (18.11, ветка feat/bot): sendMessage и copyMessage с повтором.
// Токен только в адресе запроса и НИКОГДА не попадает в ошибки и журналы: наружу уходит только код
// tg_<статус>[_<описание кодом>] (описание Telegram урезается до латиницы, без адреса). Ошибка fetch
// (в ее message бывает адрес с токеном) не пробрасывается, превращается в код tg_net.
// Повтор: до 3 попыток; 429 ждет retry_after (не дольше maxWaitMs), 5xx и сеть ждут 0.5 и 1.5 с.
// 400 и 403 (человек заблокировал бота) не повторяем.

export type TgResult<T = any> = { ok: true; result: T } | { ok: false; status: number; code: string }

export interface TgOpts {
  token: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  attempts?: number
  maxWaitMs?: number
  timeoutMs?: number
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function codeOf(status: number, desc: unknown): string {
  // «Forbidden: bot was blocked by the user» -> tg_403_bot_was_blocked_by_the_user (до 60 знаков)
  const d = String(desc || '').toLowerCase().replace(/^[a-z ]+:\s*/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `tg_${status}${d ? '_' + d : ''}`.slice(0, 60)
}

export function makeTg(o: TgOpts) {
  const f = o.fetchImpl || fetch
  const sleep = o.sleep || realSleep
  const attempts = o.attempts ?? 3
  const maxWait = o.maxWaitMs ?? 10000
  const timeout = o.timeoutMs ?? 10000

  async function call<T = any>(method: string, payload: Record<string, unknown>): Promise<TgResult<T>> {
    if (!o.token) return { ok: false, status: 0, code: 'tg_no_token' }
    let last: TgResult<T> = { ok: false, status: 0, code: 'tg_net' }
    for (let i = 0; i < attempts; i++) {
      let res: Response
      try {
        res = await f(`https://api.telegram.org/bot${o.token}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeout),
        })
      } catch {
        last = { ok: false, status: 0, code: 'tg_net' }
        if (i < attempts - 1) await sleep(i === 0 ? 500 : 1500)
        continue
      }
      let j: any = null
      try { j = await res.json() } catch {}
      if (res.ok && j?.ok) return { ok: true, result: j.result as T }
      const status = Number(j?.error_code || res.status || 0)
      last = { ok: false, status, code: codeOf(status, j?.description) }
      if (status === 429) {
        const wait = Math.min(maxWait, Math.max(1, Number(j?.parameters?.retry_after || 1)) * 1000)
        if (i < attempts - 1) await sleep(wait)
        continue
      }
      if (status >= 500 || status === 0) { if (i < attempts - 1) await sleep(i === 0 ? 500 : 1500); continue }
      return last // 400, 403 и прочее: повтор не поможет
    }
    return last
  }

  return {
    call,
    // id отправленного сообщения или ошибка
    async send(chatId: number | string, text: string, extra: Record<string, unknown> = {}): Promise<TgResult<{ message_id: number }>> {
      return call('sendMessage', { chat_id: chatId, text: text.slice(0, 4096), disable_web_page_preview: true, ...extra })
    },
    async copy(fromChat: number | string, messageId: number, toChat: number | string, extra: Record<string, unknown> = {}): Promise<TgResult<{ message_id: number }>> {
      return call('copyMessage', { chat_id: toChat, from_chat_id: fromChat, message_id: messageId, ...extra })
    },
  }
}

export type Tg = ReturnType<typeof makeTg>
