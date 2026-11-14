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

  // Согласие на обработку данных (галочка в окне регистрации): короткая cookie на 10 минут, ее читает callback.
  // Без нее новый аккаунт через Яндекс не создается; на вход в уже существующий аккаунт она не влияет.
  const res = NextResponse.redirect(authUrl.toString())
  // Ставим только при переходе с нашего же сайта: чужая страница со ссылкой ?soglasie=1 согласие не запишет
  const site = req.headers.get('sec-fetch-site')
  const own = !site || site === 'same-origin'
  if (own && new URL(req.url).searchParams.get('soglasie') === '1') {
    res.cookies.set('psy_sogl', '1', { path: '/auth/yandex', maxAge: 600, httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https') })
  } else {
    res.cookies.set('psy_sogl', '', { path: '/auth/yandex', maxAge: 0 })
  }
  return res
}
