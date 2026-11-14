// Общий вид страниц /offer и /privacy: шапка с логотипом, узкая колонка текста на креме, подвал с реквизитами.
// Мобильная версия главная: текст 16 px, строка до 720 px, разделы с номерами, длинных таблиц нет.
import Image from 'next/image'
import Link from 'next/link'
import SiteFooter from './SiteFooter'
import CookieNote from './CookieNote'
import DocView from './DocView'
import { DOCS_DATE } from '@/lib/rekvizity'

export default function LegalPage({ title, lead, doc, children }: { title: string; lead?: string; doc: 'offer' | 'privacy' | 'soglasie'; children: React.ReactNode }) {
  return (
    <>
      <DocView doc={doc} />
      <header className="border-b border-brand-border bg-brand-bg">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-3 px-4 md:px-8 lg:h-[72px]">
          <Link href="/" aria-label="PsyCont, на главную" className="flex shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent">
            <Image src="/brand/psycont-wordmark.svg" alt="PsyCont" width={119} height={32} priority className="h-8 w-auto" />
          </Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-xl px-3 text-[16px] text-brand-text transition-colors hover:bg-brand-card focus-visible:outline-2 focus-visible:outline-brand-accent">На главную</Link>
        </div>
      </header>
      <main className="bg-brand-bg">
        <article className="mx-auto w-full max-w-[760px] px-4 pt-8 pb-14 md:px-8 lg:pt-14 lg:pb-24">
          <h1 className="text-[28px] font-bold leading-[1.15] text-brand-text [text-wrap:balance] lg:text-[40px]">{title}</h1>
          <p className="mt-3 text-[15px] text-brand-muted">Редакция от {DOCS_DATE}</p>
          {lead && <p className="mt-5 text-[17px] leading-[1.55] text-brand-text lg:text-[19px]">{lead}</p>}
          <div className="mt-8 space-y-9 lg:mt-10 lg:space-y-11">{children}</div>
        </article>
      </main>
      <SiteFooter />
      <CookieNote />
    </>
  )
}

// Раздел документа: номер и заголовок, под ним абзацы и списки
export function Part({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[21px] font-bold leading-[1.25] text-brand-text lg:text-[25px]">{n}. {title}</h2>
      <div className="mt-3 space-y-3 text-[16px] leading-[1.6] text-brand-text lg:text-[17px]">{children}</div>
    </section>
  )
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="relative pl-5">
          <span aria-hidden className="absolute top-[0.7em] left-0 h-1.5 w-1.5 rounded-full bg-brand-accent" />
          {it}
        </li>
      ))}
    </ul>
  )
}

// Плашка на бледной сирени с рамкой: то, что важно не пропустить
export function Callout({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-brand-border-soft bg-brand-soft-2 px-4 py-3.5 text-[16px] leading-[1.55] text-brand-text lg:px-5 lg:py-4">{children}</div>
}
