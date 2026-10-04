import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Откуда пришла (задача analitika, этап 4): при первом заходе на сайт запоминаем utm и тип реферера
// в своей cookie psy_src на 30 дней. Только короткие коды в нижнем регистре, никаких адресов.
// После регистрации клиент (lib/track.ts) один раз шлет их событием signup_source.
const CODE_RE = /^[a-z0-9_.-]{1,40}$/
const code = (v: string | null) => { const c = (v || '').toLowerCase().trim(); return CODE_RE.test(c) ? c : '' }
function refType(referer: string | null, host: string): string {
  if (!referer) return 'direct'
  let h = ''
  try { h = new URL(referer).hostname.toLowerCase() } catch { return 'other' }
  if (!h || h === host) return 'direct'
  if (/(^|\.)yandex\.|(^|\.)ya\.ru$/.test(h)) return 'yandex'
  if (/(^|\.)google\./.test(h)) return 'google'
  if (/instagram\.com$|(^|\.)l\.instagram/.test(h)) return 'instagram'
  if (/(^|\.)t\.me$|telegram/.test(h)) return 'telegram'
  if (/(^|\.)vk\.(com|ru)$|vk\.link$/.test(h)) return 'vk'
  return 'other'
}
function withSource(request: NextRequest, res: NextResponse): NextResponse {
  if (request.method !== 'GET' || request.cookies.get('psy_src')) return res
  const path = request.nextUrl.pathname
  if (path.startsWith('/api') || path.startsWith('/dashboard') || path.startsWith('/admin')) return res
  const q = request.nextUrl.searchParams
  const parts = [
    ['src', code(q.get('utm_source'))], ['medium', code(q.get('utm_medium'))], ['campaign', code(q.get('utm_campaign'))],
    ['ref', refType(request.headers.get('referer'), request.nextUrl.hostname)],
  ].filter(([, v]) => v).map(([k, v]) => `${k}:${v}`)
  res.cookies.set('psy_src', parts.join('|'), { path: '/', maxAge: 30 * 24 * 3600, sameSite: 'lax' })
  return res
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Защищаем только личные разделы. Лендинг и обменник входа доступны всем.
  const path = request.nextUrl.pathname
  // Кабинет /admin без входа и для чужой почты отвечает 404, чтобы раздел не светился. Это первый слой;
  // дальше requireAdmin в каждой странице и adminOrNull у данных (lib/admin.ts, lib/analytics/admin-data.ts)
  const adminList = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const isAdminUser = !!user?.email && !!user.email_confirmed_at && adminList.includes(user.email.toLowerCase())
  if (path.startsWith('/admin') && !isAdminUser) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin-not-found'
    return NextResponse.rewrite(url, { status: 404 })
  }
  const isProtected =
    path.startsWith('/dashboard') || path.startsWith('/onboarding')

  if (!user && isProtected) {
    // Незалогиненного на личных страницах отправляем на главную (там вход).
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return withSource(request, supabaseResponse)
}
