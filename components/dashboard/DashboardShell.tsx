'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LegalLine } from '@/components/site/SiteFooter'
import { supabase } from '@/lib/supabase'
import { PenLine, Lightbulb, List, User, LogOut, CircleHelp, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { DashboardMeContext } from '@/lib/dashboard-me'
import ScreenTracker from '@/components/analytics/ScreenTracker'
import { isMaterials, TARIFF_HREF, END, type Materials } from '@/lib/limit-texts'
import { dateRu } from '@/lib/billing/pay-texts'
import { QUIET_BTN } from '@/lib/ui-classes'

// Меню кабинета, вариант А (макеты A1, A2, A8, A11; 17.11). Один набор пунктов для всех: «Написать», «Темы»,
// «Мои тексты», «Настройки», внизу «Помощь». Старые экраны (карусели, хуки, рилс, рерайт, анализ конкурента,
// исследование тем) открываются по прямой ссылке; паспорт бренда и голос входят в «Настройки», исследование в «Темы».
type NavItem = { icon: typeof PenLine; label: string; href: string; also: string[] }
const NAV: NavItem[] = [
  { icon: PenLine, label: 'Написать', href: '/dashboard/make', also: ['/dashboard/post-generator'] },
  { icon: Lightbulb, label: 'Темы', href: '/dashboard/content-plan', also: ['/dashboard/research'] },
  { icon: List, label: 'Мои тексты', href: '/dashboard/post-history', also: [] },
  { icon: User, label: 'Настройки', href: '/dashboard/settings', also: ['/dashboard/voice', '/dashboard/edit-profile', '/dashboard/brand-passport', '/dashboard/pomosch'] },
]
const HELP_HREF = '/dashboard/pomosch'

// Режим фокуса (карусель на компьютере, макет A2): меню сворачивается в иконки 72 px, блока остатка нет.
// Публичный способ: экран зовет useShellFocus(true), пока открыт; когда компонент размонтирован или передал false,
// меню возвращается. Счетчик, а не флаг: два источника фокуса друг друга не сбрасывают.
const ShellFocusContext = createContext<(delta: 1 | -1) => void>(() => {})
export function useShellFocus(on: boolean) {
  const bump = useContext(ShellFocusContext)
  useEffect(() => {
    if (!on) return
    bump(1)
    return () => bump(-1)
  }, [on, bump])
}

// Склонение без зависимости от limit-texts (там свои тексты пилюли, тут подписи блока меню)
const pl = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<any>(null)
  // 'loading' пока проверяем; 'ready' — профиль есть, рендерим кабинет;
  // 'redirecting' — нет профиля/сессии, уводим (кабинет НЕ рендерим).
  const [status, setStatus] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading')
  // свернуть меню руками (было и раньше); режим фокуса сворачивает его сам
  const [collapsed, setCollapsed] = useState(false)
  const [focusCount, setFocusCount] = useState(0)
  const bumpFocus = useCallback((d: 1 | -1) => setFocusCount(c => Math.max(0, c + d)), [])
  // Сводка /api/me тянется один раз в layout и отдается страницам через DashboardMeContext
  const [energy, setEnergy] = useState<any>(null)
  // Ждем /api/me, чтобы человек с новым мозгом не видел, как мелькает старая главная
  const [meLoaded, setMeLoaded] = useState(false)
  // До какого числа оплачен тариф (только на платном): подпись «до 17 декабря» в блоке остатка
  const [paidUntil, setPaidUntil] = useState<string | null>(null)
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
  // Перечитать сводку после генерации (остаток текстов в меню и на «Написать»). Сбой оставляет прошлую
  const refreshMe = useCallback(() => {
    fetch('/api/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setEnergy(j) }).catch(() => {})
  }, [])
  const materials: Materials | null = isMaterials(energy?.materials) ? energy.materials : null
  const monthly = materials?.kind === 'month'
  // дата окончания окна только у платного; пробным второй запрос не нужен
  useEffect(() => {
    if (!monthly) return
    let on = true
    fetch('/api/pay/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (on) setPaidUntil(j?.paid && j.until ? j.until : null) }).catch(() => {})
    return () => { on = false }
  }, [monthly])

  // значение контекста одно на сводку: иначе каждое нажатие в поле (typing) давало новый объект me и страницы,
  // которые ждут me в зависимостях эффекта, перечитывали свои данные
  const meValue = useMemo(() => (energy ? { ...energy, paidUntil } : energy), [energy, paidUntil])
  const ctx = useMemo(() => ({ me: meValue, loaded: meLoaded, typing, refresh: refreshMe }), [meValue, meLoaded, typing, refreshMe])

  const newMenu = energy?.newPipeline === true
  // С новым мозгом «Главной» нет: кабинет открывается на «Написать».
  // Только после guard (status ready): иначе у человека без профиля этот переход перебивал уход
  // в онбординг, guard уже стоял в 'redirecting', и кабинет навсегда оставался кружком (16.11)
  useEffect(() => {
    if (status === 'ready' && newMenu && pathname === '/dashboard') router.replace('/dashboard/make')
  }, [status, newMenu, pathname, router])

  // Уводим и страхуемся: если клиентский переход кто-то перебил и мы все еще здесь, уходим полной загрузкой
  const leave = (to: string) => {
    setStatus('redirecting')
    router.replace(to)
    window.setTimeout(() => { if (window.location.pathname !== to) window.location.replace(to) }, 2500)
  }

  // Guard: в кабинет пускаем только юзера с заполненным профилем.
  // Используем тот же запрос профиля, что и для имени в меню.
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return
      if (!user) { leave('/'); return }
      supabase.from('onboarding_profiles').select('full_name').eq('user_id', user.id).maybeSingle()
        .then(({ data, error }) => {
          if (!active) return
          // строки нет (нет профиля) -> ведем на короткий онбординг. maybeSingle не дает 406 в консоли
          if (!error && !data) { leave('/onboarding/express'); return }
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
          <p className="text-brand-text font-semibold mb-2">Не получилось загрузить кабинет</p>
          <p className="text-sm text-brand-muted mb-4">Похоже, временный сбой связи. Обнови страницу.</p>
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

  const isActive = (item: { href: string; also: string[] }) =>
    pathname.startsWith(item.href) || item.also.some(a => pathname.startsWith(a))
  const focus = focusCount > 0
  const slim = collapsed || focus
  const onPay = pathname.startsWith('/dashboard/oplata')
  // Реквизиты продавца в кабинете только в «Настройках» и «Помощи» (лендинг и /offer их показывают всем)
  // реквизиты продавца на всех экранах кабинета, как раньше: ЮKassa проверяет ИНН на страницах (ревью 17.11)
  const legal = true
  const name = (profile?.full_name || '').trim()
  // со старым мозгом «Главная» жива: знак ведет туда; с новым на «Написать»
  const homeHref = newMenu ? '/dashboard/make' : '/dashboard'

  return (
    <div className="min-h-dvh bg-brand-bg flex">
      {/* ─── Меню слева (компьютер) ─── */}
      <aside aria-label="Меню" className={`hidden lg:flex flex-col fixed top-0 left-0 h-dvh bg-brand-card border-r border-brand-border z-40 transition-[width] duration-200 motion-reduce:transition-none ${slim ? 'w-[72px] px-3' : 'w-[240px] px-4'} py-5`}>
        <div className={`flex items-center shrink-0 mb-7 ${slim ? 'flex-col gap-3' : 'justify-between pl-2'}`}>
          <Link href={homeHref} aria-label="PsyCont" className="rounded-xl focus-visible:outline-2 focus-visible:outline-brand-accent">
            {slim
              ? <Image src="/brand/psycont-icon.svg" alt="" width={36} height={36} className="w-9 h-9" />
              : <Image src="/brand/psycont-wordmark.svg" alt="" width={112} height={30} className="h-[30px] w-auto" />}
          </Link>
          {/* в режиме фокуса меню свернуто самим экраном, кнопка не нужна */}
          {!focus && (
            <button type="button" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-brand-muted hover:text-brand-text hover:bg-brand-soft-2 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent">
              {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            </button>
          )}
        </div>

        <nav aria-label="Разделы" className={`flex flex-col gap-1 ${slim ? 'items-center' : ''}`}>
          {NAV.map((item) => {
            const active = isActive(item)
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} aria-label={slim ? item.label : undefined}
                className={`group relative flex items-center rounded-xl text-brand-text transition focus-visible:outline-2 focus-visible:outline-brand-accent ${slim ? 'w-12 h-11 justify-center' : 'h-11 gap-3 px-3 text-[15px] font-medium'} ${active ? 'bg-brand-soft' : 'hover:bg-brand-soft-2'}`}>
                <item.icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.1 : 1.8} />
                {!slim && <span className="truncate">{item.label}</span>}
                {slim && <span role="tooltip" className="absolute left-full ml-3 px-2.5 py-1.5 bg-brand-text text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className={`mt-auto ${slim ? 'flex flex-col items-center gap-1' : ''}`}>
          {/* остаток: на компьютере один раз, здесь; в режиме фокуса и в свернутом меню его нет */}
          {!slim && materials && <MenuBalance m={materials} until={paidUntil} />}

          <Link href={HELP_HREF} aria-current={pathname.startsWith(HELP_HREF) ? 'page' : undefined} aria-label={slim ? 'Помощь' : undefined}
            className={`group relative flex items-center rounded-xl hover:text-brand-text transition focus-visible:outline-2 focus-visible:outline-brand-accent ${slim ? 'w-12 h-11 justify-center' : 'h-11 gap-2 px-3 mt-2 text-[13px] font-medium'} ${pathname.startsWith(HELP_HREF) ? 'text-brand-text bg-brand-soft' : 'text-brand-muted'}`}>
            <CircleHelp className="w-[18px] h-[18px] shrink-0" />
            {!slim && 'Помощь'}
            {slim && <span role="tooltip" className="absolute left-full ml-3 px-2.5 py-1.5 bg-brand-text text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">Помощь</span>}
          </Link>

          <div className={`flex items-center border-t border-brand-border ${slim ? 'flex-col gap-1 pt-3 mt-2 w-full' : 'gap-2.5 pt-4 mt-3 pl-3'}`}>
            <span aria-hidden className="w-8 h-8 rounded-full bg-brand-soft flex items-center justify-center text-[13px] font-semibold text-brand-text shrink-0">{name ? name[0].toUpperCase() : <User className="w-4 h-4" />}</span>
            {!slim && <span className="flex-1 min-w-0 truncate text-sm font-medium text-brand-text">{name || 'Без имени'}</span>}
            <button type="button" onClick={handleLogout} aria-label="Выйти из аккаунта" title="Выйти"
              className="w-11 h-11 flex items-center justify-center rounded-xl text-brand-muted hover:text-brand-text hover:bg-brand-soft-2 transition cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-brand-accent">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Основной контент ─── */}
      <main className={`flex-1 min-w-0 min-h-dvh lg:pb-0 ${onPay ? 'pb-0' : 'pb-[calc(56px+env(safe-area-inset-bottom)+16px)]'} ${slim ? 'lg:ml-[72px]' : 'lg:ml-[240px]'}`}>
        {/* Шапка телефона: только знак. Остатка тут нет (он под кнопкой «Написать» и в «Настройках»), выход в «Настройках» */}
        <header className="lg:hidden sticky top-0 z-30 bg-brand-bg/90 backdrop-blur h-14 box-content pt-[env(safe-area-inset-top)] flex items-center px-4">
          <Link href={homeHref} aria-label="PsyCont" className="h-11 flex items-center">
            <Image src="/brand/psycont-wordmark.svg" alt="" width={89} height={24} className="h-6 w-auto" />
          </Link>
        </header>

        <ScreenTracker />
        <ShellFocusContext.Provider value={bumpFocus}>
          {/* me.paidUntil: до какого числа оплачен тариф (ISO или null), для строки «до 12 декабря» на «Написать» */}
          <DashboardMeContext.Provider value={ctx}>{children}</DashboardMeContext.Provider>
        </ShellFocusContext.Provider>
        {/* на телефоне на «Написать» снизу липкая кнопка или панель (~80 px): реквизиты не должны уходить под нее */}
        {legal && <LegalLine className={`mx-auto w-full max-w-5xl px-4 pt-10 md:px-6 lg:px-12 lg:pb-6 ${pathname.startsWith('/dashboard/make') ? 'max-lg:pb-28' : 'pb-6'}`} />}
      </main>

      {/* ─── Нижнее меню (телефон): 4 пункта с подписями, высота 56 px (на нее опираются липкие панели MakeFlow и FormatPane). Пока поле в фокусе, уезжает вниз (z: меню 40, листы 50, тост 60) ─── */}
      {!onPay && (
        <nav aria-label="Разделы" className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-brand-card border-t border-brand-border flex h-14 box-content pb-[env(safe-area-inset-bottom)] transition-transform duration-150 motion-reduce:transition-none ${typing ? 'translate-y-full' : ''}`}
          {...(typing ? { inert: true, 'aria-hidden': true } : {})}>
          {NAV.map((item) => {
            const active = isActive(item)
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-brand-accent ${active ? 'text-brand-text' : 'text-brand-muted'}`}>
                <span className={`flex items-center justify-center w-14 h-7 rounded-full ${active ? 'bg-brand-soft' : ''}`}>
                  <item.icon className={`w-6 h-6 ${active ? 'text-brand-accent' : ''}`} strokeWidth={active ? 2.1 : 1.75} />
                </span>
                <span className={`text-[12px] leading-[14px] whitespace-nowrap ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}

// Блок остатка внизу меню (A1, A8): пробные точками, платный полосой. Ведет к тарифам в «Настройках».
function MenuBalance({ m, until }: { m: Materials; until: string | null }) {
  const trial = m.kind === 'trial'
  const left = Math.max(0, m.remaining)
  const empty = left === 0
  const title = empty
    ? (trial ? END.trial.short : END.month.title())
    : `Осталось ${left} из ${m.cap}`
  const sub = empty
    ? 'Все написанное на месте'
    : trial ? 'пробных текстов' : `текстов${until ? ` до ${dateRu(until)}` : ' в этом месяце'}`
  const dots = trial && m.cap <= 12
  return (
    <div className="rounded-2xl bg-brand-soft-2 px-3 py-3.5">
      <p className="text-sm font-semibold text-brand-text tabular-nums">{title}</p>
      <p className="mt-0.5 text-[13px] leading-[18px] text-brand-muted">{sub}</p>
      <div className="mt-2.5" role="img" aria-label={trial ? `${pl(left, 'Остался', 'Осталось', 'Осталось')} ${left} ${pl(left, 'пробный текст', 'пробных текста', 'пробных текстов')} из ${m.cap}` : `Осталось ${left} из ${m.cap} текстов`}>
        {dots ? (
          <div className="flex gap-[5px]">
            {Array.from({ length: m.cap }, (_, i) => (
              <i key={i} className={`block w-2.5 h-2.5 rounded-full ${i < left ? 'bg-brand-lilac shadow-[inset_0_0_0_1.5px_var(--color-brand-text)]' : 'bg-brand-border'}`} />
            ))}
          </div>
        ) : (
          <div className="h-2.5 rounded-full bg-brand-border overflow-hidden">
            <div className="h-full rounded-full bg-brand-lilac shadow-[inset_0_0_0_1.5px_var(--color-brand-text)]" style={{ width: `${m.cap > 0 ? Math.min(100, Math.round((left / m.cap) * 100)) : 0}%` }} />
          </div>
        )}
      </div>
      <Link href={TARIFF_HREF} className={`mt-2.5 w-full ${QUIET_BTN}`}>Посмотреть тарифы</Link>
    </div>
  )
}
