'use client'

import { useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { T } from '@/lib/auth-texts'
import { requestLink } from './request-link'
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
    if (!email.trim()) return
    setError('')
    setLoading(true)
    // любой ответ, кроме лимита и сбоя, показываем как «отправили»: ответ не выдает, есть ли аккаунт
    const r = await requestLink(kind, email)
    setLoading(false)
    if (r === 'rate') { setError(T.rateLimit); return }
    if (r === 'fail') { setError(T.generic); return }
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
