// Страница «не найдено» в бренде с общим подвалом: реквизиты видны и здесь (ЮKassa проверяет ИНН на каждой странице).
import Image from 'next/image'
import Link from 'next/link'
import SiteFooter from '@/components/site/SiteFooter'

export const metadata = { title: 'Страница не найдена · PsyCont', robots: { index: false } }

export default function NotFound() {
  return (
    <>
      <main className="flex min-h-[70dvh] flex-col items-center justify-center bg-brand-bg px-4 py-16 text-center">
        <Link href="/" aria-label="PsyCont, на главную" className="mb-8 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent">
          <Image src="/brand/psycont-wordmark.svg" alt="PsyCont" width={119} height={32} className="h-8 w-auto" priority />
        </Link>
        <h1 className="text-[26px] font-bold leading-[1.2] text-brand-text lg:text-[34px]">Такой страницы нет</h1>
        <p className="mt-3 max-w-[420px] text-[16px] leading-[1.5] text-brand-muted">Возможно, ссылка устарела или в адресе опечатка.</p>
        <Link href="/" className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-brand-accent px-6 text-[16px] font-semibold text-brand-bg transition-colors hover:bg-brand-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
          На главную
        </Link>
      </main>
      <SiteFooter />
    </>
  )
}
