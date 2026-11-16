// POST /api/auth/signup: регистрация по почте через сайт (16.11, блок 1 запуска, защита от ботов).
// Раньше браузер ходил прямо в GoTrue (supabase.auth.signUp). Теперь проверки lib/signup-guard.ts, потом тот же
// запрос в GoTrue с сервера: GoTrue сам шлет письмо подтверждения, как раньше. Прямой /auth/v1/signup на сервере
// базы закрыт для всех, кроме сервера сайта (Caddyfile, deploy/baza-ru), иначе бот обошел бы эти проверки.
// Ответ: { ok: true, session? } или { error: 'bot' | 'rate_limit' | 'weak_password' | 'generic' }.
// «Почта уже занята» не выдаем никогда: ответ как у новой почты (так было и в AuthModal).
import { NextRequest, NextResponse } from 'next/server'
import { checkSignup, recordSignup, clientIp, captchaOk } from '@/lib/signup-guard'
import { CONSENT_VERSION } from '@/lib/rekvizity'
import { MIN_PASSWORD } from '@/lib/auth-texts'
import { errTag } from '@/lib/safe-error'
import { publicOrigin } from '@/lib/origin'

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (origin && origin !== publicOrigin(req)) return NextResponse.json({ error: 'generic' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!EMAIL_RE.test(email) || password.length > 200) return NextResponse.json({ error: 'generic' }, { status: 400 })
  if (password.length < MIN_PASSWORD) return NextResponse.json({ error: 'weak_password' }, { status: 400 })
  if (body?.soglasie !== true) return NextResponse.json({ error: 'generic' }, { status: 400 })

  const ip = clientIp(req.headers)
  const g = checkSignup({ ip, honeypot: body?.site, formMs: body?.ms })
  if (!g.ok) {
    console.warn('signup refused:', g.reason)
    return NextResponse.json({ error: g.reason === 'ip_limit' || g.reason === 'all_limit' ? 'rate_limit' : 'bot' }, { status: 429 })
  }
  if (!(await captchaOk(body?.captcha, ip))) {
    console.warn('signup refused: captcha')
    return NextResponse.json({ error: 'bot' }, { status: 429 })
  }
  recordSignup(ip)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ error: 'generic' }, { status: 500 })
  try {
    const r = await fetch(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      // отметка согласия: дата и версия политики, остаются в аккаунте (как раньше в AuthModal)
      body: JSON.stringify({ email, password, data: { soglasie_pd: new Date().toISOString(), soglasie_ver: CONSENT_VERSION } }),
      signal: AbortSignal.timeout(15000),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) {
      const code = String(j?.error_code || j?.code || '')
      const msg = String(j?.msg || j?.message || '')
      if (/already|exists/i.test(code + msg)) return NextResponse.json({ ok: true })
      if (r.status === 429 || /rate/i.test(code)) return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
      if (/weak_password/i.test(code)) return NextResponse.json({ error: 'weak_password' }, { status: 400 })
      console.warn('signup gotrue:', r.status, errTag({ code }))
      return NextResponse.json({ error: 'generic' }, { status: 502 })
    }
    // подтверждение почты выключено: GoTrue сразу дает сессию, браузер ставит ее через setSession
    if (j?.access_token && j?.refresh_token) return NextResponse.json({ ok: true, session: { access_token: j.access_token, refresh_token: j.refresh_token } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.warn('signup gotrue:', errTag(e))
    return NextResponse.json({ error: 'generic' }, { status: 502 })
  }
}
