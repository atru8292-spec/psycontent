'use client'

import { useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { authErrorKind, T } from '@/lib/auth-texts'
import { Notice, StateIcon, useCooldown } from './AuthShell'

// Запросить письмо со ссылкой: сброс пароля (recovery) или повтор подтверждения почты (signup).
// Ответ одинаковый, есть такой аккаунт или нет: по нему нельзя проверить чужую почту.
// Ссылки в письмах собирает шаблон Supabase (адрес сайта + token_hash), redirectTo тут не нужен.
export default function RequestLinkForm({
  kind,
  initialEmail = '',
  submitLabel,
  sentTitle,
  sentText,
  resendLabel,
}: {
  kind: 'recovery' | 'signup'
  initialEmail?: string
  submitLabel: string
  sentTitle: string
  sentText: (email: string) => string
  resendLabel: string
}) {
  const [email, setEmail] = useState(initialEmail)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const cd = useCooldown()

  const send = async () => {
    const addr = email.trim()
    if (!addr) return
    setError('')
    setLoading(true)
    const { error: err } = kind === 'recovery'
      ? await supabase.auth.resetPasswordForEmail(addr)
      : await supabase.auth.resend({ type: 'signup', email: addr })
    setLoading(false)
    // Для signup Supabase молчит о незнакомой почте, для recovery тоже: любую ошибку, кроме лимита и сбоя,
    // показываем как «отправили», чтобы ответ не выдавал, есть ли аккаунт.
    if (err) {
      const k = authErrorKind(err)
      if (k === 'rate_limit') { setError(T.rateLimit); return }
      if (k === 'other' && (err.status ?? 500) >= 500) { setError(T.generic); return }
    }
    setSent(true)
    cd.start()
  }

  if (sent) {
    return (
      <div className="text-center flex flex-col items-center">
        <StateIcon><Mail className="w-5 h-5" /></StateIcon>
        <h2 className="text-base sm:text-lg font-bold text-brand-text">{sentTitle}</h2>
        <p className="text-sm text-brand-muted mt-1.5 leading-relaxed" aria-live="polite">
          {sentText(email.trim())}
        </p>
        {error && <div className="mt-3 w-full text-left"><Notice kind="error">{error}</Notice></div>}
        <button
          type="button"
          onClick={send}
          disabled={loading || cd.left > 0}
          className="btn-secondary w-full py-3 text-sm mt-5 disabled:opacity-50"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {T.forgotSending}</> : resendLabel}
        </button>
        {cd.left > 0 && <p className="text-xs text-brand-muted mt-2">{T.resendIn(cd.left)}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); send() }} className="space-y-3">
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" aria-hidden="true" />
        <input
          type="email"
          placeholder={T.forgotEmailPlaceholder}
          aria-label={T.forgotEmailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          enterKeyHint="send"
          autoFocus={!initialEmail}
          className="input pl-10"
        />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <button type="submit" disabled={loading} autoFocus={!!initialEmail} className="btn-primary w-full py-3 text-sm disabled:opacity-50">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {T.forgotSending}</> : submitLabel}
      </button>
    </form>
  )
}
