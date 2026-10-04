'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  Target, PenTool, Layers, Zap, FileText,
  Wrench, Film, RefreshCcw, Search, History, Settings,
  LogOut, User, ChevronRight, LayoutDashboard, PlusCircle, Lightbulb, AlignLeft,
} from 'lucide-react'
import { EnergyBadge, EnergyInfo } from '@/components/EnergyTariff'
import { DashboardMeContext } from '@/lib/dashboard-me'

const navItems = [
  { icon: LayoutDashboard, label: 'Главная', href: '/dashboard', exact: true },
  { icon: Target, label: 'Паспорт бренда', href: '/dashboard/brand-passport' },
  { icon: PenTool, label: 'Сделать', href: '/dashboard/make' },
  { icon: Layers, label: 'Карусели', href: '/dashboard/carousel-generator' },
  { icon: Zap, label: 'Хуки', href: '/dashboard/hooks-generator' },
  { icon: Film, label: 'Рилс-скрипты', href: '/dashboard/reels' },
  { icon: FileText, label: 'Контент-план', href: '/dashboard/content-plan' },
  { icon: Wrench, label: 'Исследование тем', href: '/dashboard/research' },
  { icon: RefreshCcw, label: 'Переписать текст', href: '/dashboard/rewrite' },
  { icon: Search, label: 'Анализ конкурентов', href: '/dashboard/competitor-analysis' },
  { icon: History, label: 'История постов', href: '/dashboard/post-history' },
]

const bottomNavItems = [
  { icon: LayoutDashboard, label: 'Главная', href: '/dashboard', exact: true },
  { icon: PenTool, label: 'Сделать', href: '/dashboard/make' },
  { icon: Zap, label: 'Хуки', href: '/dashboard/hooks-generator' },
  { icon: FileText, label: 'План', href: '/dashboard/content-plan' },
  { icon: History, label: 'История', href: '/dashboard/post-history' },
]

// Новое меню из 4 пунктов (задача sdelat-i-brend, раздел 2). Видят только те, у кого включен новый мозг
// (newPipeline из /api/me), остальным пока старое меню. «Темы» это вкладки «Идеи · План» в контент-плане.
const newNavItems = [
  { icon: PlusCircle, label: 'Сделать', href: '/dashboard/make', also: [] as string[] },
  { icon: Lightbulb, label: 'Темы', href: '/dashboard/content-plan', also: ['/dashboard/research'] },
  { icon: AlignLeft, label: 'Мои тексты', href: '/dashboard/post-history', also: [] as string[] },
  { icon: User, label: 'Профиль', href: '/dashboard/settings', also: ['/dashboard/voice', '/dashboard/edit-profile', '/dashboard/brand-passport'] },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<any>(null)
  // 'loading' пока проверяем; 'ready' — профиль есть, рендерим кабинет;
  // 'redirecting' — нет профиля/сессии, уводим (кабинет НЕ рендерим).
  const [status, setStatus] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading')
  const [collapsed, setCollapsed] = useState(false)
  // Сводка энергии тянется один раз в layout и отдается обоим бейджам (десктоп + мобилка)
  const [energy, setEnergy] = useState<any>(null)
  // Ждем /api/me, чтобы человек с новым мозгом не видел, как мелькает старое меню
  const [meLoaded, setMeLoaded] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  // Пока поле ввода в фокусе, таб-бар уезжает вниз: на iPhone клавиатура и так съедает пол-экрана
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'color', 'file', 'range'].includes((t as HTMLInputElement).type)) || t.isContentEditable)
    const on = (e: FocusEvent) => { if (isField(e.target)) setTyping(true) }
    // с поля на поле не дергаем бар; а если поле исчезло из DOM, focusout может не прийти, поэтому
    // после кадра смотрим, где фокус на самом деле
    const off = (e: FocusEvent) => {
      if (isField(e.relatedTarget)) return
      requestAnimationFrame(() => setTyping(isField(document.activeElement)))
    }
    document.addEventListener('focusin', on)
    document.addEventListener('focusout', off)
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off) }
  }, [])

  // на новой странице поле из старой уже не в фокусе
  useEffect(() => { setTyping(false) }, [pathname])

  useEffect(() => {
    let on = true
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then((j) => { if (on) setEnergy(j) }).catch(() => {}).finally(() => { if (on) setMeLoaded(true) })
    return () => { on = false }
  }, [])

  const newMenu = energy?.newPipeline === true
  // В новом меню нет «Главной»: кабинет открывается на «Создать»
  useEffect(() => {
    if (newMenu && pathname === '/dashboard') router.replace('/dashboard/make')
  }, [newMenu, pathname, router])

  // Guard: в кабинет пускаем только юзера с заполненным профилем.
  // Используем тот же запрос профиля, что и для имени в сайдбаре.
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return
      if (!user) { setStatus('redirecting'); router.replace('/'); return }
      supabase.from('onboarding_profiles').select('full_name').eq('user_id', user.id).single()
        .then(({ data, error }) => {
          if (!active) return
          // PGRST116 = строки нет (нет профиля) -> ведем на короткий онбординг
          if (error && error.code === 'PGRST116') { setStatus('redirecting'); router.replace('/onboarding/express'); return }
          // иная ошибка = сбой чтения (права/сеть). НЕ выкидываем на онбординг (была петля), показываем мягкий повтор
          if (error || !data) { setStatus('error'); return }
          setProfile(data)
          setStatus('ready')
        })
    })
    return () => { active = false }
  }, [router])

  // Сбой чтения профиля: мягкий повтор, НЕ выкидываем на онбординг.
  if (status === 'error') {
    return (
      <div className="min-h-dvh bg-brand-bg flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-brand-text font-semibold mb-2">Не удалось загрузить профиль</p>
          <p className="text-sm text-brand-muted mb-4">Похоже, временный сбой связи. Попробуй обновить страницу.</p>
          <button onClick={() => window.location.reload()} className="btn-primary px-5 py-2.5 text-sm">Обновить</button>
        </div>
      </div>
    )
  }

  // Пока идет проверка или уже уводим — не мигаем кабинетом.
  if (status !== 'ready' || !meLoaded || (newMenu && pathname === '/dashboard')) {
    return (
      <div className="min-h-dvh bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (href: string, exact?: boolean, also?: string[]) => {
    if (exact) return pathname === href
    return pathname.startsWith(href) || !!also?.some(a => pathname.startsWith(a))
  }
  const sideItems: { icon: any; label: string; href: string; exact?: boolean; also?: string[] }[] = newMenu ? newNavItems : navItems
  const bottomItems: { icon: any; label: string; href: string; exact?: boolean; also?: string[] }[] = newMenu ? newNavItems : bottomNavItems

  return (
    <div className="min-h-dvh bg-brand-bg flex">
      {/* ─── Сайдбар (десктоп) ─── */}
      <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-brand-card border-r border-brand-border z-40 transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[240px]'}`}>
        {/* Лого */}
        <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-brand-border shrink-0 ${collapsed ? 'justify-center px-0' : ''}`}>
          {collapsed ? (
            /* Только знак: на светлом фоне он всегда в темно-зеленом круге (out_icon.svg) */
            <Image src="/logo/out_icon.svg" alt="PsyCont" width={36} height={36} className="w-9 h-9 shrink-0" />
          ) : (
            <Image
              src="/logo/out_wordmark.svg"
              alt="PsyCont"
              width={104}
              height={28}
              className="h-7 w-auto shrink-0"
            />
          )}
        </div>

        {/* Навигация */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {sideItems.map((item) => {
            const active = isActive(item.href, item.exact, item.also)
            return (
              <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-0.5 transition-all group relative ${
                  active
                    ? 'bg-brand-accent text-white shadow-sm'
                    : 'text-brand-muted hover:bg-brand-soft hover:text-brand-text'
                } ${collapsed ? 'justify-center' : ''}`}>
                <item.icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-white' : ''}`} />
                {!collapsed && <span className="text-[13px] font-medium truncate">{item.label}</span>}
                {collapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-brand-text text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    {item.label}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Низ сайдбара */}
        <div className="border-t border-brand-border p-3 space-y-1 shrink-0">
          {/* Энергия, всегда на глазах */}
          {collapsed ? (
            <Link href="/dashboard/settings#energy" title="Энергия и тариф" className="flex items-center justify-center py-2.5 rounded-2xl text-brand-muted hover:bg-brand-soft hover:text-brand-text transition">
              <Zap className="w-[18px] h-[18px] text-brand-sage" />
            </Link>
          ) : (
            <div className="flex items-center gap-1 px-1 pb-1">
              <EnergyBadge data={energy} />
              <EnergyInfo placement="sidebar" />
            </div>
          )}

          {!newMenu && <Link href="/dashboard/settings" className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-brand-muted hover:bg-brand-soft hover:text-brand-text transition group relative ${collapsed ? 'justify-center' : ''}`}>
            <Settings className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span className="text-[13px] font-medium">Настройки</span>}
            {collapsed && <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-brand-text text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Настройки</div>}
          </Link>}

          <div className={`flex items-center gap-3 px-3 py-2.5 mt-1 rounded-2xl bg-brand-soft ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-7 h-7 rounded-full bg-brand-soft-2 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-brand-accent" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-brand-text truncate">{profile?.full_name || '...'}</p>
              </div>
            )}
            <button onClick={handleLogout} title="Выйти" className="text-brand-muted hover:text-brand-accent transition cursor-pointer shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"} className="w-full flex items-center justify-center py-1.5 text-brand-muted hover:text-brand-text transition cursor-pointer">
            <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </aside>

      {/* ─── Основной контент ─── */}
      <main className={`flex-1 min-w-0 min-h-dvh lg:pb-0 transition-all duration-300 ${newMenu ? 'pb-[calc(56px+env(safe-area-inset-bottom)+16px)]' : 'pb-20'} ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]'}`}>
        {/* Мобильная шапка: под вырезом iPhone отступ safe-area */}
        <header className="lg:hidden sticky top-0 z-30 bg-brand-card/90 backdrop-blur border-b border-brand-border h-14 box-content pt-[env(safe-area-inset-top)] flex items-center justify-between px-4">
          <Image
            src="/logo/out_wordmark.svg"
            alt="PsyCont"
            width={89}
            height={24}
            className="h-6 w-auto"
          />
          <div className="flex items-center gap-2">
            <EnergyBadge compact data={energy} />
            <EnergyInfo placement="header" />
            {!newMenu && <Link href="/dashboard/settings" className="w-11 h-11 flex items-center justify-center text-brand-muted hover:text-brand-accent transition">
              <Settings className="w-5 h-5" />
            </Link>}
            <button onClick={handleLogout} aria-label="Выйти из аккаунта" className="w-11 h-11 flex items-center justify-center text-brand-muted hover:text-brand-accent transition cursor-pointer">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <DashboardMeContext.Provider value={{ me: energy, loaded: meLoaded, typing }}>{children}</DashboardMeContext.Provider>
      </main>

      {/* ─── Нижняя навигация (мобилка) ─── */}
      {newMenu ? (
        // Новое меню: 56 px плюс safe-area, четыре равные колонки, активный пункт с плашкой за иконкой.
        // Пока поле в фокусе, бар уезжает вниз (z: таб-бар 40, листы 50, тост 60)
        <nav aria-label="Разделы" className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-brand-card border-t border-brand-border flex h-14 box-content pb-[env(safe-area-inset-bottom)] transition-transform duration-150 motion-reduce:transition-none ${typing ? 'translate-y-full' : ''}`}
          {...(typing ? { inert: true, 'aria-hidden': true } : {})}>
          {bottomItems.map((item) => {
            const active = isActive(item.href, item.exact, item.also)
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-brand-accent ${active ? 'text-brand-accent' : 'text-brand-muted'}`}>
                <span className={`flex items-center justify-center w-14 h-7 rounded-full ${active ? 'bg-brand-soft' : ''}`}>
                  <item.icon className="w-6 h-6" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span className={`text-[11px] leading-[14px] whitespace-nowrap ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      ) : (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-brand-card border-t border-brand-border flex h-16 box-content pb-[env(safe-area-inset-bottom)]">
        {bottomItems.map((item) => {
          const active = isActive(item.href, item.exact, item.also)
          return (
            <Link key={item.href} href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition relative ${active ? 'text-brand-accent' : 'text-brand-muted'}`}>
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {active && <span className="absolute bottom-0 w-8 h-0.5 bg-brand-accent rounded-t-full" />}
            </Link>
          )
        })}
      </nav>
      )}
    </div>
  )
}
