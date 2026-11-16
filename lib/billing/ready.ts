// Готова ли оплата к людям (17.11, ревью). Оферта обещает письмо за 3 дня до списания и письмо после оплаты,
// поэтому на проде оплата (кнопки, создание платежей, продления) включается только когда: есть ключи ЮKassa,
// настроен SMTP и тексты писем уже не черновик. BILLING_DRAFT_OK=1 разрешает черновики (только для проверки
// с тестовым магазином, на боевых ключах не ставить). Вебхук работает при любых ключах: платеж мог уже пройти.
import { ykConfigured } from './yookassa'
import { smtpConfigured } from './mailer'
import { DRAFT } from './mail-texts'

export function billingReady(): boolean {
  if (!ykConfigured()) return false
  if (process.env.NODE_ENV !== 'production') return true
  if (process.env.BILLING_DRAFT_OK === '1') return true
  return !DRAFT && smtpConfigured()
}
