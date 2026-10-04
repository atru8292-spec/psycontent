import { NextResponse } from 'next/server'
import { publicOrigin } from '@/lib/origin'

// Шаг 1 входа через Яндекс: отправляем пользователя на страницу согласия Яндекса.
// client_id читается на сервере (в браузер не утекает). redirect_uri строится
// под текущий адрес сайта и совпадает с тем, что вписан в приложении Яндекса.
export async function GET(req: Request) {
  const origin = publicOrigin(req)
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
