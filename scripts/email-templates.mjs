// Сборка HTML-писем Supabase Auth (переезд базы, 10.11.2026): node scripts/email-templates.mjs
// Один каркас на четыре письма (designer-psycont), тексты copywriter-psycont. Результат в supabase/email-templates/*.html,
// эти файлы кладутся на сервер базы в /opt/supabase/email-templates и отдаются auth через внутренний Caddy
// (GOTRUE_MAILER_TEMPLATES_*). Руками html не править, только этот файл и пересборка.
//
// Ссылки ведут на наши страницы, а не на /auth/v1/verify: токен тратится только по кнопке на странице
// (почтовики открывают ссылки заранее и сжигали бы одноразовую ссылку). Переменные шаблона Go:
// {{ .SiteURL }} (SITE_URL сервера, https://psycont.ru), {{ .TokenHash }}, {{ .NewEmail }} у смены почты.
// Все стили инлайн: Mail.ru и часть почтовиков вырезают <style>. В <style> только мобильная подстройка.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const C = {
  bg: '#F5EFE4', card: '#FFFFFF', text: '#3B2A22', muted: '#6B6458', green: '#33472B', border: '#E3DACB',
}
const FONT = "'Onest',Arial,Helvetica,sans-serif"
const LOGO = 'https://psycont.ru/brand/psycont-wordmark.png' // 1600x431, показываем 160x43

const LETTERS = {
  confirmation: {
    subject: 'Подтверди почту, и начнем',
    preheader: 'Подтверди адрес, и можно собирать первый пост',
    title: 'Осталось подтвердить почту',
    paragraphs: [
      'Нажми кнопку ниже, так мы поймем, что почта твоя. Без этого войти не получится.',
      'Дальше будет короткое знакомство: пять вопросов о тебе и твоей практике, чтобы тексты звучали как ты. А потом сразу первый пост, его можно поправить под себя.',
    ],
    button: 'Подтвердить почту',
    href: '{{ .SiteURL }}/auth/podtverdit?token_hash={{ .TokenHash }}&type=signup',
    small: 'Ссылка работает 1 час. Если это не ты, просто проигнорируй письмо, аккаунт не включится.',
    why: 'Письмо пришло, потому что с этой почтой создали аккаунт на psycont.ru.',
  },
  recovery: {
    subject: 'Ссылка для нового пароля',
    preheader: 'Нажми кнопку и задай новый пароль. Старый работает, пока ты его не сменишь',
    title: 'Новый пароль',
    paragraphs: [
      'Для этой почты запросили сброс пароля в PsyCont. Нажми кнопку и придумай новый.',
      'Пока ты его не сменишь, старый пароль работает как раньше.',
    ],
    button: 'Задать новый пароль',
    href: '{{ .SiteURL }}/auth/novyy-parol?token_hash={{ .TokenHash }}&type=recovery',
    small: 'Ссылка работает 1 час и открывается один раз. Если это не ты, просто проигнорируй письмо, пароль останется прежним.',
    why: 'Письмо пришло, потому что на psycont.ru запросили сброс пароля для этой почты.',
  },
  email_change: {
    subject: 'Подтверди новую почту',
    preheader: 'После подтверждения входить и получать письма будешь по этому адресу',
    title: 'Это твоя новая почта?',
    paragraphs: [
      'В аккаунте PsyCont поменяли почту на <strong>{{ .NewEmail }}</strong>. Подтверди, и дальше вход и письма будут здесь.',
      'Тексты, голос и настройки остаются на месте.',
    ],
    button: 'Подтвердить почту',
    href: '{{ .SiteURL }}/auth/podtverdit?token_hash={{ .TokenHash }}&type=email_change',
    small: 'Ссылка работает 1 час. Если это не ты, просто проигнорируй письмо, почта в аккаунте не изменится.',
    why: 'Письмо пришло, потому что этот адрес указали как новую почту аккаунта на psycont.ru.',
  },
  magic_link: {
    subject: 'Вход в PsyCont',
    preheader: 'Одна кнопка, и ты в кабинете, пароль не нужен',
    title: 'Вход без пароля',
    paragraphs: ['Нажми кнопку, и откроется твой кабинет.'],
    button: 'Войти в PsyCont',
    href: '{{ .SiteURL }}/auth/podtverdit?token_hash={{ .TokenHash }}&type=magiclink',
    small: 'Ссылка работает 1 час и открывается один раз. Если это не ты, просто проигнорируй письмо, без ссылки в аккаунт никто не войдет.',
    why: 'Письмо пришло, потому что на psycont.ru запросили вход по этой почте.',
  },
}

const p = (html, style) => `<p style="margin:0;${style}">${html}</p>`

function build(l) {
  const paras = l.paragraphs.map((t, i) =>
    p(t, `font-family:${FONT};font-size:16px;line-height:24px;color:${C.text};${i < l.paragraphs.length - 1 ? 'padding-bottom:12px;' : ''}`)).join('\n')
  return `<!doctype html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${l.subject}</title>
<style>
:root{color-scheme:light only;supported-color-schemes:light only}
@media (max-width:480px){.wrap{padding:24px 12px !important}.card{padding:24px 20px !important}.btn{width:100% !important}.btn a{display:block !important;box-sizing:border-box !important;width:100% !important;min-width:0 !important}}
</style>
<!--[if mso]><style>table,td,p,a{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${l.preheader}&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td class="wrap" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 24px 0;">
<a href="https://psycont.ru" style="text-decoration:none;"><img src="${LOGO}" width="160" height="43" alt="PsyCont" style="display:block;border:0;outline:none;width:160px;height:auto;"></a>
</td></tr>
<tr><td class="card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:24px;padding:32px 28px;">
${p(l.title, `font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${C.text};padding-bottom:12px;`)}
${paras}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin-top:24px;">
<tr><td align="center" bgcolor="${C.green}" style="background:${C.green};border-radius:16px;">
<!--[if mso]><v:roundrect href="${l.href}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="33%" stroke="f" fillcolor="${C.green}"><w:anchorlock/><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${l.button}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${l.href}" target="_blank" style="display:inline-block;min-width:164px;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:16px;text-align:center;">${l.button}</a><!--<![endif]-->
</td></tr>
</table>
${p(l.small, `font-family:${FONT};font-size:14px;line-height:20px;color:${C.muted};padding-top:20px;`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
<tr><td style="border-top:1px solid ${C.border};padding-top:20px;">
${p('Если кнопка не нажимается, скопируй ссылку в браузер:', `font-family:${FONT};font-size:14px;line-height:20px;color:${C.muted};padding-bottom:4px;`)}
${p(`<a href="${l.href}" style="color:${C.green};text-decoration:underline;word-break:break-all;">${l.href}</a>`, `font-family:${FONT};font-size:13px;line-height:18px;color:${C.green};word-break:break-all;`)}
</td></tr>
</table>
${p('Команда PsyCont', `font-family:${FONT};font-size:14px;line-height:20px;color:${C.text};padding-top:24px;`)}
</td></tr>
<tr><td align="center" style="padding:24px 0 0 0;">
${p(`Сделано в <a href="https://psycont.ru" style="color:${C.green};text-decoration:underline;">PsyCont</a> · psycont.ru`, `font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};`)}
${p(l.why, `font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};padding-top:6px;`)}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`
}

const out = join(process.cwd(), 'supabase', 'email-templates')
mkdirSync(out, { recursive: true })
const subjects = {}
for (const [name, l] of Object.entries(LETTERS)) {
  const html = build(l)
  if (/[—–ё]/.test(html)) throw new Error(`${name}: тире или ё в письме`)
  writeFileSync(join(out, `${name}.html`), html)
  subjects[name] = l.subject
  console.log(`${name}.html ${Buffer.byteLength(html)} байт`)
}
writeFileSync(join(out, 'subjects.json'), JSON.stringify(subjects, null, 2) + '\n')
