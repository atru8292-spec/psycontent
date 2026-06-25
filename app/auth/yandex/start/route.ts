import { NextResponse } from 'next/server'

// Определяем адрес сайта автоматически: на localhost будет localhost,
// на бою (за nginx) — psycont.ru. Без ручного переключения.
function getOrigin(req: Request) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  if (host) return `${proto}://${host}`
  return new URL(req.url).origin
}

// Шаг 1 входа через Яндекс: отправляем пользователя на страницу согласия Яндекса.
// client_id читается на сервере (в браузер не утекает). redirect_uri строится
// под текущий адрес сайта и совпадает с тем, что вписан в приложении Яндекса.
export async function GET(req: Request) {
  const origin = getOrigin(req)
  const clientId = process.env.YANDEX_CLIENT_ID
  if (!clientId) {
    return NextResponse.redirect(`${origin}/?error=yandex_config`)
  }

  const redirectUri = `${origin}/auth/yandex/callback`
  const authUrl = new URL('https://oauth.yandex.ru/authorize')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)

  return NextResponse.redirect(authUrl.toString())
}
