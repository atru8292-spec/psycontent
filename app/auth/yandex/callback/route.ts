import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { publicOrigin } from '@/lib/origin'
import { firstName } from '@/lib/first-name'
import { cookies } from 'next/headers'
import { CONSENT_VERSION } from '@/lib/rekvizity'

// Шаг 2 входа через Яндекс. Яндекс вернул сюда ?code=...
// Мы: меняем код на токен → узнаём email/имя → находим или заводим пользователя
// в Supabase → выдаём ему сессию в куки → отправляем в кабинет/онбординг.
export async function GET(req: Request) {
  const origin = publicOrigin(req)
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
  // Согласие на обработку данных (152-ФЗ): галочка в окне регистрации ставит cookie psy_sogl (app/auth/yandex/start).
  const jar = await cookies()
  const consent = jar.get('psy_sogl')?.value === '1'
  // одноразовая: после чтения убираем
  try { jar.delete({ name: 'psy_sogl', path: '/auth/yandex' }) } catch {}
  // Заводим нового (если уже есть — Supabase вернёт ошибку, мы её просто игнорируем).
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    // imya: имя для писем входа («{имя}, привет!»), то же правило, что у триггера базы (lib/first-name.ts)
    user_metadata: {
      ...(fullName ? { full_name: fullName } : {}),
      ...(firstName(info.first_name) ? { imya: firstName(info.first_name) } : {}),
      ...(consent ? { soglasie_pd: new Date().toISOString(), soglasie_ver: CONSENT_VERSION } : {}),
    },
    app_metadata: { provider: 'yandex', providers: ['yandex'] },
  })
  // Аккаунт только что создан этим запросом, а согласия нет (человек нажал Яндекс в окне «Войти», аккаунта у него не было):
  // убираем пустой аккаунт и просим поставить галочку. Удаляется только созданный здесь аккаунт, по его id из ответа createUser
  // (для уже существующей почты createUser возвращает ошибку, и id пуст). Не удалился: без входа, на главную с ошибкой.
  const newId = !created.error ? created.data?.user?.id : undefined
  if (newId && !consent) {
    const { error: delErr } = await admin.auth.admin.deleteUser(newId)
    if (delErr) { console.error('yandex callback: аккаунт без согласия не удалился'); return NextResponse.redirect(`${origin}/?error=yandex_link`) }
    return NextResponse.redirect(`${origin}/?auth=register&nado=soglasie`)
  }

  // 4. Выдаём сессию: получаем одноразовый токен и подтверждаем его в куки-клиенте.
  let { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.redirect(`${origin}/?error=yandex_link`)
  }

  // createUser мог упасть не из-за занятой почты (сеть, сбой): тогда generateLink сам заводит пользователя, уже без отметки
  // согласия. Такой аккаунт виден по возрасту (создан меньше минуты назад) при пустом newId. Без согласия его убираем.
  const justMade = !newId && !!linkData.user?.created_at && Date.now() - Date.parse(linkData.user.created_at) < 60_000
  if (justMade && !consent && linkData.user) {
    const { error: delErr } = await admin.auth.admin.deleteUser(linkData.user.id)
    if (delErr) { console.error('yandex callback: свежий аккаунт без согласия не удалился'); return NextResponse.redirect(`${origin}/?error=yandex_link`) }
    return NextResponse.redirect(`${origin}/?auth=register&nado=soglasie`)
  }

  // Защита от захвата аккаунта заранее (ревью 10.11): кто-то мог зарегистрироваться по почте на этот адрес
  // со своим паролем и не подтвердить его. Яндекс доказал, что почта принадлежит вошедшему, и вход ниже
  // подтвердит аккаунт, поэтому чужой пароль сначала сбрасываем на случайный. Свой пароль хозяйка задаст
  // через «Не помню пароль». У подтвержденных аккаунтов ничего не трогаем.
  // Сброс гасит уже выданную ссылку, поэтому после него берем новую (проверено на новой базе 10.11).
  const existing = linkData.user
  if (existing && !existing.email_confirmed_at) {
    const { error: resetErr } = await admin.auth.admin.updateUserById(existing.id, {
      password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      email_confirm: true,
      // отметку согласия при регистрации по почте мог поставить чужой человек: пишем согласие вошедшего или стираем
      user_metadata: consent
        ? { soglasie_pd: new Date().toISOString(), soglasie_ver: CONSENT_VERSION }
        : { soglasie_pd: null, soglasie_ver: null },
    })
    if (resetErr) return NextResponse.redirect(`${origin}/?error=yandex_link`)
    ;({ data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email }))
    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.redirect(`${origin}/?error=yandex_link`)
    }
  }
  const tokenHash = linkData.properties.hashed_token

  const supabase = await createClient()
  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  if (otpErr) return NextResponse.redirect(`${origin}/?error=yandex_session`)

  // 5. Куда вести: если профиль уже есть, в кабинет, иначе в листалку-знакомство
  // (она при наличии мысли из демо или профиля сама уведет дальше).
  let dest = '/onboarding/intro'
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
