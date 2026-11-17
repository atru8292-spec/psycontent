// Одноразовая метка для ссылки t.me/psycont_supportbot?start=<метка> (18.11, ветка feat/bot).
// Метка = 12 случайных байт + 9 байт HMAC-SHA256 от них (секрет BOT_LINK_SECRET), base64url, 28 знаков.
// Почты и id в метке нет. Подпись отсекает мусор без похода в базу; в базе лежит только sha256 метки,
// срок (24 часа) и отметка использования. Одноразовость: условный update «used_at is null и не просрочена».
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const TOKEN_TTL_MS = 24 * 3600 * 1000
export const TOKEN_RE = /^[A-Za-z0-9_-]{28}$/

const b64u = (b: Buffer) => b.toString('base64url')

function sig(secret: string, rnd: Buffer): Buffer {
  return createHmac('sha256', secret).update(rnd).digest().subarray(0, 9)
}

export function secretOk(secret: string | undefined): secret is string {
  return !!secret && secret.length >= 32
}

export function makeToken(secret: string, rnd: Buffer = randomBytes(12)): string {
  if (!secretOk(secret)) throw Object.assign(new Error('link secret'), { code: 'bot_link_secret' })
  return b64u(rnd) + b64u(sig(secret, rnd))
}

// true: метка наша по подписи (срок и одноразовость проверяет база)
export function verifyToken(secret: string | undefined, token: string): boolean {
  if (!secretOk(secret) || typeof token !== 'string' || !TOKEN_RE.test(token)) return false
  const raw = Buffer.from(token, 'base64url')
  if (raw.length !== 21) return false
  const want = sig(secret, raw.subarray(0, 12))
  return timingSafeEqual(raw.subarray(12), want)
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
