'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, Shield, Eye, EyeOff, Loader2 } from 'lucide-react'

// contextNote: мягкая честная строка под заголовком (зачем регистрируешься).
// Когда задан в режиме register, заменяет «Бесплатно. Без карты.» (она уезжает ниже мелким).
export default function AuthModal({
  isOpen,
  onClose,
  contextNote,
}: {
  isOpen: boolean
  onClose: () => void
  contextNote?: string
}) {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (password.length < 6) {
      setError('Пароль должен быть минимум 6 символов')
      setLoading(false)
      return
    }

    if (mode === 'register') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/onboarding` },
      })
      if (signUpError) {
        setError(signUpError.message === 'User already registered'
          ? 'Этот email уже зарегистрирован. Попробуйте войти.'
          : signUpError.message)
      } else if (data.user) {
        if (data.session) {
          router.push('/onboarding')
        } else {
          setSuccess('Проверьте почту, мы отправили ссылку для подтверждения')
        }
      }
    } else {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message === 'Invalid login credentials'
          ? 'Неверный email или пароль'
          : signInError.message)
      } else if (data.user) {
        const { data: profile } = await supabase
          .from('onboarding_profiles')
          .select('user_id')
          .eq('user_id', data.user.id)
          .single()
        router.push(profile ? '/dashboard' : '/onboarding')
      }
    }
    setLoading(false)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(46,42,69,0.45)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-brand-card rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto border border-brand-border"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-brand-muted hover:text-brand-text transition cursor-pointer p-1"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Мобильная ручка для свайпа */}
          <div className="sm:hidden flex justify-center mb-3">
            <div className="w-10 h-1 bg-brand-border rounded-full" />
          </div>

          <div className="text-center mb-6">
            <div className="flex items-center justify-center mb-3">
              <Image
                src="/logo/out_wordmark.svg"
                alt="PsyCont"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-brand-text">
              {mode === 'register' ? 'Создайте аккаунт' : 'Войдите в аккаунт'}
            </h3>
            {mode === 'register' && contextNote ? (
              <>
                <p className="text-sm text-brand-text mt-1.5 leading-relaxed">{contextNote}</p>
                <p className="text-xs text-brand-muted mt-1">Бесплатно. Без карты.</p>
              </>
            ) : (
              <p className="text-sm text-brand-muted mt-1">
                {mode === 'register' ? 'Бесплатно. Без карты.' : 'Рады снова видеть вас!'}
              </p>
            )}
          </div>

          {/* Yandex Button */}
          <a
            href="/auth/yandex/start"
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-brand-border hover:bg-brand-bg transition font-medium text-brand-text text-sm cursor-pointer mb-4 active:scale-[0.98]"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
              <path fill="#fff" d="M13.3 6.4h-1.2c-2.2 0-3.4 1.1-3.4 2.8 0 1.4.6 2.2 1.9 3.1l1 .7-2.9 4.3h1.8l3-4.5V6.4h-.2zm-.6 5.4l-.9-.5c-.9-.6-1.3-1-1.3-2 0-.9.6-1.5 1.8-1.5h.6v4z" />
            </svg>
            Войти через Яндекс
          </a>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-brand-border" />
            <span className="text-xs text-brand-muted">или по email</span>
            <div className="flex-1 h-px bg-brand-border" />
          </div>

          {/* Email Form, font-size: 16px чтобы iOS не зумил */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input pl-10"
              />
            </div>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input pl-10 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text cursor-pointer p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-brand-text text-xs bg-brand-soft p-2.5 rounded-xl border border-brand-border-soft">{error}</p>
            )}
            {success && (
              <p className="text-brand-text text-xs bg-brand-soft p-2.5 rounded-xl border border-brand-border-soft">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-sm disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</>
              ) : mode === 'register' ? (
                'Создать аккаунт'
              ) : (
                'Войти'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-brand-muted mt-4">
            {mode === 'register' ? (
              <>Уже есть аккаунт?{' '}
                <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className="text-brand-accent font-medium hover:underline cursor-pointer">
                  Войти
                </button>
              </>
            ) : (
              <>Нет аккаунта?{' '}
                <button onClick={() => { setMode('register'); setError(''); setSuccess(''); }} className="text-brand-accent font-medium hover:underline cursor-pointer">
                  Зарегистрироваться
                </button>
              </>
            )}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
