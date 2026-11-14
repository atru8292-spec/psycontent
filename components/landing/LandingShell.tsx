'use client'
// Общее состояние лендинга: кто зашел, одно окно входа на всю страницу, land_view.
// Как было: человек с профилем сразу уходит в кабинет. Кнопки: без входа открывают регистрацию,
// вошел без профиля ведут в онбординг, с профилем в «Сделать».

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/track'
import AuthModal from '@/components/AuthModal'

type Who = 'unknown' | 'anon' | 'noprofile' | 'profile'
type Place = 'hero' | 'how' | 'pricing' | 'final' | 'header'
type Plan = 'free' | 'calm' | 'daily'

type Ctx = {
  who: Who
  start: (place: Place, plan?: Plan, opts?: { note?: string }) => void
  login: () => void
  // кнопка первого экрана ушла за верх экрана: только тогда шапка показывает свою (на первом экране кнопка одна)
  heroCtaGone: boolean
  setHeroCtaGone: (v: boolean) => void
}

const LandingCtx = createContext<Ctx>({ who: 'unknown', start: () => {}, login: () => {}, heroCtaGone: false, setHeroCtaGone: () => {} })
export const useLanding = () => useContext(LandingCtx)

export default function LandingShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [who, setWho] = useState<Who>('unknown')
  const [modal, setModal] = useState<{ mode: 'login' | 'register'; note?: string } | null>(null)
  const viewed = useRef(false)
  const [heroCtaGone, setHeroCtaGone] = useState(false)

  // Кто зашел. Пока проверка идет, клик ждет ее, чтобы вошедшему не открылась регистрация.
  // Ошибка чтения профиля считается «не знаем» (как без входа: окно входа само разведет), а не «нет профиля».
  const check = useRef<Promise<Who> | null>(null)
  useEffect(() => {
    if (!viewed.current) { viewed.current = true; track('land_view') }
    let alive = true
    check.current = (async (): Promise<Who> => {
      try {
        const { data } = await supabase.auth.getUser()
        if (!data?.user) return 'anon'
        const { data: prof, error } = await supabase.from('onboarding_profiles').select('user_id').eq('user_id', data.user.id).maybeSingle()
        if (error) return 'anon'
        return prof ? 'profile' : 'noprofile'
      } catch { return 'anon' }
    })()
    check.current.then(w => {
      if (!alive) return
      setWho(w)
      // /?auth=login (ссылка «Войти» со страниц app/auth/*): гостю сразу открываем окно входа, параметр убираем всегда
      const wantsLogin = new URLSearchParams(window.location.search).get('auth') === 'login'
      if (wantsLogin) window.history.replaceState(null, '', window.location.pathname + window.location.hash)
      if (w === 'profile') router.replace('/dashboard')
      else if (w === 'anon' && wantsLogin) setModal({ mode: 'login' })
    })
    return () => { alive = false }
  }, [router])

  const start = useCallback(async (place: Place, plan: Plan = 'free', opts?: { note?: string }) => {
    track('land_cta_click', { place, plan })
    const w = who !== 'unknown' ? who : (await check.current) || 'anon'
    if (w === 'profile') router.push('/dashboard/make')
    else if (w === 'noprofile') router.push('/onboarding/express')
    else setModal({ mode: 'register', note: opts?.note })
  }, [who, router])

  const login = useCallback(() => setModal({ mode: 'login' }), [])

  return (
    <LandingCtx.Provider value={{ who, start, login, heroCtaGone, setHeroCtaGone }}>
      {children}
      <AuthModal isOpen={!!modal} onClose={() => setModal(null)} initialMode={modal?.mode || 'register'} contextNote={modal?.note} />
    </LandingCtx.Provider>
  )
}

const PRIMARY = 'inline-flex h-14 items-center justify-center rounded-2xl bg-brand-accent px-7 text-[17px] font-semibold text-brand-bg transition-colors hover:bg-brand-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent cursor-pointer'
// Светлая кнопка для зеленой карточки: зеленая кнопка на зеленом не видна, кремовая читается
const LIGHT = 'inline-flex h-12 items-center justify-center rounded-2xl bg-brand-bg px-6 text-[16px] font-semibold text-brand-text transition-colors hover:bg-brand-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-bg cursor-pointer'
const SECONDARY = 'inline-flex h-12 items-center justify-center rounded-2xl border border-brand-border bg-transparent px-6 text-[16px] font-medium text-brand-text transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent cursor-pointer'

export function CtaButton({ place, plan, variant = 'primary', className = '', children }: {
  place: Place; plan?: Plan; variant?: 'primary' | 'secondary' | 'light'; className?: string; children: React.ReactNode
}) {
  const { start } = useLanding()
  return (
    <button type="button" onClick={() => start(place, plan)} className={`${variant === 'primary' ? PRIMARY : variant === 'light' ? LIGHT : SECONDARY} ${className}`}>
      {children}
    </button>
  )
}

// Кнопка первого экрана. Пока она на экране, кнопка в шапке скрыта; ушла вверх за шапку, шапка показывает свою.
export function HeroCta({ className = '', children }: { className?: string; children: React.ReactNode }) {
  const { setHeroCtaGone } = useLanding()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') { setHeroCtaGone(true); return }
    const io = new IntersectionObserver(es => {
      const e = es[es.length - 1]
      setHeroCtaGone(!e.isIntersecting && e.boundingClientRect.top < 0)
    }, { rootMargin: '-56px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [setHeroCtaGone])
  return <div ref={box} className={className}><CtaButton place="hero" className="w-full lg:w-auto">{children}</CtaButton></div>
}
