'use client'
// Шапка лендинга: темная плашка с полями, скруглением и тонкой сиреневой кромкой (вариант B, выбор Арины 16.11,
// спецификация designer-psycont). Над шоколадным блоком не сливается: кромка и поля по краям.
// Кнопка «Первый пост» сиреневая (зеленое на шоколаде запрещено). На телефоне сначала только «Войти»: кнопка появляется,
// когда зеленая кнопка первого экрана ушла за верх (две кнопки на одно действие на одном экране не нужны).
// На компьютере кнопка видна всегда, плюс пункты по странице без подчеркиваний, прокрутка к блокам плавная (globals.css).
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLanding, CtaButton } from './LandingShell'
import { HEADER } from './content'

const NAV = [
  { href: '#how', label: 'Как это работает' },
  { href: '#pricing', label: 'Цены' },
  { href: '#faq', label: 'Вопросы' },
]

const NAV_LINK = 'inline-flex h-11 items-center rounded-xl px-3 text-[16px] text-brand-on-dark transition-colors hover:bg-white/10 hover:text-brand-bg focus-visible:outline-2 focus-visible:outline-brand-lilac'
const LOGIN = 'h-11 rounded-xl px-3 text-[16px] text-brand-bg transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand-lilac cursor-pointer'

export default function Header() {
  const { login, heroCtaGone } = useLanding()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  return (
    <header className="pointer-events-none sticky top-0 z-40 px-2 pt-2 lg:px-6 lg:pt-3">
      <div className={`pointer-events-auto mx-auto flex h-[52px] max-w-[1120px] items-center justify-between gap-2 rounded-2xl bg-brand-text px-3 ring-1 ring-brand-lilac/40 transition-shadow lg:h-14 lg:rounded-[20px] lg:px-5 ${scrolled ? 'shadow-[0_8px_24px_-8px_var(--color-brand-shadow-dark)]' : ''}`}>
        <div className="flex min-w-0 items-center">
          <Link href="/" aria-label="PsyCont, на главную" className="flex shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-lilac">
            <Image src="/brand/psycont-wordmark-light.svg" alt="PsyCont" width={105} height={32} priority className="hidden h-7 w-auto min-[361px]:block lg:h-8" />
            <Image src="/brand/psycont-icon-light.svg" alt="PsyCont" width={28} height={28} priority className="h-7 w-7 min-[361px]:hidden" />
          </Link>
          <nav aria-label="Разделы страницы" className="ml-10 hidden items-center gap-1 lg:flex">
            {NAV.map(n => <a key={n.href} href={n.href} className={NAV_LINK}>{n.label}</a>)}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button type="button" onClick={login} className={LOGIN}>{HEADER.login}</button>
          {/* телефон и планшет: только после того, как кнопка первого экрана ушла за верх; компьютер: всегда */}
          <CtaButton place="header" variant="header" className={heroCtaGone ? '' : 'max-lg:hidden'}>
            <span className="sm:hidden">{HEADER.ctaShort}</span>
            <span className="hidden sm:inline">{HEADER.cta}</span>
          </CtaButton>
        </div>
      </div>
    </header>
  )
}
