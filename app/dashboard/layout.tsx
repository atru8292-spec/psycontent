'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  Target, PenTool, Layers, Zap, FileText,
  Wrench, Film, RefreshCcw, Search, History, Settings,
  LogOut, User, ChevronRight, LayoutDashboard,
} from 'lucide-react'

const navItems = [
  { icon: LayoutDashboard, label: 'Главная', href: '/dashboard', exact: true },
  { icon: Target, label: 'Паспорт бренда', href: '/dashboard/brand-passport' },
  { icon: PenTool, label: 'Генератор постов', href: '/dashboard/post-generator' },
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
  { icon: PenTool, label: 'Посты', href: '/dashboard/post-generator' },
  { icon: Zap, label: 'Хуки', href: '/dashboard/hooks-generator' },
  { icon: FileText, label: 'План', href: '/dashboard/content-plan' },
  { icon: History, label: 'История', href: '/dashboard/post-history' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<any>(null)
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('onboarding_profiles').select('full_name').eq('user_id', user.id).single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-brand-bg flex">
      {/* ─── Сайдбар (десктоп) ─── */}
      <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-brand-card border-r border-brand-border z-40 transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[240px]'}`}>
        {/* Лого */}
        <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-brand-border shrink-0 ${collapsed ? 'justify-center px-0' : ''}`}>
          {collapsed ? (
            /* Только знак, на лавандовой плитке */
            <div className="w-8 h-8 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
              <span
                className="block w-[18px] h-[18px]"
                style={{
                  maskImage: "url('/logo/out_icon_mono.svg')",
                  WebkitMaskImage: "url('/logo/out_icon_mono.svg')",
                  maskSize: 'contain',
                  WebkitMaskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  WebkitMaskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  WebkitMaskPosition: 'center',
                  backgroundColor: 'var(--color-brand-accent)',
                  display: 'block',
                }}
              />
            </div>
          ) : (
            <Image
              src="/logo/out_wordmark.svg"
              alt="PsyCont"
              width={110}
              height={28}
              className="h-7 w-auto shrink-0"
            />
          )}
        </div>

        {/* Навигация */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact)
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
          <Link href="/dashboard/settings" className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-brand-muted hover:bg-brand-soft hover:text-brand-text transition group relative ${collapsed ? 'justify-center' : ''}`}>
            <Settings className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span className="text-[13px] font-medium">Настройки</span>}
            {collapsed && <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-brand-text text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Настройки</div>}
          </Link>

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
      <main className={`flex-1 min-h-screen pb-20 lg:pb-0 transition-all duration-300 ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]'}`}>
        {/* Мобильная шапка */}
        <header className="lg:hidden sticky top-0 z-30 bg-brand-card/90 backdrop-blur border-b border-brand-border h-14 flex items-center justify-between px-4">
          <Image
            src="/logo/out_wordmark.svg"
            alt="PsyCont"
            width={90}
            height={24}
            className="h-6 w-auto"
          />
          <div className="flex items-center gap-2">
            <Link href="/dashboard/settings" className="p-2 text-brand-muted hover:text-brand-accent transition">
              <Settings className="w-5 h-5" />
            </Link>
            <button onClick={handleLogout} aria-label="Выйти из аккаунта" className="p-2 text-brand-muted hover:text-brand-accent transition cursor-pointer">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {children}
      </main>

      {/* ─── Нижняя навигация (мобилка) ─── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-brand-card border-t border-brand-border flex">
        {bottomNavItems.map((item) => {
          const active = isActive(item.href, item.exact)
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
    </div>
  )
}
