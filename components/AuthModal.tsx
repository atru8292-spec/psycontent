'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, Loader2 } from 'lucide-react'
import { authErrorKind, MIN_PASSWORD, T } from '@/lib/auth-texts'
import { Notice, PasswordInput, StateIcon, useCooldown } from '@/components/auth/AuthShell'
import RequestLinkForm from '@/components/auth/RequestLinkForm'
import { requestLink } from '@/components/auth/request-link'
import YandexIdButton from '@/components/auth/YandexIdButton'
import { useSmartCaptcha } from '@/components/auth/SmartCaptcha'
import Link from 'next/link'
import { OFFER_PATH, PRIVACY_PATH, CONSENT_PATH, CONSENT_VERSION } from '@/lib/rekvizity'
import { goal, PRIVATE_FIELD } from '@/lib/metrika'

type Mode = 'login' | 'register' | 'forgot'

// contextNote: мягкая честная строка под заголовком (зачем регистрируешься).
// Когда задан в режиме register, заменяет «Бесплатно. Без карты.» (она уезжает ниже мелким).
// Подтверждение почты включено (переезд базы, 10.11): после регистрации сессии нет, пока человек не нажмет
// ссылку в письме (/auth/podtverdit). Сырые тексты ошибок Supabase не показываем, только lib/auth-texts.ts.
export default function AuthModal({
  isOpen,
  onClose,
  contextNote,
  initialMode = 'register',
}: {
  isOpen: boolean
  onClose: () => void
  contextNote?: string
  initialMode?: 'login' | 'register'
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // почта, на которую ушло письмо подтверждения после регистрации (экран «Осталось подтвердить почту»)
  const [awaiting, setAwaiting] = useState('')
  // вход до подтверждения почты: плашка с «Прислать письмо еще раз»
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)
  // согласие на обработку данных: только в режиме регистрации, заранее не отмечено, при каждом открытии окна сбрасывается
  const [agree, setAgree] = useState(false)
  const [consentErr, setConsentErr] = useState(false)
  const agreeRef = useRef<HTMLInputElement>(null)
  // нажали «Создать аккаунт» или Яндекс без галочки: подсказка прямо под галочкой и фокус на нее
  const noConsent = () => { setConsentErr(true); agreeRef.current?.focus() }
  const cd = useCooldown()
  const router = useRouter()
  // защита от ботов (lib/signup-guard.ts): время с открытия окна, поле-ловушка, невидимая капча Яндекса
  const openedAt = useRef(Date.now())
  const [trap, setTrap] = useState('')
  const captcha = useSmartCaptcha(isOpen && mode === 'register')

  // при каждом открытии начинаем с того режима, с которым открыли («Войти» или «Попробовать»)
  useEffect(() => {
    if (isOpen) { setMode(initialMode); setAwaiting(''); setError(''); setUnconfirmed(false); setResent(false); setAgree(false); setConsentErr(false); openedAt.current = Date.now() }
  }, [isOpen, initialMode])
  // цель Метрики: открыла регистрацию (окно открыто в режиме регистрации или переключено на нее)
  const signupGoal = useRef(false)
  useEffect(() => {
    if (!isOpen) { signupGoal.current = false; return }
    if (mode === 'register' && !signupGoal.current) { signupGoal.current = true; goal('land_signup_open') } // один раз за открытие
  }, [isOpen, mode])

  const switchMode = (m: Mode) => { setMode(m); setError(''); setUnconfirmed(false); setResent(false); setAwaiting('') }

  const resendConfirm = async (addr: string) => {
    setError('')
    setResending(true)
    const r = await requestLink('signup', addr)
    setResending(false)
    if (r === 'rate') { setError(T.rateLimit); return }
    if (r === 'fail') { setError(T.generic); return }
    setResent(true)
    cd.start()
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setUnconfirmed(false)
    setResent(false)

    if (mode === 'register' && !agree) {
      noConsent()
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(T.shortPassword)
      return
    }
    setLoading(true)

    try {
      if (mode === 'register') {
        // регистрация через сайт: проверки от ботов, потом GoTrue шлет письмо подтверждения (app/api/auth/signup)
        goal('signup_submit') // цель Метрики перед капчей (решение Арины 17.11)
        const token = await captcha.getToken()
        const r = await fetch('/api/auth/signup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, soglasie: true, hp_field: trap, ms: Date.now() - openedAt.current, captcha: token }),
        })
        const d = await r.json().catch(() => ({}))
        if (d?.error) {
          // «Уже зарегистрирован» сервер не выдает: окно не должно выдавать чужие аккаунты
          setError(d.error === 'bot' ? T.signupBlocked : d.error === 'rate_limit' ? T.rateLimit : d.error === 'weak_password' ? T.shortPassword : T.generic)
        } else if (d?.session?.access_token && d?.session?.refresh_token) {
          await supabase.auth.setSession(d.session)
          router.push('/onboarding/intro')
        } else {
          // Новая почта или уже занятая: ответ одинаковый, письмо уходит только новой
          setAwaiting(email.trim())
          cd.start()
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          const k = authErrorKind(signInError)
          if (k === 'not_confirmed') setUnconfirmed(true)
          else setError(k === 'bad_credentials' ? T.badCredentials : k === 'rate_limit' ? T.rateLimit : T.generic)
        } else if (data.user) {
          // Сбой чтения профиля не равен «профиля нет» (CLAUDE.md, PGRST116): при ошибке ведем в кабинет,
          // guard в dashboard/layout сам отличит и покажет мягкий повтор, а не онбординг заново.
          const { data: profile, error: profErr } = await supabase
            .from('onboarding_profiles')
            .select('user_id')
            .eq('user_id', data.user.id)
            .maybeSingle()
          router.push(profile || profErr ? '/dashboard' : '/onboarding/intro')
        }
      }
    } catch {
      setError(T.generic)
    }
    setLoading(false)
  }

  if (!isOpen) return null

  const title = mode === 'register' ? T.registerTitle : mode === 'login' ? T.loginTitle : T.forgotTitle

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(59,42,34,0.45)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-brand-card rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-md shadow-2xl relative max-h-[90dvh] overflow-y-auto border border-brand-border min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute top-4 right-4 text-brand-muted hover:text-brand-text transition cursor-pointer p-1"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Мобильная ручка для свайпа */}
          <div className="sm:hidden flex justify-center mb-3">
            <div className="w-10 h-1 bg-brand-border rounded-full" />
          </div>

          <div className="flex items-center justify-center mb-3">
            <Image src="/brand/psycont-wordmark.svg" alt="PsyCont" width={119} height={32} className="h-8 w-auto" />
          </div>

          {awaiting ? (
            // После регистрации: письмо подтверждения ушло
            <div className="text-center flex flex-col items-center">
              <StateIcon><Mail className="w-5 h-5" /></StateIcon>
              <h3 className="text-base sm:text-lg font-bold text-brand-text">{T.checkEmailTitle}</h3>
              <p className={`text-sm text-brand-muted mt-1.5 leading-relaxed break-words ${PRIVATE_FIELD}`} aria-live="polite">
                {resent ? T.resentConfirm(awaiting) : T.checkEmail(awaiting)}
              </p>
              {error && <div className="mt-3 w-full text-left"><Notice kind="error">{error}</Notice></div>}
              <button
                type="button"
                onClick={() => resendConfirm(awaiting)}
                disabled={resending || cd.left > 0}
                className="btn-secondary w-full py-3 text-sm mt-5 disabled:opacity-50"
              >
                {resending ? <><Loader2 className="w-4 h-4 animate-spin" /> {T.forgotSending}</> : T.resendConfirm}
              </button>
              {cd.left > 0 && <p className="text-xs text-brand-muted mt-2">{T.resendIn(cd.left)}</p>}
              <p className="text-center text-xs text-brand-muted mt-4">
                <button onClick={() => switchMode('login')} className="text-brand-accent font-medium no-underline hover:text-brand-accent-hover cursor-pointer">
                  {T.forgotBack}
                </button>
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h3 className="text-base sm:text-lg font-bold text-brand-text">{title}</h3>
                {mode === 'forgot' ? (
                  <p className="text-sm text-brand-muted mt-1">{T.forgotSubtitle}</p>
                ) : mode === 'register' && contextNote ? (
                  <>
                    <p className="text-sm text-brand-text mt-1.5 leading-relaxed">{contextNote}</p>
                    <p className="text-xs text-brand-muted mt-1">{T.registerSubtitle}</p>
                  </>
                ) : (
                  <p className="text-sm text-brand-muted mt-1">
                    {mode === 'register' ? T.registerSubtitle : T.loginSubtitle}
                  </p>
                )}
              </div>

              {mode === 'forgot' ? (
                <>
                  <RequestLinkForm
                    kind="recovery"
                    initialEmail={email}
                    submitLabel={T.forgotSubmit}
                    sentTitle={T.forgotSentTitle}
                    sentText={() => T.forgotSent}
                    resendLabel={T.forgotResend}
                  />
                  <p className="text-center text-xs text-brand-muted mt-4">
                    <button onClick={() => switchMode('login')} className="text-brand-accent font-medium no-underline hover:text-brand-accent-hover cursor-pointer">
                      {T.forgotBack}
                    </button>
                  </p>
                </>
              ) : (
                <>
                  {/* Вход с Яндекс ID: официальная кнопка, одна на все места (components/auth/YandexIdButton.tsx) */}
                  {mode === 'register' && (
                    <div className="mb-4">
                      <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border bg-brand-bg px-3.5 py-3 text-left ${consentErr ? 'border-[1.5px] border-brand-accent' : 'border-brand-border'}`}>
                        <input ref={agreeRef} type="checkbox" checked={agree} aria-invalid={consentErr || undefined} aria-describedby={consentErr ? 'soglasie-err' : undefined}
                          onChange={e => { setAgree(e.target.checked); if (e.target.checked) setConsentErr(false) }}
                          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-brand-accent" />
                        <span className="text-[13px] leading-[1.45] text-brand-text">
                          Даю{' '}
                          <Link href={CONSENT_PATH} target="_blank" className="font-medium text-brand-accent underline underline-offset-2">согласие на обработку персональных данных</Link>
                          {' '}по{' '}
                          <Link href={PRIVACY_PATH} target="_blank" className="font-medium text-brand-accent underline underline-offset-2">политике конфиденциальности</Link>
                        </span>
                      </label>
                      {consentErr && <p id="soglasie-err" role="alert" className="mt-1.5 px-1 text-[13px] font-medium text-brand-text">{T.needConsent}</p>}
                    </div>
                  )}
                  <div className="mb-4">
                    <YandexIdButton
                      href={mode === 'register' && agree ? '/auth/yandex/start?soglasie=1' : '/auth/yandex/start'}
                      guard={() => { if (mode === 'register' && !agree) { noConsent(); return false } return true }}
                    />
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-brand-border" />
                    <span className="text-xs text-brand-muted">{T.divider}</span>
                    <div className="flex-1 h-px bg-brand-border" />
                  </div>

                  {/* Email Form, font-size: 16px чтобы iOS не зумил */}
                  <form onSubmit={handleEmailAuth} className="space-y-3 relative">
                    <div ref={captcha.box} />
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" aria-hidden="true" />
                      <input
                        type="email"
                        placeholder={T.emailPlaceholder}
                        aria-label={T.emailPlaceholder}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className={`input pl-10 ${PRIVATE_FIELD}`}
                      />
                    </div>
                    {/* ловушка для ботов: человек это поле не видит и не заполняет */}
                    {mode === 'register' && (
                      <input type="text" name="hp_field" tabIndex={-1} autoComplete="new-password" aria-hidden="true" value={trap} onChange={e => setTrap(e.target.value)}
                        className="absolute -left-[9999px] w-px h-px opacity-0" />
                    )}
                    <PasswordInput
                      value={password}
                      onChange={setPassword}
                      placeholder={T.passwordPlaceholder}
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    />
                    {mode === 'login' && (
                      <div className="flex justify-end -mt-1.5">
                        <button
                          type="button"
                          onClick={() => switchMode('forgot')}
                          className="text-xs text-brand-muted hover:text-brand-text underline-offset-2 hover:underline py-1 cursor-pointer"
                        >
                          {T.forgotLink}
                        </button>
                      </div>
                    )}

                    {unconfirmed && (
                      <Notice kind="error">
                        <span className="block">{resent ? T.resentConfirm(email.trim()) : T.notConfirmed}</span>
                        {cd.left > 0 ? (
                          <span className="block mt-1.5 text-brand-muted">{T.resendIn(cd.left)}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => resendConfirm(email.trim())}
                            disabled={resending}
                            className="mt-1.5 text-xs font-semibold text-brand-accent underline underline-offset-2 cursor-pointer disabled:opacity-50"
                          >
                            {T.resendConfirm}
                          </button>
                        )}
                      </Notice>
                    )}
                    {error && <Notice kind="error">{error}</Notice>}

                    <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm disabled:opacity-50">
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {T.loading}</>
                      ) : mode === 'register' ? T.submitRegister : T.submitLogin}
                    </button>
                  </form>
                  {mode === 'register' && (
                    <p className="mt-3 text-center text-xs leading-relaxed text-brand-muted">
                      Создавая аккаунт, ты принимаешь{' '}
                      <Link href={OFFER_PATH} target="_blank" className="font-medium text-brand-accent underline underline-offset-2">оферту</Link>
                    </p>
                  )}

                  <p className="text-center text-xs text-brand-muted mt-4">
                    {mode === 'register' ? (
                      <>{T.haveAccount}{' '}
                        <button onClick={() => switchMode('login')} className="text-brand-accent font-medium no-underline hover:text-brand-accent-hover cursor-pointer">
                          {T.toLogin}
                        </button>
                      </>
                    ) : (
                      <>{T.noAccount}{' '}
                        <button onClick={() => switchMode('register')} className="text-brand-accent font-medium no-underline hover:text-brand-accent-hover cursor-pointer">
                          {T.toRegister}
                        </button>
                      </>
                    )}
                  </p>
                </>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
