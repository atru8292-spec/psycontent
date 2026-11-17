// Отправка писем об оплате через SMTP.bz (тот же, что шлет письма входа; переменные SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS, отправитель SMTP_FROM). Без настроек ничего не отправляет и пишет в журнал только вид письма.
// В журнал не пишем ни почту, ни текст письма.
import nodemailer from 'nodemailer'
import { renderPayMail } from './mail-render'
import { errTag } from '@/lib/safe-error'

let transport: nodemailer.Transporter | null = null
function tr(): nodemailer.Transporter | null {
  if (transport) return transport
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  const port = Number(process.env.SMTP_PORT || 465)
  transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  return transport
}

export const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

export async function sendPayMail(kind: string, to: string, data: Record<string, string>, site: string): Promise<boolean> {
  // PAY_MAIL_SUBJECT_PREFIX только для проверок («[тест] »), на проде не задавать
  const m = renderPayMail(kind, data, site, process.env.PAY_MAIL_SUBJECT_PREFIX || '')
  if (!m || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false
  const t = tr()
  if (!t) { console.info('pay mail skipped (no SMTP):', kind); return false }
  try {
    // HTML и текстовая версия (multipart/alternative): почтовик без HTML покажет текст с кнопками строкой «Текст: ссылка»
    await t.sendMail({
      from: process.env.SMTP_FROM || 'PsyCont <noreply@psycont.ru>',
      to,
      subject: m.subject,
      text: m.text,
      html: m.html,
    })
    return true
  } catch (e) {
    console.warn('pay mail failed:', kind, errTag(e))
    return false
  }
}
