// Проверка секретов бота (18.11, ветка feat/bot). Сравнение за постоянное время, секрет короче 32 знаков не принимается.
import { timingSafeEqual } from 'node:crypto'

export function sameSecret(got: string | null | undefined, want: string | null | undefined): boolean {
  if (!want || want.length < 32 || !got) return false
  const a = Buffer.from(got), b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

// таймер с сервера: 127.0.0.1:3001 мимо nginx (X-Real-IP ставит только nginx), секрет CRON_SECRET в X-Cron-Secret
export function cronAllowed(h: { get(name: string): string | null }): boolean {
  if (h.get('x-real-ip')) return false
  return sameSecret(h.get('x-cron-secret'), process.env.CRON_SECRET)
}

// вебхук Telegram: заголовок X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET
export function webhookAllowed(h: { get(name: string): string | null }): boolean {
  return sameSecret(h.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_WEBHOOK_SECRET)
}
