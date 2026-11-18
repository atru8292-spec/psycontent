// Настройка бота поддержки в Telegram (18.11, ветка feat/bot): вебхук с секретом, описание бота, команды для Арины.
// Переменные берутся из env (токен и секреты в чат и журнал не печатаются):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (от 32 знаков, A-Z a-z 0-9 _ -), TELEGRAM_ADMIN_CHAT_ID,
//   SITE_PUBLIC_URL (по умолчанию https://psycont.ru)
// Запуск на сервере сайта из /var/www/psycont:
//   npx tsx --env-file=.env scripts/tg-set-webhook.ts            поставить вебхук, описание и команды
//   npx tsx --env-file=.env scripts/tg-set-webhook.ts --info     только показать состояние вебхука
//   npx tsx --env-file=.env scripts/tg-set-webhook.ts --drop     то же, что без флага, и выбросить накопленные обновления
// allowed_updates: только message (правки сообщений, кнопки, участники групп боту не нужны).
import { makeTg } from '../lib/bot/telegram'
import { BOT_DESCRIPTION, BOT_ABOUT } from '../lib/bot/texts'

const argv = process.argv.slice(2)
const token = process.env.TELEGRAM_BOT_TOKEN || ''
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || ''
const admin = process.env.TELEGRAM_ADMIN_CHAT_ID || ''
const site = (process.env.SITE_PUBLIC_URL || 'https://psycont.ru').replace(/\/$/, '')

function fail(msg: string): never { console.error(msg); process.exit(1) }

;(async () => {
  if (!token) fail('TELEGRAM_BOT_TOKEN не задан')
  const tg = makeTg({ token })
  const show = (what: string, r: { ok: boolean; code?: string }) => console.log(`${what}: ${r.ok ? 'ok' : (r as any).code}`)

  if (argv.includes('--info')) {
    const r = await tg.call('getWebhookInfo', {})
    if (!r.ok) fail(`getWebhookInfo: ${r.code}`)
    const i: any = r.result
    // в ответе нет токена и секрета: адрес, число ожидающих, последняя ошибка доставки
    console.log(JSON.stringify({ url: i.url, pending: i.pending_update_count, last_error_date: i.last_error_date, last_error_message: i.last_error_message, allowed_updates: i.allowed_updates }, null, 2))
    return
  }

  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) fail('TELEGRAM_WEBHOOK_SECRET: нужно от 32 до 256 знаков A-Z a-z 0-9 _ -')
  if (!/^https:\/\//.test(site)) fail('SITE_PUBLIC_URL должен начинаться с https://')
  const url = `${site}/api/tg/webhook`

  show('setWebhook', await tg.call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
    max_connections: 1, // по одному обновлению: порядок сообщений и обращения без гонок
    drop_pending_updates: argv.includes('--drop'),
  }))
  console.log(`адрес вебхука: ${url}`)
  show('setMyDescription', await tg.call('setMyDescription', { description: BOT_DESCRIPTION }))
  show('setMyShortDescription', await tg.call('setMyShortDescription', { short_description: BOT_ABOUT }))
  // людям меню команд не показываем; Арине в ее чате три команды
  show('deleteMyCommands', await tg.call('deleteMyCommands', {}))
  if (admin) {
    show('setMyCommands (Арина)', await tg.call('setMyCommands', {
      scope: { type: 'chat', chat_id: admin },
      commands: [
        { command: 'svodka', description: 'Цифры за сегодня' },
        { command: 'oshibki', description: 'Последние 10 сбоев' },
        { command: 'chelovek', description: 'Карточка по почте' },
      ],
    }))
  } else console.log('TELEGRAM_ADMIN_CHAT_ID не задан: команды Арине не поставлены')
})().catch(() => fail('ошибка запуска')) // сообщение ошибки не печатаем: в нем мог бы оказаться адрес с токеном
