// Срочные сигналы Арине (18.11, ветка feat/bot): таймер раз в 5 минут (deploy/bot/psycont-bot-signals.*).
// Сигналы: 3+ сбоя генерации подряд, 10+ за час; OpenAI 401/403/429 и кончились деньги; уведомление ЮKassa
// не прошло проверку или упало; таймер оплаты с ошибками; база не отвечает. Сайт снаружи смотрит UptimeRobot,
// его не дублируем. Один и тот же сигнал не чаще раза в 30 минут (bot_signal_state), повторы копятся.
// Логика с зависимостями, чтобы тест (scripts/test-bot.ts) проверял ее без базы и сети.
import { evaluateSignals, genStreak, throttle, signalText, flushDue, flushText, type SignalState } from './report'
import { SIGNAL } from './texts'
import type { SignalsRepo } from './deps'

export type SignalsDeps = {
  repo: SignalsRepo
  send: (text: string) => Promise<boolean>
  now: () => Date
  memory: Map<string, SignalState>   // антиспам на время, когда база недоступна (живет в процессе Next)
}

// память процесса для сигнала «база не отвечает»: в базу его состояние не записать
export const processMemory = new Map<string, SignalState>()

// самое позднее created_at из выборки журнала (строки ISO из базы сравниваются как время)
export function latestAt(rows: { created_at: string }[]): string | null {
  let best: string | null = null, bestT = -Infinity
  for (const r of rows) { const t = Date.parse(r.created_at); if (t > bestT) { bestT = t; best = r.created_at } }
  return best
}

export async function runSignals(d: SignalsDeps): Promise<{ sent: string[]; muted: string[]; db: boolean }> {
  const now = d.now()
  const sent: string[] = [], muted: string[] = []

  if (!(await d.repo.pingDb())) {
    const t = throttle(d.memory.get('db_down') || null, now)
    if (t.send) { if (await d.send(signalText({ key: 'db_down', text: SIGNAL.dbDown, n: 1 }, t.repeats))) { d.memory.set('db_down', t.next); sent.push('db_down') } }
    else { d.memory.set('db_down', t.next); muted.push('db_down') }
    return { sent, muted, db: false }
  }
  // база снова отвечает: накопленные повторы «база не отвечает» отдаем одной строкой и забываем
  const down = d.memory.get('db_down')
  if (down) {
    if (!down.suppressed || await d.send(flushText('db_down', down.suppressed))) d.memory.delete('db_down')
  }

  const since = (await d.repo.cursor()) || new Date(now.getTime() - 10 * 60e3).toISOString()
  const hourAgo = new Date(now.getTime() - 3600e3).toISOString()
  const [fresh, hour, events] = await Promise.all([
    d.repo.freshIncidents(since),
    d.repo.genHour(hourAgo),
    d.repo.makeEvents(new Date(now.getTime() - 2 * 3600e3).toISOString()),
  ])
  const signals = evaluateSignals({ streak: genStreak(events), genHour: hour, fresh })
  let allSent = true
  const mutedStates: [string, SignalState][] = []
  for (const s of signals) {
    const t = throttle(await d.repo.getState(s.key), now, s.n)
    if (t.send) {
      // состояние пишем только после доставки: не дошло, попробуем через 5 минут
      if (await d.send(signalText(s, t.repeats))) { await d.repo.setState(s.key, t.next); sent.push(s.key) }
      else allSent = false
    } else { mutedStates.push([s.key, t.next]); muted.push(s.key) }
  }
  // курсор и счетчики повторов двигаем, только если все сигналы дошли: иначе следующий проход перечитает те же сбои
  // и отправит снова (ревью 18.11: сигнал терялся, когда Telegram не ответил)
  if (allSent) {
    for (const [k, st] of mutedStates) await d.repo.setState(k, st)
    // курсор на время последней прочитанной записи по часам базы (не VPS): без двойного счета и без пропусков
    // при расхождении часов; пустая выборка курсор не трогает (ревью 18.11)
    const last = latestAt(fresh)
    if (last) await d.repo.setCursor(last)
  }
  // накопленные повторы без нового сбоя: через 30 минут короткое «еще N за полчаса»
  const fired = new Set(signals.map(s => s.key))
  for (const st of await d.repo.listStates().catch(() => [])) {
    if (fired.has(st.key) || !flushDue(st, now)) continue
    if (await d.send(flushText(st.key, st.suppressed))) { await d.repo.setState(st.key, { last_sent_at: now.toISOString(), suppressed: 0 }); sent.push(st.key + ':flush') }
  }
  await d.repo.cleanup(now).catch(() => {})
  return { sent, muted, db: true }
}
