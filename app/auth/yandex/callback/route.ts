import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

function getOrigin(req: Request) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  if (host) return `${proto}://${host}`
  return new URL(req.url).origin
}

// Шаг 2 входа через Яндекс. Яндекс вернул сюда ?code=...
// Мы: меняем код на токен → узнаём email/имя → находим или заводим пользователя
// в Supabase → выдаём ему сессию в куки → отправляем в кабинет/онбординг.
export async function GET(req: Request) {
  const origin = getOrigin(req)
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/?error=yandex_no_code`)

  const clientId = process.env.YANDEX_CLIENT_ID
  const clientSecret = process.env.YANDEX_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?error=yandex_config`)
  }
  const redirectUri = `${origin}/auth/yandex/callback`

  // 1. Код → токен доступа
  const tokenRes = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })
  if (!tokenRes.ok) return NextResponse.redirect(`${origin}/?error=yandex_token`)
  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token
  if (!accessToken) return NextResponse.redirect(`${origin}/?error=yandex_token`)

  // 2. Токен → данные пользователя (email, имя)
  const infoRes = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${accessToken}` },
  })
  if (!infoRes.ok) return NextResponse.redirect(`${origin}/?error=yandex_info`)
  const info = await infoRes.json()
  const email: string | undefined =
    info.default_email || (Array.isArray(info.emails) ? info.emails[0] : undefined)
  if (!email) return NextResponse.redirect(`${origin}/?error=yandex_email`)
  const fullName = [info.first_name, info.last_name].filter(Boolean).join(' ')

  // 3. Находим или заводим пользователя в Supabase
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  // Заводим нового (если уже есть — Supabase вернёт ошибку, мы её просто игнорируем).
  await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
    app_metadata: { provider: 'yandex', providers: ['yandex'] },
  })

  // 4. Выдаём сессию: получаем одноразовый токен и подтверждаем его в куки-клиенте.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    return NextResponse.redirect(`${origin}/?error=yandex_link`)
  }

  const supabase = await createClient()
  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  if (otpErr) return NextResponse.redirect(`${origin}/?error=yandex_session`)

  // 5. Куда вести: если паспорт уже начат — в кабинет, иначе в онбординг.
  let dest = '/onboarding'
  const userId = linkData.user?.id
  if (userId) {
    const { data: prof } = await admin
      .from('onboarding_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (prof) dest = '/dashboard'
  }
  return NextResponse.redirect(`${origin}${dest}`)
}
