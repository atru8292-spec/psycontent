'use client'

// «Мои тексты» под флагом нового мозга (вариант А, макет A7, состояния SOSTOYANIYA-A.md).
// Одна мысль = одна строка: материалы одного запуска сведены по group_id (старые без группы идут по одному).
// Компьютер (от lg): список слева около 420 px, открытый текст справа (TextView) с вкладками форматов мысли.
// Телефон: список, тап открывает мысль на экране результата (/dashboard/make?post=<id>&f=<формат>).
// В строке отметка «Уже в блоге» (зона 44 px), после нажатия строка «Опубликовано» с «Отменить».
// Хуки не показываем (отфильтрованы в запросе). Доработанный черновик (rewrite_*) это текст (12.11):
// в строке видно, что вышло (пост, карусель, рилс, сторис), и метка «из черновика».

import { useFeatureOpen } from '@/lib/analytics/hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Check, Loader2, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MAKE_FORMATS, NOT_MATERIAL_FORMAT, formatLabel, isRewriteFormat, toMakeFormat, type MakeFormat } from '@/components/make/formats'
import TextView from './TextView'

export type TextRow = {
  id: string
  topic: string | null
  format: string | null
  content: string | null
  created_at: string
  group_id?: string | null
  core?: { thought?: string } | null
  sample_source?: { label?: string } | null
  published_at?: string | null
  is_favorite?: boolean | null
  feedback?: { verdict?: string } | null
}
type Card = { key: string; title: string; date: string; motive: boolean; draft: boolean; rows: TextRow[]; text: string; published: boolean }

const STATUS = [
  { id: 'all', label: 'Все' },
  { id: 'unpublished', label: 'Еще не в блоге' },
  { id: 'mine', label: 'Звучит как я' },
] as const
type Status = typeof STATUS[number]['id']

const isMine = (r: TextRow) => r.is_favorite === true || r.feedback?.verdict === 'mine'
const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
const fmtOf = (r: TextRow) => toMakeFormat(String(r.format || 'post'))
const lowerLabel = (f: MakeFormat) => f === 'post_tg' ? 'Telegram' : formatLabel(f).toLowerCase()
// «пост», «карусель и рилс», «пост, карусель и рилс»
function formatsLine(rows: TextRow[]): string {
  const xs = [...new Set(rows.map(fmtOf))].map(lowerLabel)
  return xs.length <= 1 ? (xs[0] || 'пост') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`
}
const isDesk = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches

export default function MyTexts() {
  const router = useRouter()
  const [rows, setRows] = useState<TextRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [fmt, setFmt] = useState<MakeFormat | null>(null)
  const [fmtOpen, setFmtOpen] = useState(false)
  const [selKey, setSelKey] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ ids: string[]; was: Record<string, string | null> } | null>(null)
  const [pubError, setPubError] = useState(false)
  const fmtRef = useRef<HTMLDivElement>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useFeatureOpen('texts')

  useEffect(() => {
    let on = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data, error } = await supabase.from('generated_posts').select('*')
        .eq('user_id', user.id).neq('format', NOT_MATERIAL_FORMAT)
        .order('created_at', { ascending: false }).limit(400)
      if (!on) return
      if (error) { setFailed(true); setRows([]); return }
      setRows((data || []) as TextRow[])
    })()
    return () => { on = false }
  }, [router])

  // выпадающий список форматов закрывается кликом мимо и Escape
  useEffect(() => {
    if (!fmtOpen) return
    const away = (e: MouseEvent) => { if (!fmtRef.current?.contains(e.target as Node)) setFmtOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFmtOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [fmtOpen])

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  // одна мысль = одна строка; порядок по самому свежему тексту
  const cards = useMemo<Card[]>(() => {
    const map = new Map<string, TextRow[]>()
    for (const r of rows || []) {
      const k = r.group_id || r.id
      map.set(k, [...(map.get(k) || []), r])
    }
    return [...map.entries()].map(([key, rs]) => {
      const sorted = [...rs].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const first = sorted[0]
      return {
        key, rows: sorted,
        title: String(first.core?.thought || first.topic || (first.content || '').split('\n')[0] || 'Без темы'),
        date: sorted[sorted.length - 1].created_at,
        motive: rs.some(r => !!r.sample_source),
        draft: rs.some(r => isRewriteFormat(r.format)),
        text: rs.map(r => `${r.topic || ''} ${r.content || ''} ${r.core?.thought || ''}`).join(' ').toLowerCase(),
        // мысль в блоге, если вышел хоть один ее формат
        published: rs.some(r => !!r.published_at),
      }
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [rows])

  const query = q.trim()
  const shown = cards.filter(c => {
    if (query && !c.text.includes(query.toLowerCase())) return false
    if (fmt && !c.rows.some(r => fmtOf(r) === fmt)) return false
    if (status === 'unpublished' && c.published) return false
    if (status === 'mine' && !c.rows.some(isMine)) return false
    return true
  })
  const waiting = shown.filter(c => !c.published)
  const out = shown.filter(c => c.published)

  // на компьютере справа всегда открыт текст: выбранный или первый в списке
  const sel = shown.find(c => c.key === selKey) || shown[0] || null
  const selActive = sel ? (sel.rows.find(r => r.id === activeId) || (fmt ? sel.rows.find(r => fmtOf(r) === fmt) : null) || sel.rows[0]) : null

  const reset = () => { setQ(''); setStatus('all'); setFmt(null) }

  const openCard = (c: Card) => {
    if (isDesk()) { setSelKey(c.key); setActiveId(null); return }
    const r = (fmt && c.rows.find(x => fmtOf(x) === fmt)) || c.rows[0]
    router.push(`/dashboard/make?post=${r.id}&f=${fmtOf(r)}`)
  }

  // Отметка «Уже в блоге»: у формата своя отметка (как на экране результата). Из строки: если мысль уже в блоге,
  // снимаем отметку со всех ее форматов; если нет, отмечаем открытый справа формат, иначе первый.
  const setPublished = async (ids: string[], at: string | null, was: Record<string, string | null>) => {
    setPubError(false)
    setRows(rs => (rs || []).map(r => ids.includes(r.id) ? { ...r, published_at: at } : r))
    const res = await Promise.all(ids.map(id =>
      fetch('/api/generate-post/published', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: id, undo: at === null }) })
        .then(r => r.ok).catch(() => false)))
    const bad = ids.filter((_, i) => !res[i])
    if (bad.length) {
      setRows(rs => (rs || []).map(r => bad.includes(r.id) ? { ...r, published_at: was[r.id] ?? null } : r))
      setPubError(true)
      return false
    }
    return true
  }
  const toggleRows = async (targets: TextRow[], publish: boolean) => {
    if (!targets.length) return
    const ids = targets.map(r => r.id)
    const was = Object.fromEntries(targets.map(r => [r.id, r.published_at ?? null]))
    const ok = await setPublished(ids, publish ? new Date().toISOString() : null, was)
    if (ok && publish) {
      setUndo({ ids, was })
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndo(null), 6000)
    } else setUndo(null)
  }
  const toggleCard = (c: Card) => {
    if (c.published) return toggleRows(c.rows.filter(r => r.published_at), false)
    const target = (sel?.key === c.key && selActive) || c.rows[0]
    return toggleRows([target], true)
  }
  const undoLast = () => {
    if (!undo) return
    setPublished(undo.ids, null, Object.fromEntries(undo.ids.map(id => [id, new Date().toISOString()])))
    setUndo(null)
  }

  const chip = (on: boolean) => `h-11 shrink-0 inline-flex items-center gap-1 rounded-full px-4 text-[15px] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${on ? 'bg-brand-soft border-[1.5px] border-brand-border-soft text-brand-text font-semibold' : 'border border-brand-border bg-brand-card text-brand-text hover:border-brand-muted'}`

  const row = (c: Card) => {
    const active = sel?.key === c.key
    return (
      <li key={c.key} className={`flex items-center gap-1 rounded-2xl ${active ? 'lg:bg-brand-card' : ''}`}>
        <button type="button" onClick={() => openCard(c)} aria-current={active ? 'true' : undefined}
          className="min-w-0 flex-1 text-left pl-3.5 pr-1 py-3.5 rounded-2xl cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-accent">
          <span className={`block text-[16px] leading-[22px] break-words line-clamp-2 ${c.published ? 'text-brand-text-secondary' : 'text-brand-text font-medium'}`}>{c.title}</span>
          <span className="mt-1 block text-[13px] leading-[18px] text-brand-muted">
            {formatsLine(c.rows)} · {day(c.date)}
            {c.motive && ' · по образцу'}
            {c.draft && ' · из черновика'}
          </span>
        </button>
        <button type="button" role="switch" aria-checked={c.published} onClick={() => toggleCard(c)}
          aria-label={c.published ? `«${c.title.slice(0, 60)}» уже в блоге. Снять отметку` : `Отметить «${c.title.slice(0, 60)}»: уже в блоге`}
          title={c.published ? 'Уже в блоге. Нажми, чтобы снять отметку' : 'Отметить: уже в блоге'}
          className="w-11 h-11 mr-1.5 shrink-0 inline-flex items-center justify-center rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent">
          <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center ${c.published ? 'bg-brand-accent text-white' : 'border-[1.5px] border-brand-border text-brand-border'}`}>
            <Check className="w-4 h-4" aria-hidden="true" />
          </span>
        </button>
      </li>
    )
  }

  const group = (title: string, list: Card[]) => list.length > 0 && (
    <section className="mt-5 first:mt-4" aria-label={title}>
      <h2 className="px-0.5 text-[17px] leading-6 font-semibold text-brand-text">{title} · {list.length}</h2>
      <ul className="mt-2 divide-y divide-brand-border">{list.map(row)}</ul>
    </section>
  )

  const emptyFiltered = () => {
    if (status === 'mine' && !query && !fmt) return <>Тут будут тексты, отмеченные «Звучит как я». По ним голос подстраивается точнее</>
    if (query) return <>По слову «{query.slice(0, 40)}» текстов нет</>
    if (status === 'unpublished' && !fmt) return <>Все написанное уже в блоге</>
    return <>Тут таких текстов нет</>
  }

  return (
    <div className="lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:h-dvh">
      <div className="max-w-[560px] mx-auto px-4 pt-4 pb-8 lg:max-w-none lg:mx-0 lg:px-5 lg:pt-8 lg:overflow-y-auto lg:border-r lg:border-brand-border">
        <h1 className="text-[22px] leading-7 lg:text-[24px] lg:leading-8 font-semibold text-brand-text">Мои тексты</h1>

        <label className="mt-3 lg:mt-4 h-12 flex items-center gap-2 px-3 rounded-xl bg-brand-card border border-brand-border focus-within:border-brand-accent">
          <Search className="w-5 h-5 text-brand-muted shrink-0" aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Найти текст" aria-label="Найти текст" type="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-brand-text placeholder:text-brand-muted focus:outline-none" />
        </label>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Фильтр">
          {STATUS.map(s => <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => setStatus(s.id)} className={chip(status === s.id)}>{s.label}</button>)}
          <div ref={fmtRef} className="relative">
            <button type="button" aria-haspopup="listbox" aria-expanded={fmtOpen} onClick={() => setFmtOpen(v => !v)} className={chip(!!fmt)}>
              {fmt ? formatLabel(fmt) : 'Формат'} <ChevronDown className={`w-4 h-4 transition ${fmtOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {fmtOpen && (
              <ul role="listbox" aria-label="Формат" className="absolute left-0 top-12 z-20 w-56 rounded-2xl bg-brand-card border border-brand-border p-1.5 shadow-[0_8px_24px_rgba(59,42,34,0.12)]">
                {[{ id: null as MakeFormat | null, label: 'Любой' }, ...MAKE_FORMATS.map(f => ({ id: f.id as MakeFormat | null, label: f.label }))].map(o => (
                  <li key={o.id || 'any'}>
                    <button type="button" role="option" aria-selected={fmt === o.id} onClick={() => { setFmt(o.id); setFmtOpen(false) }}
                      className="w-full h-11 px-3 rounded-xl flex items-center justify-between text-left text-[15px] text-brand-text hover:bg-brand-bg cursor-pointer">
                      {o.label}{fmt === o.id && <Check className="w-4 h-4 text-brand-accent" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div aria-live="polite">
          {undo && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-brand-card border border-brand-border pl-4 pr-1 text-[15px] text-brand-text">
              <span className="inline-flex items-center gap-2"><Check className="w-4 h-4 text-brand-accent" aria-hidden="true" />Опубликовано</span>
              <button type="button" onClick={undoLast} className="h-11 px-3 font-semibold text-brand-accent cursor-pointer">Отменить</button>
            </div>
          )}
          {pubError && <p className="mt-3 text-[14px] text-brand-text">Отметка не сохранилась из-за сбоя в PsyCont. Нажми еще раз через минуту</p>}
        </div>

        {rows === null ? (
          <div className="py-16 flex justify-center text-brand-muted"><Loader2 className="w-6 h-6 animate-spin" aria-label="Тексты загружаются" /></div>
        ) : failed ? (
          <div className="mt-6 rounded-2xl bg-brand-soft px-4 py-4 text-[15px] text-brand-text">
            Тексты не загрузились из-за сбоя в PsyCont. Они на месте, обнови страницу через минуту
          </div>
        ) : !cards.length ? (
          <div className="mt-10 text-center px-2">
            <p className="text-[16px] leading-6 text-brand-text">Тут соберется все, что напишешь: посты, карусели, рилс. Одна мысль, одна карточка</p>
            <button type="button" onClick={() => router.push('/dashboard/make')} className="mt-4 h-12 px-6 rounded-2xl bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover cursor-pointer">Написать первый текст</button>
          </div>
        ) : !shown.length ? (
          <div className="mt-10 text-center px-2">
            <p className="text-[16px] leading-6 text-brand-text">{emptyFiltered()}</p>
            <button type="button" onClick={reset} className="mt-3 h-11 px-5 rounded-xl border border-brand-border bg-brand-card text-brand-text cursor-pointer">Сбросить фильтр</button>
          </div>
        ) : (
          <>
            {group('Еще не в блоге', waiting)}
            {group('Опубликовано', out)}
          </>
        )}
      </div>

      {/* компьютер: открытый текст справа */}
      <div className="hidden lg:block lg:overflow-y-auto px-10 pt-7 pb-10">
        {sel && selActive && (
          <TextView rows={sel.rows} activeId={selActive.id} onActive={setActiveId}
            onTogglePublished={r => toggleRows([r], !r.published_at)} />
        )}
      </div>
    </div>
  )
}
