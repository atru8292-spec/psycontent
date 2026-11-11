// Сборка HTML-писем Supabase Auth, версия 2 (10.11.2026): node scripts/email-templates.mjs
// Тексты copywriter-psycont, вид designer-psycont. Результат в supabase/email-templates/*.html; на сервере базы
// они лежат в /opt/supabase/email-templates и отдаются auth через внутренний Caddy (GOTRUE_MAILER_TEMPLATES_*).
// Руками html не править, только этот файл и пересборка.
//
// Ссылки ведут на страницы сайта, токен тратится только по кнопке (почтовики открывают ссылки заранее).
// Переменные шаблона Go (gotrue): {{ .SiteURL }}, {{ .TokenHash }}, {{ .NewEmail }}, {{ .Data }} = user_metadata.
// Имя: user_metadata.imya (lib/auth-name.ts пишет его после онбординга и правки профиля, вход через Яндекс сам).
// Все стили инлайн: Mail.ru и часть почтовиков вырезают <style>; в <style> только мобильная подстройка и защита
// от темной темы. HTML-комментарии gotrue вырезает, поэтому условных блоков для Outlook нет.
// Картинки только по абсолютным адресам с psycont.ru (public/email), у каждой width и height: без картинок
// (Mail.ru и Яндекс часто блокируют их по умолчанию) раскладка не прыгает, а облачко с приветствием остается.
// Темная тема: держим светлую схему (color-scheme light only), кнопку и логотип защищаем от инверсии.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const C = {
  bg: '#F5EFE4', card: '#FFFFFF', text: '#3B2A22', muted: '#6B6458', green: '#33472B',
  border: '#E3DACB', lilac: '#F4EEFA',
}
const FONT = "'Onest',Helvetica,Arial,sans-serif"
const IMG = 'https://psycont.ru/email'
const GREETING = '{{ if .Data.imya }}{{ .Data.imya }}, привет!{{ else }}Привет!{{ end }}'

const LETTERS = {
  confirmation: {
    subject: 'Подтверди почту, и начнем',
    preheader: 'Одна кнопка, потом пять вопросов и твой первый пост',
    title: 'Осталось подтвердить почту',
    body: ['Я Вера, пишу посты и карусели так, как говоришь ты. Подтверди почту, потом ответь на пять коротких вопросов о себе и практике, и сразу соберем первый пост.'],
    button: 'Подтвердить почту',
    after: 'Дальше откроется знакомство, это около минуты.',
    href: '{{ .SiteURL }}/auth/podtverdit?token_hash={{ .TokenHash }}&type=signup',
    small: 'Ссылка работает 1 час. Если это не ты, ничего не делай, без подтверждения аккаунт не включится.',
    why: 'Письмо пришло, потому что с этой почтой создали аккаунт на psycont.ru.',
  },
  recovery: {
    subject: 'Ссылка для нового пароля',
    preheader: 'Старый пароль работает, пока ты не задашь новый',
    title: 'Задай новый пароль',
    body: ['Для твоей почты запросили сброс пароля. Бывает, пароль вылетает из головы. Пока ты не задашь новый, старый работает как раньше.'],
    button: 'Задать пароль',
    after: 'Откроется страница, там придумаешь новый пароль.',
    href: '{{ .SiteURL }}/auth/novyy-parol?token_hash={{ .TokenHash }}&type=recovery',
    small: 'Ссылка работает 1 час и открывается один раз. Если это не ты, ничего не делай, пароль останется прежним.',
    why: 'Письмо пришло, потому что на psycont.ru запросили сброс пароля для этой почты.',
  },
  email_change: {
    subject: 'Подтверди смену почты',
    preheader: 'Почту в аккаунте PsyCont меняют на {{ .NewEmail }}',
    title: 'Меняем почту в аккаунте',
    body: [`В аккаунте PsyCont меняют почту на <strong style="font-weight:700;">{{ .NewEmail }}</strong>. Подтверди, и вход, и письма переедут на этот адрес. Тексты, голос и настройки останутся на месте.`],
    button: 'Подтвердить смену',
    after: 'После этого входить в кабинет нужно будет по новой почте.',
    href: '{{ .SiteURL }}/auth/podtverdit?token_hash={{ .TokenHash }}&type=email_change',
    small: 'Ссылка работает 1 час. Если это не ты, ничего не делай, почта останется прежней. И на всякий случай смени пароль.',
    why: 'Письмо пришло на старый и новый адрес, потому что в аккаунте на psycont.ru меняют почту.',
  },
  magic_link: {
    subject: 'Твоя ссылка для входа',
    preheader: 'Нажми кнопку, и откроется кабинет. Пароль не нужен',
    title: 'Вход без пароля',
    body: ['Вот ссылка для входа, пароль вспоминать не нужно.'],
    button: 'Войти в кабинет',
    after: 'Откроется кабинет, все твои тексты там.',
    href: '{{ .SiteURL }}/auth/podtverdit?token_hash={{ .TokenHash }}&type=magiclink',
    small: 'Ссылка работает 1 час и открывается один раз. Если это не ты, ничего не делай, без этой ссылки в аккаунт никто не войдет.',
    why: 'Письмо пришло, потому что на psycont.ru попросили вход по этой почте.',
  },
}

const t = (style) => `font-family:${FONT};${style}`

function build(l) {
  const body = l.body.map((x, i) =>
    `<p style="margin:0;${t(`font-size:17px;line-height:26px;color:${C.text};`)}${i ? 'padding-top:12px;' : ''}">${x}</p>`).join('\n')
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${l.subject}</title>
<style>
@font-face{font-family:'Onest';font-style:normal;font-weight:400;src:url(https://psycont.ru/carousel/fonts/Onest_400Regular.ttf) format('truetype')}
@font-face{font-family:'Onest';font-style:normal;font-weight:700;src:url(https://psycont.ru/carousel/fonts/Onest_700Bold.ttf) format('truetype')}
:root{color-scheme:light only;supported-color-schemes:light only}
[data-ogsc] .btn-text{color:#FFFFFF !important}
[data-ogsb] .btn-bg{background-color:${C.green} !important}
@media (max-width:480px){
.wrap{padding:24px 12px !important}
.card{padding:24px 20px !important}
.h1{font-size:23px !important;line-height:30px !important}
.small,.sig2,.foot{font-size:15px !important;line-height:22px !important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${l.preheader}&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td class="wrap" align="center" style="padding:40px 16px 32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 20px 0;">
<a href="https://psycont.ru" style="text-decoration:none;"><img src="${IMG}/wordmark-email.png" width="132" height="36" alt="PsyCont" style="display:block;border:0;outline:none;width:132px;height:36px;${t(`font-size:18px;font-weight:700;color:${C.green};`)}"></a>
</td></tr>
<tr><td class="card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:24px;padding:32px 36px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="72" valign="bottom" style="width:72px;vertical-align:bottom;"><img src="${IMG}/vera-privet.png" width="72" height="80" alt="" style="display:block;border:0;width:72px;height:80px;"></td>
<td valign="middle" style="padding-left:12px;vertical-align:middle;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${C.lilac}" style="background:${C.lilac};border-radius:18px 18px 18px 4px;padding:10px 16px;${t(`font-size:17px;line-height:24px;font-weight:700;color:${C.text};`)}">${GREETING}</td>
</tr></table>
</td>
</tr></table>

<p class="h1" style="margin:0;padding-top:20px;${t(`font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.2px;color:${C.text};`)}">${l.title}</p>
<img src="${IMG}/squiggle-lilac.png" width="96" height="10" alt="" style="display:block;border:0;width:96px;height:10px;margin:8px 0 18px 0;">
${body}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
<tr><td class="btn-bg" align="center" bgcolor="${C.green}" style="background-color:${C.green};background-image:linear-gradient(${C.green},${C.green});border-radius:16px;">
<a class="btn-text" href="${l.href}" target="_blank" style="display:block;padding:18px 24px;${t('font-size:17px;line-height:20px;font-weight:700;')}color:#FFFFFF;text-decoration:none;text-align:center;border-radius:16px;">${l.button}</a>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
<tr><td align="center" bgcolor="${C.lilac}" style="background:${C.lilac};border-radius:14px;padding:12px 16px;${t(`font-size:15px;line-height:22px;color:${C.text};`)}">${l.after}</td></tr>
</table>

<p class="small" style="margin:0;padding-top:20px;${t(`font-size:14px;line-height:21px;color:${C.muted};`)}">${l.small}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
<tr><td style="border-top:1px solid ${C.border};padding-top:20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="36" valign="top" style="width:36px;vertical-align:top;"><img src="${IMG}/icon.png" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px;"></td>
<td valign="top" style="padding-left:12px;vertical-align:top;">
<p style="margin:0;${t(`font-size:16px;line-height:22px;font-weight:700;color:${C.text};`)}">Вера</p>
<p class="sig2" style="margin:0;${t(`font-size:14px;line-height:20px;color:${C.muted};`)}">помогаю вести блог в PsyCont</p>
</td>
</tr></table>
</td></tr>
</table>

</td></tr>
<tr><td align="center" style="padding:20px 8px 0 8px;">
<p class="foot" style="margin:0;${t(`font-size:13px;line-height:20px;color:${C.muted};`)}">${l.why}</p>
<p class="foot" style="margin:0;padding-top:6px;${t(`font-size:13px;line-height:20px;color:${C.muted};`)}">Сделано в <a href="https://psycont.ru" style="color:${C.green};text-decoration:underline;">PsyCont</a></p>
</td></tr>
</table>
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
  if (/<!--/.test(html)) throw new Error(`${name}: HTML-комментарий (gotrue его вырежет)`)
  writeFileSync(join(out, `${name}.html`), html)
  subjects[name] = l.subject
  console.log(`${name}.html ${Buffer.byteLength(html)} байт`)
}
writeFileSync(join(out, 'subjects.json'), JSON.stringify(subjects, null, 2) + '\n')
// Темы писем gotrue берет из переменных окружения, а не из subjects.json: сверяем с настройками сервера базы,
// чтобы тема не разошлась с текстом письма (ревью 11.11)
const compose = readFileSync(join(process.cwd(), 'deploy', 'baza-ru', 'docker-compose.psycont.yml'), 'utf8')
const ENV = { confirmation: 'CONFIRMATION', recovery: 'RECOVERY', email_change: 'EMAIL_CHANGE', magic_link: 'MAGIC_LINK' }
const stale = Object.entries(subjects).filter(([k, v]) => !compose.includes(`GOTRUE_MAILER_SUBJECTS_${ENV[k]}: "${v}"`))
if (stale.length) {
  console.error('ТЕМЫ НЕ СОВПАДАЮТ с deploy/baza-ru/docker-compose.psycont.yml, поправь там:')
  for (const [k, v] of stale) console.error(`      GOTRUE_MAILER_SUBJECTS_${ENV[k]}: "${v}"`)
  process.exit(1)
}
