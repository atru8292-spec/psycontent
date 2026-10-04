// Публичный адрес сайта для редиректов. За nginx Next видит себя как localhost:3001, поэтому
// request.url и request.nextUrl дают https://localhost:3001; адрес редиректа собирать только здесь.
// Протокол из x-forwarded-proto (по умолчанию https), хост из x-forwarded-host или host.
// Если хост localhost или 127.0.0.1, берем SITE_URL, а без него https://psycont.ru.
// Только заголовки и env, без node-модулей: файл зовет и middleware.

const FALLBACK = 'https://psycont.ru'

const first = (v: string | null) => (v || '').split(',')[0].trim()

export function publicOrigin(req: { headers: Headers }): string {
  const host = first(req.headers.get('x-forwarded-host')) || first(req.headers.get('host'))
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return (process.env.SITE_URL || '').trim().replace(/\/+$/, '') || FALLBACK
  }
  const proto = first(req.headers.get('x-forwarded-proto')) || 'https'
  return `${proto === 'http' ? 'http' : 'https'}://${host}`
}
