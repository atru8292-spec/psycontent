// Общие детали кабинета /admin (серверные, без состояния). Спецификация дизайнера: тени и декора нет,
// числа ровные (tabular-nums на корне), мельче 13 px ничего, красного нет, слово всегда внутри бейджа.

import Link from 'next/link'
import { Download, ChevronRight } from 'lucide-react'
import { STATUS_RU, RISK_LEVEL_RU, type Status, type RiskLevel } from '@/lib/analytics/definitions'
import type { AdminOpts, Period } from '@/lib/analytics/admin-types'

// ---------- ссылки с сохранением режима (служебные, период, демо) ----------
export type Q = Record<string, string | number | undefined | null>
export function href(path: string, o: AdminOpts, extra: Q = {}): string {
  const sp = new URLSearchParams()
  if (o.includeInternal) sp.set('all', '1')
  if (o.period !== '30') sp.set('p', o.period)
  if (o.demo) sp.set('demo', '1')
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null || v === '') sp.delete(k)
    else sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `${path}?${s}` : path
}

// ---------- числа и даты ----------
const NBSP = ' '
export const rub = (n: number | null | undefined) => {
  if (n === null || n === undefined) return 'нет'
  const v = Math.abs(n) < 10 && !Number.isInteger(n) ? n.toFixed(2).replace('.', ',') : Math.round(n).toLocaleString('ru-RU').replace(/\s/g, NBSP)
  return `${v}${NBSP}₽`
}
export const num = (n: number) => n.toLocaleString('ru-RU').replace(/\s/g, NBSP)

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
function partsIn(iso: string, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  const g = (t: string) => p.find(x => x.type === t)?.value || '00'
  return { y: g('year'), m: Number(g('month')), d: Number(g('day')), hm: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`, ymd: `${g('year')}-${g('month')}-${g('day')}` }
}
export function dayLabel(iso: string, tz: string, now = new Date()): string {
  const a = partsIn(iso, tz), t = partsIn(now.toISOString(), tz), y = partsIn(new Date(now.getTime() - 86400000).toISOString(), tz)
  if (a.ymd === t.ymd) return 'сегодня'
  if (a.ymd === y.ymd) return 'вчера'
  return `${a.d} ${MONTHS[a.m - 1]}${a.y !== t.y ? ` ${a.y}` : ''}`
}
export const dayKey = (iso: string, tz: string) => partsIn(iso, tz).ymd
export const timeOf = (iso: string, tz: string) => partsIn(iso, tz).hm
export const when = (iso: string | null | undefined, tz: string, now = new Date()) => (iso ? `${dayLabel(iso, tz, now)}, ${timeOf(iso, tz)}` : 'нет')
export const whenDay = (iso: string | null | undefined, tz: string, now = new Date()) => (iso ? dayLabel(iso, tz, now) : 'нет')
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'нет'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} с`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  if (h >= 48) { const d = Math.floor(h / 24); return h % 24 ? `${d} дн ${h % 24} ч` : `${d} дн` }
  return m % 60 && h < 10 ? `${h} ч ${m % 60} мин` : `${h} ч`
}
export const hours = (h: number | null | undefined) => (h === null || h === undefined ? null : duration(h * 3600000))

// ---------- блоки ----------
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-brand-card border border-brand-border rounded-2xl ${className}`}>{children}</div>
}

export function Section({ title, aside, children, id }: { title: string; aside?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {aside && <div className="text-[13px] text-brand-muted">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return <div className="bg-brand-soft-2 rounded-xl p-4 text-[14px]">{children}</div>
}
export const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-brand-muted">{children}</span>

// ---------- риск и статус ----------
export function RiskPill({ score, level, counted = true, big = false }: { score: number; level: RiskLevel; counted?: boolean; big?: boolean }) {
  const size = big ? 'w-14 h-9 text-base' : 'w-11 h-7 text-[13px]'
  if (!counted) return <span className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full text-brand-muted`} title="риск не считаем, текстов еще не брала">нет</span>
  const tone = level === 'high' ? 'bg-brand-text text-brand-bg' : level === 'attention' ? 'bg-brand-lilac text-brand-text ring-1 ring-brand-text/30' : 'text-brand-muted'
  const label = `${score}, ${RISK_LEVEL_RU[level]}`
  return <span className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full font-semibold ${tone}`} title={label} aria-label={label}>{score}</span>
}

const STATUS_CLS: Record<Status, string> = {
  new: 'bg-brand-soft-2 border border-brand-border-soft text-brand-text',
  trying: 'bg-brand-soft text-brand-text',
  active: 'bg-brand-accent text-white',
  stuck: 'bg-brand-lilac ring-1 ring-brand-text/30 text-brand-text',
  cooling: 'bg-brand-card border-2 border-brand-lilac text-brand-text',
  gone: 'border border-brand-border text-brand-muted',
}
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex h-6 shrink-0 items-center px-2.5 rounded-full text-[13px] font-medium whitespace-nowrap ${STATUS_CLS[status]}`}>{STATUS_RU[status]}</span>
}
export const Flag = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-6 items-center px-2 rounded-md border border-brand-border text-[13px] whitespace-nowrap">{children}</span>
)
export const AttentionMark = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center px-1.5 rounded bg-brand-lilac ring-1 ring-brand-text/30 text-[13px] text-brand-text">{children}</span>
)

// ---------- шапка страницы: заголовок, период, выгрузка ----------
const PERIODS: { id: Period; label: string }[] = [{ id: '7', label: '7 дней' }, { id: '30', label: '30 дней' }, { id: 'all', label: 'Все время' }]

export function PageHead({ title, sub, o, path, period = false, exportQuery, zip = false, exportDesktopOnly = false }: {
  title: string; sub?: string; o: AdminOpts; path: string; period?: boolean; exportQuery?: Q; zip?: boolean; exportDesktopOnly?: boolean
}) {
  const exp = (extra: Q) => href('/api/admin/export', o, extra)
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between mt-6 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{title}</h1>
        {sub && <p className="text-[13px] text-brand-muted mt-1">{sub}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {period && (
          <nav aria-label="Период" className="inline-flex p-1 rounded-xl bg-brand-card border border-brand-border">
            {PERIODS.map(p => (
              <Link key={p.id} href={href(path, { ...o, period: p.id })} aria-current={o.period === p.id ? 'true' : undefined}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center h-11 lg:h-8 px-3 rounded-lg text-[14px] whitespace-nowrap focus-visible:outline-2 outline-offset-2 outline-brand-accent ${o.period === p.id ? 'bg-brand-accent text-white' : 'hover:bg-brand-soft-2'}`}>
                {p.label}
              </Link>
            ))}
          </nav>
        )}
        {exportQuery && (
          <div className={`${exportDesktopOnly ? 'hidden lg:flex' : 'flex'} flex-col min-[420px]:flex-row gap-2`}>
            <DownloadLink href={exp(exportQuery)}>Скачать таблицу</DownloadLink>
            {zip && <DownloadLink href={exp({ what: 'all' })}>Выгрузить все (ZIP)</DownloadLink>}
          </div>
        )}
      </div>
    </div>
  )
}

export function DownloadLink({ href: h, children }: { href: string; children: React.ReactNode }) {
  return (
    // обычная ссылка: браузер качает файл сам, без JS
    <a href={h} download className="min-[420px]:flex-1 sm:flex-none inline-flex items-center justify-center gap-2 h-11 lg:h-10 px-4 rounded-xl border border-brand-border bg-brand-card text-sm font-medium whitespace-nowrap hover:bg-brand-soft-2 focus-visible:outline-2 outline-offset-2 outline-brand-accent">
      <Download size={16} aria-hidden /> {children}
    </a>
  )
}

export function RowLink({ href: h, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={h} className="flex items-center gap-4 px-4 sm:px-5 py-2.5 min-h-14 hover:bg-brand-soft-2 focus-visible:outline-2 -outline-offset-2 outline-brand-accent">
      {children}
      <ChevronRight size={16} className="text-brand-muted shrink-0" aria-hidden />
    </Link>
  )
}

// ---------- состояния ----------
export function LoadError({ kind }: { kind: 'no_migration' | 'failed' }) {
  if (kind === 'no_migration') return (
    <Note>Кабинет готов, но в базе еще нет его таблицы и функций. Цифры появятся, когда применишь миграцию 20261005100000_events_admin.sql.</Note>
  )
  return (
    <Card className="p-5 space-y-3">
      <p>Не получилось собрать цифры. Обнови страницу или загляни через минуту.</p>
      <a href="" className="inline-flex items-center h-11 px-4 rounded-xl border border-brand-border text-sm font-medium hover:bg-brand-soft-2">Повторить</a>
    </Card>
  )
}

// Мини-полоса доли (функции, стили, карточка)
export function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-1.5 rounded-full bg-brand-soft-2 overflow-hidden" aria-hidden>
      <div className="h-full rounded-full bg-brand-accent" style={{ width: `${w}%` }} />
    </div>
  )
}

export function Table({ head, children, minW = 0 }: { head: { label: string; right?: boolean; w?: string }[]; children: React.ReactNode; minW?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] border-collapse" style={minW ? { minWidth: minW } : undefined}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} className={`px-4 py-2.5 text-[13px] font-medium text-brand-muted ${h.right ? 'text-right' : 'text-left'} ${h.w || ''}`}>{h.label}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
export const Td = ({ children, right = false, className = '' }: { children: React.ReactNode; right?: boolean; className?: string }) => (
  <td className={`px-4 py-2.5 border-t border-brand-border ${right ? 'text-right' : ''} ${className}`}>{children}</td>
)
