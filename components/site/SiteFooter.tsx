// Реквизиты и ссылки на оферту и политику: на всех страницах сайта (ЮKassa проверяет ИНН на каждой).
// SiteFooter: подвал на шоколаде для лендинга, /offer и /privacy. LegalLine: короткая строка для кабинета и страниц входа.
// На пяти экранах знакомства подвала нет (решение Арины 14.11): они на весь экран телефона с кнопкой внизу.
// Данные только из lib/rekvizity.ts. Ссылки здесь настоящие ссылки на страницы, поэтому с подчеркиванием по наведению.
import Image from 'next/image'
import Link from 'next/link'
import { REKV, OFFER_PATH, PRIVACY_PATH } from '@/lib/rekvizity'

const LINK = 'underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none'

export function Rekvizity({ className = '' }: { className?: string }) {
  return (
    <p className={className}>
      {REKV.fio}, {REKV.status}. ИНН{' '}{REKV.inn}
      <br />
      <a href={REKV.phoneHref} className={`whitespace-nowrap ${LINK}`}>{REKV.phone}</a>
      {REKV.email && <>{' · '}<a href={`mailto:${REKV.email}`} className={LINK}>{REKV.email}</a></>}
    </p>
  )
}

export default function SiteFooter({ slogan }: { slogan?: string }) {
  const year = new Date().getFullYear()
  return (
    <footer className="bg-brand-text py-8 text-brand-bg lg:py-14">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 md:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/" aria-label="PsyCont, на главную" className="inline-block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-bg">
            <Image src="/brand/psycont-wordmark-light.svg" alt="PsyCont" width={131} height={40} className="h-10 w-auto" />
          </Link>
          {slogan && <p className="mt-3 text-[15px] text-brand-on-dark">{slogan}</p>}
        </div>
        <div className="flex flex-col gap-3 text-[15px] leading-[1.5] lg:items-end lg:text-right">
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-brand-bg">
            <Link href={OFFER_PATH} className={LINK}>Оферта</Link>
            <Link href={PRIVACY_PATH} className={LINK}>Политика конфиденциальности</Link>
          </p>
          <Rekvizity className="text-brand-on-dark" />
          <p className="text-[14px] text-brand-on-dark-muted">© {year} PsyCont</p>
        </div>
      </div>
    </footer>
  )
}

// Короткая строка для кабинета и страниц входа: те же реквизиты и ссылки, тихо, под содержимым страницы
export function LegalLine({ className = '' }: { className?: string }) {
  return (
    <div className={`text-[13px] leading-[1.5] text-brand-muted ${className}`}>
      <Rekvizity />
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <Link href={OFFER_PATH} className={LINK}>Оферта</Link>
        <Link href={PRIVACY_PATH} className={LINK}>Политика конфиденциальности</Link>
      </p>
    </div>
  )
}
