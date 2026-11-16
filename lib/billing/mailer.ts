// Отправка писем об оплате через SMTP.bz (тот же, что шлет письма входа; переменные SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS, отправитель SMTP_FROM). Без настроек ничего не отправляет и пишет в журнал только вид письма.
// В журнал не пишем ни почту, ни текст письма.
import nodemailer from 'nodemailer'
import { MAIL, fill } from './mail-texts'
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

export async function sendPayMail(kind: string, to: string, data: Record<string, string>, site: string): Promise<void> {
  const tpl = MAIL[kind]
  if (!tpl || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return
  const t = tr()
  if (!t) { console.info('pay mail skipped (no SMTP):', kind); return }
  const all = { ...data, site }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'PsyCont <noreply@psycont.ru>',
      to,
      subject: fill(tpl.subject, all),
      text: fill(tpl.text, all),
    })
  } catch (e) {
    console.warn('pay mail failed:', kind, errTag(e))
  }
}
