// Сборка писем об оплате: HTML и текстовая версия из lib/billing/mail-texts.ts (17.11). Одна семья с письмами входа
// (scripts/email-templates.mjs): те же цвета, Onest, вордмарк и иконка с psycont.ru/email, белая карточка на креме,
// зеленая кнопка. Спецификация designer-psycont 17.11: без облачка и стикера Веры (пишет команда), сиреневая плашка
// только для строки-ключа (сумма и дата), подпись «Команда PsyCont», юридический подвал без отписки.
// Все стили инлайн (Mail.ru и часть почтовиков вырезают <style>); в <style> только мобильная подстройка и защита
// от темной темы. Светлая схема (color-scheme light only), кнопка и плашка защищены от инверсии.
// Подставляемые данные экранируются: в письмо не попадет чужая разметка.
import { MAIL, fill, type MailTpl } from './mail-texts'
import { REKV, OFFER_PATH, PRIVACY_PATH } from '@/lib/rekvizity'

const C = { bg: '#F5EFE4', card: '#FFFFFF', text: '#3B2A22', muted: '#6B6458', green: '#33472B', border: '#E3DACB', lilac: '#F4EEFA', lilacBorder: '#DCCBF2' }
const FONT = "'Onest',Helvetica,Arial,sans-serif"
const IMG = 'https://psycont.ru/email'
const t = (style: string) => `font-family:${FONT};${style}`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// сумма и дата не рвутся на телефоне: «1 290 ₽» и «17 декабря» через неразрывный пробел
const nobr = (s: string) => s.replace(/(\d) (\d{3})/g, '$1&nbsp;$2').replace(/(\d) ₽/g, '$1&nbsp;₽').replace(/(\d{1,2}) (января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/g, '$1&nbsp;$2')
const safeHref = (u: string) => (/^https:\/\/[^\s"<>]+$/.test(u) ? u : 'https://psycont.ru')

export type Rendered = { subject: string; html: string; text: string; preheader: string }

export function renderPayMail(kind: string, data: Record<string, string>, site: string, subjectPrefix = ''): Rendered | null {
  const tpl: MailTpl | undefined = MAIL[kind]
  if (!tpl) return null
  const all: Record<string, string> = { ...data, site }
  const plain = (s: string) => fill(s, all).trim()
  // экранированный вариант подстановок для HTML
  const allEsc: Record<string, string> = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, esc(String(v ?? ''))]))
  const html1 = (s: string) => nobr(fill(esc(s), allEsc).trim())

  const subject = subjectPrefix + plain(tpl.subject)
  const paras = tpl.paras.map(p => ({ plain: plain(p), html: html1(p) })).filter(p => p.plain)
  const keyN = Math.min(tpl.key || 0, paras.length)
  const keyParas = paras.slice(0, keyN), bodyParas = paras.slice(keyN)
  const button = tpl.button ? { label: tpl.button.label, href: safeHref(plain(tpl.button.href)) } : null
  const note = tpl.note ? { before: tpl.note.before, link: tpl.note.link, href: safeHref(plain(tpl.note.href)), after: tpl.note.after } : null
  const preheader = (paras[0]?.plain || '').slice(0, 140)
  const title = esc(plain(tpl.subject))
  const offer = `https://${REKV.site}${OFFER_PATH}`, privacy = `https://${REKV.site}${PRIVACY_PATH}`
  const legal = `${REKV.fio}, самозанятая, ИНН ${REKV.inn}`

  const P = (h: string, first: boolean) => `<p style="margin:0;${t(`font-size:17px;line-height:26px;color:${C.text};`)}${first ? '' : 'padding-top:12px;'}">${h}</p>`
  const keyBlock = keyParas.length ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">
<tr><td class="key" bgcolor="${C.lilac}" style="background:${C.lilac};border:1px solid ${C.lilacBorder};border-radius:16px;padding:16px 20px;">
${keyParas.map((p, i) => `<p class="key" style="margin:0;${t(`font-size:18px;line-height:26px;font-weight:700;color:${C.text};`)}${i ? 'padding-top:4px;' : ''}">${p.html}</p>`).join('\n')}
</td></tr>
</table>` : ''
  const body = bodyParas.length ? `<div style="padding-top:${keyParas.length ? 20 : 0}px;">\n${bodyParas.map((p, i) => P(p.html, i === 0)).join('\n')}\n</div>` : ''
  const btn = button ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
<tr><td class="btn-bg" align="center" bgcolor="${C.green}" style="background-color:${C.green};background-image:linear-gradient(${C.green},${C.green});border-radius:16px;">
<a class="btn-text" href="${button.href}" target="_blank" style="display:block;padding:18px 24px;${t('font-size:17px;line-height:20px;font-weight:700;')}color:#FFFFFF;text-decoration:none;text-align:center;border-radius:16px;">${esc(button.label)}</a>
</td></tr>
</table>` : ''
  const noteHtml = note ? `<p class="note" style="margin:0;padding-top:12px;text-align:center;${t(`font-size:15px;line-height:22px;color:${C.muted};`)}">${esc(note.before)}<a href="${note.href}" target="_blank" style="color:${C.green};text-decoration:underline;">${esc(note.link)}</a>${esc(note.after)}</p>` : ''

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<style>
@font-face{font-family:'Onest';font-style:normal;font-weight:400;src:url(https://psycont.ru/carousel/fonts/Onest_400Regular.ttf) format('truetype')}
@font-face{font-family:'Onest';font-style:normal;font-weight:700;src:url(https://psycont.ru/carousel/fonts/Onest_700Bold.ttf) format('truetype')}
:root{color-scheme:light only;supported-color-schemes:light only}
[data-ogsc] .btn-text{color:#FFFFFF !important}
[data-ogsb] .btn-bg{background-color:${C.green} !important}
[data-ogsc] .key{color:${C.text} !important}
[data-ogsb] .key{background-color:${C.lilac} !important}
@media (max-width:480px){
.wrap{padding:24px 12px !important}
.card{padding:24px 20px !important}
.h1{font-size:23px !important;line-height:30px !important}
.note,.foot{font-size:15px !important;line-height:22px !important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${esc(preheader)}&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td class="wrap" align="center" style="padding:40px 16px 32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 20px 0;">
<a href="https://psycont.ru" style="text-decoration:none;"><img src="${IMG}/wordmark-email.png" width="132" height="36" alt="PsyCont" style="display:block;border:0;outline:none;width:132px;height:36px;${t(`font-size:18px;font-weight:700;color:${C.green};`)}"></a>
</td></tr>
<tr><td class="card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:24px;padding:32px 36px;">

<p class="h1" style="margin:0;${t(`font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.2px;color:${C.text};`)}">${title}</p>
<img src="${IMG}/squiggle-lilac.png" width="96" height="10" alt="" style="display:block;border:0;width:96px;height:10px;margin:8px 0 18px 0;">
${keyBlock}
${body}
${btn}
${noteHtml}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
<tr><td style="border-top:1px solid ${C.border};padding-top:20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="36" valign="middle" style="width:36px;vertical-align:middle;"><img src="${IMG}/icon.png" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px;"></td>
<td valign="middle" style="padding-left:12px;vertical-align:middle;"><p style="margin:0;${t(`font-size:16px;line-height:22px;font-weight:700;color:${C.text};`)}">Команда PsyCont</p></td>
</tr></table>
</td></tr>
</table>

</td></tr>
<tr><td align="center" style="padding:20px 8px 0 8px;">
<p class="foot" style="margin:0;${t(`font-size:13px;line-height:20px;color:${C.muted};`)}">Это служебное письмо об оплате PsyCont</p>
<p class="foot" style="margin:0;padding-top:6px;${t(`font-size:13px;line-height:20px;color:${C.muted};`)}">${esc(legal)}</p>
<p class="foot" style="margin:0;padding-top:6px;${t(`font-size:13px;line-height:20px;color:${C.muted};`)}"><a href="${offer}" style="color:${C.green};text-decoration:underline;">Оферта</a> &middot; <a href="${privacy}" style="color:${C.green};text-decoration:underline;">Политика конфиденциальности</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`

  // текстовая версия: кнопки строкой «Текст: ссылка»
  const text = [
    plain(tpl.subject),
    '',
    ...paras.map(p => p.plain).flatMap(p => [p, '']),
    ...(button ? [`${button.label}: ${button.href}`, ''] : []),
    ...(note ? [`${note.before}${note.link}: ${note.href}`, ''] : []),
    'Команда PsyCont',
    '',
    '---',
    'Это служебное письмо об оплате PsyCont',
    legal,
    `Оферта: ${offer}`,
    `Политика конфиденциальности: ${privacy}`,
  ].join('\n')

  return { subject, html, text, preheader }
}
