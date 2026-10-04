'use client'
// Шапка кабинета: пять разделов, переключатель служебных, выход в продукт. Режим (служебные, период, демо)
// живет в адресе, поэтому переключатель это ссылка: страница пересобирается на сервере.

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { ArrowUpRight } from 'lucide-react'

const NAV = [
  { href: '/admin', label: 'Сводка' },
  { href: '/admin/people', label: 'Люди' },
  { href: '/admin/funnels', label: 'Воронки' },
  { href: '/admin/features', label: 'Функции' },
  { href: '/admin/costs', label: 'Деньги' },
]

export default function AdminNav({ demoAllowed }: { demoAllowed: boolean }) {
  const path = usePathname()
  const sp = useSearchParams()
  const all = sp.get('all') === '1'
  const demo = demoAllowed && sp.get('demo') === '1'
  const activeRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => { activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }, [path])

  // переходы между разделами сохраняют служебных, период и демо, но не фильтры экрана
  const keep = (extra: Record<string, string | null> = {}) => {
    const q = new URLSearchParams()
    for (const k of ['all', 'p', 'demo']) { const v = sp.get(k); if (v) q.set(k, v) }
    for (const [k, v] of Object.entries(extra)) { if (v === null) q.delete(k); else q.set(k, v) }
    return q.toString()
  }
  const go = (h: string) => { const q = keep(); return q ? `${h}?${q}` : h }
  const isActive = (h: string) => (h === '/admin' ? path === '/admin' : path.startsWith(h))
  const toggleHref = (() => {
    const q = new URLSearchParams(sp.toString())
    if (all) q.delete('all'); else q.set('all', '1')
    const s = q.toString()
    return s ? `${path}?${s}` : path
  })()

  const Switch = ({ short }: { short?: boolean }) => (
    <Link href={toggleHref} role="switch" aria-checked={all} className="inline-flex items-center gap-2 min-h-11 text-[14px] focus-visible:outline-2 outline-offset-2 outline-brand-accent rounded-lg">
      <span className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${all ? 'bg-brand-accent' : 'bg-brand-border'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${all ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {short ? 'Служебные' : 'Показать служебных'}
    </Link>
  )

  return (
    <>
      {demo && <div className="bg-brand-soft text-brand-text text-[13px] py-2 px-4 text-center">Демо-данные. Люди выдуманные, чтобы посмотреть экраны</div>}
      <header className="lg:sticky top-0 z-30 bg-brand-bg/95 backdrop-blur border-b border-brand-border">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="hidden lg:flex h-14 items-center gap-8">
            <span className="font-semibold">PsyCont · кабинет</span>
            <nav className="flex gap-6 h-full" aria-label="Разделы">
              {NAV.map(n => (
                <Link key={n.href} href={go(n.href)} aria-current={isActive(n.href) ? 'page' : undefined}
                  className={`relative inline-flex items-center h-full ${isActive(n.href) ? 'text-brand-text font-medium' : 'text-brand-muted hover:text-brand-text'}`}>
                  {n.label}
                  {isActive(n.href) && <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-brand-accent" />}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-5">
              <Switch />
              <Link href="/dashboard" className="inline-flex items-center gap-1 text-brand-muted hover:text-brand-text">В продукт <ArrowUpRight size={16} aria-hidden /></Link>
            </div>
          </div>
          <div className="lg:hidden">
            <div className="flex h-14 items-center gap-3">
              <span className="font-semibold">Кабинет</span>
              <div className="ml-auto flex items-center gap-1">
                <Switch short />
                <Link href="/dashboard" aria-label="В продукт" className="inline-flex items-center justify-center w-11 h-11 text-brand-muted"><ArrowUpRight size={20} /></Link>
              </div>
            </div>
            <nav className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-3 snap-x [scrollbar-width:none]" aria-label="Разделы">
              {NAV.map(n => {
                const on = isActive(n.href)
                return (
                  <Link key={n.href} ref={on ? activeRef : undefined} href={go(n.href)} aria-current={on ? 'page' : undefined}
                    className={`inline-flex items-center h-11 px-4 rounded-full shrink-0 snap-start text-[14px] ${on ? 'bg-brand-accent text-white' : 'bg-brand-card border border-brand-border'}`}>
                    {n.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      </header>
      {all && <div className="bg-brand-soft-2 text-[13px] px-4 py-2 text-center">Служебные аккаунты сейчас тоже посчитаны</div>}
    </>
  )
}
