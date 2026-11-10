'use client'

// Страница «Новый пароль». Сюда ведет ссылка из письма сброса: /auth/novyy-parol?token_hash=...&type=recovery.
// Одноразовый токен тратится только по нажатию «Сохранить пароль», не при открытии страницы: Яндекс Почта
// и Mail.ru заранее открывают ссылки из писем, и токен, потраченный при загрузке, сгорал бы до человека.
// Без токена страница работает для уже вошедшего (сессия есть) или показывает «ссылка устарела» с запросом новой.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Clock, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/track'
import { authErrorKind, MIN_PASSWORD, T, verifyRetryable } from '@/lib/auth-texts'
import { AuthShell, Notice, PasswordInput, StateIcon } from '@/components/auth/AuthShell'
import RequestLinkForm from '@/components/auth/RequestLinkForm'

type State = 'checking' | 'form' | 'done' | 'expired'

export default function NewPasswordPage() {
  const router = useRouter()
  const [state, setState] = useState<State>('checking')
  const [showSpinner, setShowSpinner] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const token = useRef<string | null>(null)
  const verified = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setShowSpinner(true), 300)
    const q = new URLSearchParams(window.location.search)
    const th = q.get('token_hash')
    // Только по ссылке из письма. Без токена форма не открывается даже для вошедшего: иначе любой,
    // кто сел за незакрытое устройство, сменил бы пароль без старого (ревью 10.11). Смена пароля из
    // настроек, если понадобится, отдельно и через повторную проверку (reauthenticate).
    if (th && q.get('type') === 'recovery') {
      token.current = th
      setState('form')
    } else {
      setState('expired')
    }
    return () => clearTimeout(t)
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD) { setError(T.shortPassword); return }
    setSaving(true)
    try {
      if (token.current && !verified.current) {
        const { data, error: vErr } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: token.current })
        if (vErr) {
          // лимит или сеть: токен не потрачен, форму оставляем
          const r = verifyRetryable(vErr)
          if (r) { setError(r === 'rate' ? T.rateLimit : T.generic); setSaving(false); return }
        }
        if (vErr || !data?.session) { setSaving(false); setState('expired'); return }
        verified.current = true
        setEmail(data.user?.email || '')
        // токен потрачен: убираем его из адреса, чтобы не попал в историю и в повторные открытия
        window.history.replaceState(null, '', window.location.pathname)
        track('auth_link_ok', { kind: 'recovery' })
      }
      const { error: uErr } = await supabase.auth.updateUser({ password })
      if (uErr) {
        const k = authErrorKind(uErr)
        setError(k === 'same_password' ? T.samePassword : k === 'weak_password' ? T.shortPassword : T.saveFailed)
        setSaving(false)
        return
      }
      track('auth_reset_done')
      setState('done')
    } catch {
      setError(T.saveFailed)
    }
    setSaving(false)
  }

  if (state === 'checking') {
    return (
      <AuthShell>
        <div className="min-h-[200px] flex items-center justify-center gap-2" aria-busy="true">
          {showSpinner && <><Loader2 className="w-5 h-5 animate-spin text-brand-muted" /><span className="text-sm text-brand-muted">{T.checking}</span></>}
        </div>
      </AuthShell>
    )
  }

  if (state === 'done') {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <StateIcon><Check className="w-5 h-5" /></StateIcon>
          <h1 className="text-lg sm:text-xl font-bold text-brand-text">{T.newDoneTitle}</h1>
          {/* видно, чей пароль сменен: если ссылка была от другого аккаунта, подмена не пройдет молча */}
          {email && <p className="text-sm font-medium text-brand-text mt-1.5 break-all">{email}</p>}
          <button type="button" onClick={() => router.push('/dashboard')} className="btn-primary w-full py-3 text-sm mt-5">
            {T.newDoneButton}
          </button>
        </div>
      </AuthShell>
    )
  }

  if (state === 'expired') {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center mb-5">
          <StateIcon><Clock className="w-5 h-5" /></StateIcon>
          <h1 className="text-lg sm:text-xl font-bold text-brand-text">{T.newExpiredTitle}</h1>
          <p className="text-sm text-brand-muted mt-1.5 leading-relaxed">{T.newExpired}</p>
        </div>
        <RequestLinkForm
          kind="recovery"
          submitLabel={T.newExpiredButton}
          sentTitle={T.forgotSentTitle}
          sentText={() => T.forgotSent}
          resendLabel={T.forgotResend}
        />
        <p className="text-xs text-brand-muted text-center mt-4">
          <Link href="/?auth=login" className="text-brand-accent font-medium hover:underline">{T.loginWithPassword}</Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="text-lg sm:text-xl font-bold text-brand-text">{T.newTitle}</h1>
      <p className="text-sm text-brand-muted mt-1.5 leading-snug">{T.newSubtitle}</p>
      {email && <p className="text-sm font-medium text-brand-text mt-1 break-all">{email}</p>}
      <form onSubmit={save} className="mt-5">
        <PasswordInput value={password} onChange={setPassword} placeholder={T.newPlaceholder} autoComplete="new-password" readOnly={saving} />
        <p className="text-xs text-brand-muted mt-2 leading-relaxed">{T.newHint}</p>
        {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
        <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-sm mt-3 disabled:opacity-50">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {T.newSaving}</> : T.newSubmit}
        </button>
      </form>
    </AuthShell>
  )
}
