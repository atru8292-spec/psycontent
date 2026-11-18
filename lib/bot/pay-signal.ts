// Какие ответы вебхука ЮKassa идут в журнал сбоев и сигнал Арине (ревью 18.11). Чистая функция для теста.
// Только запросы с адреса ЮKassa (lib/billing/ip.ts): иначе сканеры писали бы строки в базу и будили Арину.
// bad_ip (403) только в журнал pm2. В журнал: 400 и 500 с адреса ЮKassa и исключения с адреса ЮKassa.
import { isYooKassaIp } from '@/lib/billing/ip'

export function payWebhookIncident(ip: string, status: number | 'exception', result = ''): string | null {
  if (!isYooKassaIp(ip)) return null
  if (status === 'exception') return `exception_${result}`.slice(0, 60)
  if (status === 200 || status === 403) return null
  return `${status}_${result}`.slice(0, 60)
}
