'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { RESEND_COOLDOWN_S, T } from '@/lib/auth-texts'

// Оболочка страниц входа по ссылке из письма (designer-psycont, 10.11): без шапки кабинета,
// на мобилке карточка прижата к верху (центр прыгает при открытой клавиатуре), на десктопе по центру.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-brand-bg flex flex-col items-center px-4 pt-8 pb-10 sm:justify-center sm:pt-0">
      <Link href="/" className="mb-5 sm:mb-6" aria-label="PsyCont, на главную">
        <Image src="/brand/psycont-wordmark.svg" alt="PsyCont" width={119} height={32} className="h-7 sm:h-8 w-auto" priority />
      </Link>
      <div className="bg-brand-card border border-brand-border rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-sm min-w-0">
        {children}
      </div>
    </main>
  )
}

// Значок в круге над заголовком состояния (письмо ушло, готово, ссылка устарела)
export function StateIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-12 h-12 rounded-full bg-brand-soft text-brand-accent flex items-center justify-center mb-3" aria-hidden="true">
      {children}
    </div>
  )
}

// Плашка ошибки или успеха. Красного нет: ошибку отличает текст и role="alert".
export function Notice({ kind, children }: { kind: 'error' | 'ok'; children: React.ReactNode }) {
  return (
    <p
      role={kind === 'error' ? 'alert' : undefined}
      aria-live={kind === 'ok' ? 'polite' : undefined}
      className="text-brand-text text-xs bg-brand-soft p-2.5 rounded-xl border border-brand-border-soft leading-relaxed"
    >
      {children}
    </p>
  )
}

// Таймер «отправить еще раз через N с». start() после каждой удачной отправки.
export function useCooldown(seconds = RESEND_COOLDOWN_S) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(id)
  }, [left])
  return { left, start: () => setLeft(seconds) }
}

// Поле пароля с глазиком, как в окне входа. font-size 16px у .input, iOS не зумит.
export function PasswordInput({
  value, onChange, placeholder, autoComplete, readOnly, autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete: 'new-password' | 'current-password'
  readOnly?: boolean
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" aria-hidden="true" />
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={6}
        autoComplete={autoComplete}
        enterKeyHint="done"
        readOnly={readOnly}
        autoFocus={autoFocus}
        onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300) }}
        className="input pl-10 pr-12 scroll-mb-28"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? T.hidePassword : T.showPassword}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text cursor-pointer p-2"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
