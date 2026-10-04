'use client'
// Шапка лендинга: липкая, низкая. Кнопка тут вторичная: основная на первом экране.
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLanding, CtaButton } from './LandingShell'
import { HEADER } from './content'

export default function Header() {
  const { login } = useLanding()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={`sticky top-0 z-40 bg-brand-bg bg-[url('/paper-grain.png')] bg-[length:128px_128px] transition-colors ${scrolled ? 'border-b border-brand-border' : 'border-b border-transparent'}`}>
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-3 px-4 md:px-8 lg:h-[72px]">
        <Link href="/" aria-label="PsyCont, на главную" className="flex shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent">
          <Image src="/brand/psycont-wordmark.svg" alt="PsyCont" width={119} height={32} priority className="hidden h-8 w-auto min-[361px]:block" />
          <Image src="/brand/psycont-icon.svg" alt="PsyCont" width={32} height={32} priority className="h-8 w-8 min-[361px]:hidden" />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={login} className="h-11 rounded-xl px-3 text-[16px] text-brand-text hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-accent cursor-pointer">
            {HEADER.login}
          </button>
          <CtaButton place="header" variant="secondary" className="!h-11 !px-4 !text-[15px]">
            <span className="sm:hidden">{HEADER.ctaShort}</span>
            <span className="hidden sm:inline">{HEADER.cta}</span>
          </CtaButton>
        </div>
      </div>
    </header>
  )
}
