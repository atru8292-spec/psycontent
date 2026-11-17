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
  // BILLING_DRAFT_OK снимает только проверку черновиков; без SMTP оплата не включается никогда (ревью 17.11)
  return (process.env.BILLING_DRAFT_OK === '1' || !DRAFT) && smtpConfigured()
}

// Оплата только для тестовых аккаунтов (17.11, выкатка для скриншотов ЮKassa в тестовом режиме): если задан
// PAY_ONLY_EMAILS (через запятую, «*» внутри почты: atru8292+*@gmail.com), кнопки оплаты и создание платежа видят
// только эти почты, остальным «Оплата скоро». Пусто: оплата для всех. Вебхук и таймер от этого не зависят.
export function payAllowedFor(email: string | null | undefined): boolean {
  const list = (process.env.PAY_ONLY_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
  if (!list.length) return true
  const e = (email || '').trim().toLowerCase()
  if (!e) return false
  return list.some(p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^@,\\s]*') + '$').test(e))
}
export const paymentsOnFor = (email: string | null | undefined) => billingReady() && payAllowedFor(email)
