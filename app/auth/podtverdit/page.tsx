'use client'

// Подтверждение по ссылке из письма: регистрация, смена почты, вход без пароля.
// Адрес из шаблона письма: /auth/podtverdit?token_hash=...&type=signup|email_change|magiclink.
// Токен тратится только по кнопке, не при открытии: почтовики (Яндекс, Mail.ru) открывают ссылки заранее,
// и автоматическая проверка при загрузке сжигала бы ссылку до человека. Протухшая ссылка: тут же
// прислать письмо заново (для регистрации) и войти.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Loader2, Mail } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/track'
import { T } from '@/lib/auth-texts'
import { AuthShell, StateIcon } from '@/components/auth/AuthShell'
import RequestLinkForm from '@/components/auth/RequestLinkForm'

type Kind = 'signup' | 'email_change' | 'magiclink'
// куда дальше и какой тип проверять у Supabase
const FLOW: Record<Kind, { otp: EmailOtpType; next: string }> = {
  signup: { otp: 'email', next: '/onboarding/intro' },
  email_change: { otp: 'email_change', next: '/dashboard/settings' },
  magiclink: { otp: 'email', next: '/dashboard' },
}

function kindOf(t: string | null): Kind | null {
  if (t === 'signup' || t === 'email') return 'signup'
  if (t === 'email_change') return 'email_change'
  if (t === 'magiclink') return 'magiclink'
  return null
}

export default function ConfirmPage() {
  const router = useRouter()
  const [kind, setKind] = useState<Kind | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'verifying' | 'expired'>('loading')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const k = kindOf(q.get('type'))
    const th = q.get('token_hash')
    setKind(k)
    setToken(th)
    setState(k && th ? 'ready' : 'expired')
  }, [])

  const confirm = async () => {
    if (!kind || !token) return
    setState('verifying')
    try {
      const { data, error } = await supabase.auth.verifyOtp({ type: FLOW[kind].otp, token_hash: token })
      if (error || !data?.session) { setState('expired'); return }
      track('auth_link_ok', { kind })
      router.replace(FLOW[kind].next)
    } catch {
      setState('expired')
    }
  }

  if (state === 'loading') return <AuthShell><div className="min-h-[160px]" aria-busy="true" /></AuthShell>

  if (state === 'expired') {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center mb-5">
          <StateIcon><Clock className="w-5 h-5" /></StateIcon>
          <h1 className="text-lg sm:text-xl font-bold text-brand-text">{T.linkExpiredTitle}</h1>
          <p className="text-sm text-brand-muted mt-1.5 leading-relaxed">{T.linkExpired}</p>
        </div>
        {(kind === 'signup' || kind === null) && (
          <RequestLinkForm
            kind="signup"
            submitLabel={T.linkExpiredResend}
            sentTitle={T.checkEmailTitle}
            sentText={(e) => T.resentConfirm(e)}
            resendLabel={T.resendConfirm}
          />
        )}
        <p className="text-xs text-brand-muted text-center mt-4">
          <Link href="/?auth=login" className="text-brand-accent font-medium hover:underline">{T.linkExpiredLogin}</Link>
        </p>
      </AuthShell>
    )
  }

  const c = T.confirm[kind!]
  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <StateIcon><Mail className="w-5 h-5" /></StateIcon>
        <h1 className="text-lg sm:text-xl font-bold text-brand-text">{c.title}</h1>
        <p className="text-sm text-brand-muted mt-1.5 leading-relaxed">{c.text}</p>
        <button type="button" onClick={confirm} disabled={state === 'verifying'} autoFocus className="btn-primary w-full py-3 text-sm mt-5 disabled:opacity-50">
          {state === 'verifying' ? <><Loader2 className="w-4 h-4 animate-spin" /> {T.confirming}</> : c.button}
        </button>
      </div>
    </AuthShell>
  )
}
