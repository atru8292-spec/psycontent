// Вкладка «Тексты» (аналитика 2, SPEC B2): что люди делают с текстами и насколько тексты шаблонные, по неделям.
// Только рисует готовые строки quality_weekly (пропом), грузит их app/admin/texts/page.tsx через loadQuality.
// Так ее можно показать на /preview/analitika с демо-данными. Самих текстов и цепочек здесь нет, только числа.
// Подсветка «хуже» только AttentionMark по правилам isWorse (lib/analytics/quality.ts); обращения и мат не подсвечиваем.

import Link from 'next/link'
import type { QualityRow } from '@/lib/analytics/admin-a2'
import type { AdminOpts } from '@/lib/analytics/admin-types'
import { ADMIN_TEXTS } from '@/lib/analytics/exit-copy'
import { LIVE_NORMS, isWorse } from '@/lib/analytics/quality'
import {
  FORMAT_FILTERS, FORMAT_ROW_RU, SMALL_SAMPLE, combine, dec, pct, reelsKindRu, reelsKindsOf, shiftWeek, slice,
  variantsOf, weekRange, weekShort, weekWindow, type Slice, type TextsParams,
} from '@/lib/analytics/texts-view'
import { AttentionMark, Card, Note, Section, Table, Td, href, num, type Q } from './ui'

type Link_ = (extra: Partial<TextsParams>) => string

const NO_TABLE = 'Цифры по текстам появятся, когда применишь миграцию 20261024120000_quality_weekly.sql и пройдет первый недельный подсчет.'
const WORSE_NOTE = 'Сиреневым отмечено, где стало заметно хуже прошлой недели. Недели, где меньше 20 текстов, не сравниваем.'
const NO_HIGHLIGHT = new Set(['address', 'mat'])

export default function TextsView({ rows, error, o, path, keep = {}, params, tz, now }: {
  rows: QualityRow[] | null; error: null | 'no_migration' | 'failed'; o: AdminOpts; path: string; keep?: Q
  params: TextsParams; tz: string; now: Date
}) {
  const link: Link_ = extra => {
    const p = { ...params, ...extra }
    return href(path, o, { ...keep, f: p.f === 'all' ? null : p.f, v: p.v === 'all' ? null : p.v, w: p.w === '1' ? null : p.w })
  }
  if (error === 'no_migration') return <Note>{NO_TABLE}</Note>
  if (error || !rows) return (
    <Card className="p-5 space-y-3">
      <p>Не получилось собрать цифры. Обнови страницу или загляни через минуту.</p>
      <a href="" className="inline-flex items-center h-11 px-4 rounded-xl border border-brand-border text-sm font-medium hover:bg-brand-soft-2">Повторить</a>
    </Card>
  )
  if (!rows.length || rows.every(r => !r.texts)) return <Card className="p-5"><p className="text-brand-muted">{ADMIN_TEXTS.empty}</p></Card>

  const win = weekWindow(rows, now, tz)
  const variants = variantsOf(rows)
  const v = params.v === 'all' || variants.includes(params.v) ? params.v : 'all'
  const at = (ws: string) => slice(rows, [ws], params.f, v)

  return (
    <div className="space-y-6 lg:space-y-8 min-w-0">
      <Filters params={{ ...params, v }} variants={variants} link={link} />
      <Note>{WORSE_NOTE}</Note>
      <LastWeek cur={at(win.last)} prev={at(shiftWeek(win.last, -1))} />
      <People weeks={win.all} current={win.hasCurrent ? win.current : null} at={at} />
      <ByFormat rows={rows} weeks={params.w === '4' ? win.closed.slice(0, 4) : [win.last]} params={{ ...params, v }} variants={variants} link={link} />
      <Sameness weeks={win.closed.slice(0, 4)} at={at} />
    </div>
  )
}

// ---------- фильтры ----------
function Seg({ label, items }: { label: string; items: { key: string; text: string; href: string; on: boolean }[] }) {
  return (
    <div className="min-w-0 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      <nav aria-label={label} className="inline-flex p-1 rounded-xl bg-brand-card border border-brand-border">
        {items.map(i => (
          <Link key={i.key} href={i.href} aria-current={i.on ? 'true' : undefined}
            className={`inline-flex items-center justify-center h-11 lg:h-8 px-3 rounded-lg text-[14px] whitespace-nowrap focus-visible:outline-2 outline-offset-2 outline-brand-accent ${i.on ? 'bg-brand-accent text-white' : 'hover:bg-brand-soft-2'}`}>
            {i.text}
          </Link>
        ))}
      </nav>
    </div>
  )
}

function Filters({ params, variants, link }: { params: TextsParams; variants: string[]; link: Link_ }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[13px] text-brand-muted">Формат</span>
        <Seg label="Формат" items={FORMAT_FILTERS.map(f => ({ key: f.id, text: f.label, href: link({ f: f.id }), on: params.f === f.id }))} />
      </div>
      {variants.length > 0 && (
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[13px] text-brand-muted">Вариант промпта</span>
          <Seg label="Вариант промпта" items={['all', ...variants].map(x => ({ key: x, text: x === 'all' ? 'Все' : x, href: link({ v: x }), on: params.v === x }))} />
        </div>
      )}
    </div>
  )
}

// ---------- значения ----------
const small = (s: Slice | null) => !s || s.texts < SMALL_SAMPLE
const Few = () => <span className="text-brand-muted">мало</span>
function Val({ s, k, prev, kind = 'pct', mark = true }: { s: Slice | null; k: string; prev?: Slice | null; kind?: 'pct' | 'dec'; mark?: boolean }) {
  if (!s) return <span className="text-brand-muted">нет</span>
  if (small(s)) return <Few />
  const x = s.m[k]
  const text = kind === 'pct' ? pct(x) : dec(x)
  const norm = k === 'sentLen' ? LIVE_NORMS.sentLen : undefined
  const worse = mark && !!prev && !NO_HIGHLIGHT.has(k) && isWorse(k, x, prev.m[k], s.texts, prev.texts, norm)
  return worse ? <span title={ADMIN_TEXTS.worse}><AttentionMark>{text}</AttentionMark></span> : <>{text}</>
}

// ---------- блок 1: прошлая неделя ----------
function LastWeek({ cur, prev }: { cur: Slice | null; prev: Slice | null }) {
  const tiles: [string, string][] = [['takeRate', 'Взяли'], ['adjustedRate', 'Поправили'], ['errors', 'Ошибки'], ['sameStart', 'Одинаковое начало']]
  return (
    <Section title="Прошлая неделя" aside={cur ? `${num(cur.texts)} текстов` : undefined}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {tiles.map(([k, label]) => (
          <Card key={k} className="p-4 lg:p-5 space-y-2">
            <div className="text-[13px] text-brand-muted">{label}</div>
            <div className="text-[28px] font-semibold leading-none"><Val s={cur} k={k} prev={prev} /></div>
            <div className="text-[13px] text-brand-muted">неделей раньше {prev && !small(prev) ? pct(prev.m[k]) : 'мало'}</div>
          </Card>
        ))}
      </div>
    </Section>
  )
}

// ---------- блок 2: что делают люди с текстами ----------
function People({ weeks, current, at }: { weeks: string[]; current: string | null; at: (ws: string) => Slice | null }) {
  const data = weeks.map(ws => ({ ws, s: at(ws) }))
  return (
    <Section title="Что делают люди с текстами">
      <Card className="p-4 lg:p-5 space-y-2">
        <h3 className="text-[13px] text-brand-muted">Взяли в работу, по неделям</h3>
        <TakeChart points={[...data].reverse()} current={current} />
      </Card>
      <Card className="overflow-hidden">
        <Table minW={760} head={[{ label: 'Неделя', w: 'sticky left-0 bg-brand-card z-10' }, { label: 'Сделано', right: true }, { label: 'Взяли', right: true }, { label: 'Поправили', right: true }, { label: 'Правок в среднем', right: true }, { label: '«Не похоже»', right: true }, { label: '«Мое»', right: true }, { label: 'Ошибки', right: true }]}>
          {data.map(({ ws, s }, i) => {
            const isCur = ws === current
            const prev = isCur ? undefined : data.slice(i + 1).find(x => x.ws === shiftWeek(ws, -1))?.s ?? null
            return (
              <tr key={ws}>
                <Td className="sticky left-0 bg-brand-card z-10 whitespace-nowrap">{weekRange(ws)}{isCur && <span className="ml-2 text-[13px] text-brand-muted">идет</span>}</Td>
                <Td right>{s ? num(s.texts) : 'нет'}</Td>
                <Td right><Val s={s} k="takeRate" prev={prev} /></Td>
                <Td right><Val s={s} k="adjustedRate" prev={prev} /></Td>
                <Td right><Val s={s} k="adjustsAvg" prev={prev} kind="dec" /></Td>
                <Td right><Val s={s} k="notLike" prev={prev} /></Td>
                <Td right><Val s={s} k="mine" prev={prev} /></Td>
                <Td right><Val s={s} k="errors" prev={prev} /></Td>
              </tr>
            )
          })}
        </Table>
      </Card>
    </Section>
  )
}

// Линия «Взяли» без библиотек: сетка и линия в svg (тянется по ширине), точки отдельными svg поверх,
// чтобы не сплющивались. Недели, где меньше 10 текстов, точкой не ставим.
function TakeChart({ points, current }: { points: { ws: string; s: Slice | null }[]; current: string | null }) {
  const n = points.length
  const xs = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
  const ok = points.map((p, i) => ({ ...p, i, y: p.s && !small(p.s) ? p.s.m.takeRate ?? null : null })).filter(p => p.y !== null) as { ws: string; s: Slice; i: number; y: number }[]
  const max = Math.max(0.5, ...ok.map(p => p.y))
  const ys = (y: number) => 100 - (y / max) * 100
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[13px] text-brand-muted h-[120px] lg:h-[160px] shrink-0 text-right w-9" aria-hidden>
          <span>{pct(max)}</span><span>{pct(max / 2)}</span><span>0%</span>
        </div>
        <div className="relative flex-1 min-w-0 h-[120px] lg:h-[160px]">
          <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Доля взятых текстов по неделям">
            {[0, 50, 100].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} className="stroke-brand-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            {ok.length > 1 && <polyline fill="none" className="stroke-brand-accent" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={ok.map(p => `${xs(p.i)},${ys(p.y)}`).join(' ')} />}
          </svg>
          {ok.map(p => (
            <svg key={p.ws} width="12" height="12" viewBox="0 0 12 12" className="absolute -translate-x-1/2 -translate-y-1/2 overflow-visible" style={{ left: `${xs(p.i)}%`, top: `${ys(p.y)}%` }}>
              <title>{`${weekRange(p.ws)}${p.ws === current ? ', идет' : ''}: взяли ${pct(p.y)} из ${p.s.texts}`}</title>
              <circle cx="6" cy="6" r="4" className={p.ws === current ? 'fill-brand-card stroke-brand-accent' : 'fill-brand-accent stroke-brand-card'} strokeWidth="2" />
            </svg>
          ))}
          {!ok.length && <p className="absolute inset-0 flex items-center justify-center text-[13px] text-brand-muted">Пока мало текстов для линии</p>}
        </div>
      </div>
      <div className="flex justify-between pl-11 mt-1 text-[13px] text-brand-muted">
        {points.map((p, i) => (
          <span key={p.ws} className={i === 0 || i === n - 1 ? '' : 'hidden lg:inline'}>{weekShort(p.ws)}</span>
        ))}
      </div>
    </div>
  )
}

// ---------- блок 3: по формату и варианту ----------
function ByFormat({ rows, weeks, params, variants, link }: { rows: QualityRow[]; weeks: string[]; params: TextsParams; variants: string[]; link: Link_ }) {
  const kinds = reelsKindsOf(rows)
  const tables = params.v === 'all' ? ['all', ...variants] : [params.v]
  return (
    <Section title="По формату и варианту">
      <Seg label="Срок" items={[{ key: '1', text: 'Прошлая неделя', href: link({ w: '1' }), on: params.w === '1' }, { key: '4', text: '4 недели', href: link({ w: '4' }), on: params.w === '4' }]} />
      {tables.map(v => {
        const line = (f: string) => slice(rows, weeks, f, v)
        const list: { key: string; label: string; s: Slice | null; sub?: boolean }[] = []
        for (const f of ['post', 'carousel', 'reels', 'stories', 'post_tg']) {
          list.push({ key: f, label: FORMAT_ROW_RU[f], s: line(f) })
          if (f === 'reels') for (const k of kinds) list.push({ key: k, label: reelsKindRu(k), s: combine(rows.filter(r => weeks.includes(r.week_start) && r.format === k && r.variant === v)), sub: true })
        }
        const shown = list.filter(x => x.s && x.s.texts > 0)
        return (
          <Card key={v} className="overflow-hidden">
            <h3 className="px-4 pt-4 font-semibold">{v === 'all' ? 'Все варианты' : `Вариант ${v}`}</h3>
            {!shown.length ? <p className="px-4 py-4 text-brand-muted">За этот срок текстов нет</p> : (
              <Table minW={620} head={[{ label: 'Формат', w: 'sticky left-0 bg-brand-card z-10' }, { label: 'Сделано', right: true }, { label: 'Взяли', right: true }, { label: 'Поправили', right: true }, { label: '«Не похоже»', right: true }, { label: 'Ошибки', right: true }]}>
                {shown.map(x => (
                  <tr key={x.key}>
                    <Td className={`sticky left-0 bg-brand-card z-10 whitespace-nowrap ${x.sub ? 'pl-8 text-brand-muted' : ''}`}>{x.label}</Td>
                    <Td right>{num(x.s!.texts)}</Td>
                    <Td right><Val s={x.s} k="takeRate" mark={false} /></Td>
                    <Td right><Val s={x.s} k="adjustedRate" mark={false} /></Td>
                    <Td right><Val s={x.s} k="notLike" mark={false} /></Td>
                    {/* ошибки генерации известны только по формату, по варианту их нет */}
                    <Td right>{v === 'all' ? <Val s={x.s} k="errors" mark={false} /> : <span className="text-brand-muted">нет</span>}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )
      })}
    </Section>
  )
}

// ---------- блок 4: шаблонность ----------
const SAMENESS: { k: string; kind: 'pct' | 'dec' | 'chains' }[] = [
  { k: 'sameStart', kind: 'pct' }, { k: 'chains', kind: 'chains' }, { k: 'loop', kind: 'pct' }, { k: 'address', kind: 'pct' },
  { k: 'mat', kind: 'pct' }, { k: 'questionEnd', kind: 'pct' }, { k: 'sentLen', kind: 'dec' }, { k: 'sentSd', kind: 'dec' }, { k: 'shortShare', kind: 'pct' },
]
function Sameness({ weeks, at }: { weeks: string[]; at: (ws: string) => Slice | null }) {
  const cols = weeks.map(ws => ({ ws, s: at(ws), prev: at(shiftWeek(ws, -1)) }))
  const norm = (k: string, kind: string) => {
    const x = (LIVE_NORMS as Record<string, number>)[k]
    return x === undefined ? <span className="text-brand-muted">нет</span> : kind === 'dec' ? dec(x) : pct(x)
  }
  const chains = (s: Slice | null, prev: Slice | null) => {
    if (!s) return <span className="text-brand-muted">нет</span>
    if (small(s)) return <Few />
    const c = s.m.chains
    if (c == null) return <span className="text-brand-muted">{`в ${pct(s.m.chainTexts)}`}</span>
    const text = `${num(c)} · в ${pct(s.m.chainTexts)}`
    const worse = isWorse('chains', c, prev?.m.chains ?? null) || (!!prev && isWorse('chainTexts', s.m.chainTexts, prev.m.chainTexts, s.texts, prev.texts))
    return worse ? <span title={ADMIN_TEXTS.worse}><AttentionMark>{text}</AttentionMark></span> : <>{text}</>
  }
  return (
    <Section title="Шаблонность">
      <Card className="overflow-hidden">
        <Table minW={720} head={[{ label: '', w: 'sticky left-0 bg-brand-card z-10 min-w-[220px]' }, { label: ADMIN_TEXTS.colNorm, right: true, w: 'bg-brand-soft-2' }, ...cols.map(c => ({ label: weekRange(c.ws), right: true }))]}>
          {SAMENESS.map(({ k, kind }) => {
            const [label, hint] = ADMIN_TEXTS.metrics[k] || [k, '']
            return (
              <tr key={k}>
                <Td className="sticky left-0 bg-brand-card z-10">
                  <div>{label}</div>
                  {hint && <div className="text-[13px] text-brand-muted">{hint}</div>}
                </Td>
                <Td right className="bg-brand-soft-2">{kind === 'chains' ? <span className="text-brand-muted">нет</span> : norm(k, kind)}</Td>
                {cols.map(c => <Td key={c.ws} right className="whitespace-nowrap">{kind === 'chains' ? chains(c.s, c.prev) : <Val s={c.s} k={k} prev={c.prev} kind={kind} />}</Td>)}
              </tr>
            )
          })}
        </Table>
      </Card>
      <p className="text-[13px] text-brand-muted">Нормы посчитаны по живым рилсам и постам психологов. Сами цепочки в кабинет не попадают, только их число.</p>
    </Section>
  )
}
