'use client'

// «Мои тексты» под флагом нового мозга (задача sdelat-i-brend, раздел 6; спецификация designer-psycont, п. 7).
// Одна мысль = одна карточка: материалы одного запуска сведены по group_id (старые без группы идут по одному).
// Плашка формата открывает этот формат в результате «Сделать» (/dashboard/make?post=<id>&f=<формат>).
// Хуки не показываем (отфильтрованы в запросе).

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Check, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MAKE_FORMATS, formatLabel, toMakeFormat, type MakeFormat } from '@/components/make/formats'

type Row = {
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
type Card = { key: string; title: string; date: string; motive: boolean; rows: Row[]; text: string }

const STATUS = [
  { id: 'all', label: 'Все' },
  { id: 'unpublished', label: 'Не опубликовано' },
  { id: 'published', label: 'Опубликовано' },
  { id: 'mine', label: 'Мое' },
] as const
type Status = typeof STATUS[number]['id']

const isMine = (r: Row) => r.is_favorite === true || r.feedback?.verdict === 'mine'
const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')

export default function MyTexts() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [fmt, setFmt] = useState<MakeFormat | null>(null)

  useEffect(() => {
    let on = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data, error } = await supabase.from('generated_posts').select('*')
        .eq('user_id', user.id).neq('format', 'hooks').not('format', 'like', 'rewrite%')
        .order('created_at', { ascending: false }).limit(400)
      if (!on) return
      if (error) { setFailed(true); setRows([]); return }
      setRows((data || []) as Row[])
    })()
    return () => { on = false }
  }, [router])

  // одна мысль = одна карточка; порядок по самому свежему материалу
  const cards = useMemo<Card[]>(() => {
    const map = new Map<string, Row[]>()
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
        text: rs.map(r => `${r.topic || ''} ${r.content || ''} ${r.core?.thought || ''}`).join(' ').toLowerCase(),
      }
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [rows])

  const shown = cards.filter(c => {
    if (q.trim() && !c.text.includes(q.trim().toLowerCase())) return false
    if (fmt && !c.rows.some(r => toMakeFormat(String(r.format || 'post')) === fmt)) return false
    if (status === 'published' && !c.rows.some(r => r.published_at)) return false
    if (status === 'unpublished' && !c.rows.some(r => !r.published_at)) return false
    if (status === 'mine' && !c.rows.some(isMine)) return false
    return true
  })
  const filtered = !!q.trim() || status !== 'all' || !!fmt
  const chip = (on: boolean) => `snap-start h-11 shrink-0 inline-flex items-center rounded-full px-4 text-[15px] cursor-pointer ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text'}`

  return (
    <div className="max-w-[560px] mx-auto px-4 pt-4 pb-8">
      <h1 className="text-[22px] leading-7 font-semibold text-brand-text">Мои тексты</h1>

      <label className="mt-3 h-12 flex items-center gap-2 px-3 rounded-xl bg-brand-card border border-brand-border focus-within:border-brand-accent">
        <Search className="w-5 h-5 text-brand-muted shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Найти по словам" aria-label="Найти по словам"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-brand-text placeholder:text-brand-muted focus:outline-none" />
      </label>

      <div className="-mx-4 px-4 mt-3 flex gap-2 overflow-x-auto snap-x [scrollbar-width:none]" role="group" aria-label="Статус">
        {STATUS.map(s => <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => setStatus(s.id)} className={chip(status === s.id)}>{s.label}</button>)}
      </div>
      <div className="-mx-4 px-4 mt-2 flex gap-2 overflow-x-auto snap-x [scrollbar-width:none]" role="group" aria-label="Формат">
        {MAKE_FORMATS.map(f => <button key={f.id} type="button" aria-pressed={fmt === f.id} onClick={() => setFmt(fmt === f.id ? null : f.id)} className={chip(fmt === f.id)}>{f.label}</button>)}
      </div>

      {rows === null ? (
        <div className="py-16 flex justify-center text-brand-muted"><Loader2 className="w-6 h-6 animate-spin" aria-label="Загружаю" /></div>
      ) : failed ? (
        <div className="mt-6 rounded-2xl bg-brand-soft px-4 py-4 text-[15px] text-brand-text">
          Не получилось загрузить тексты. Они на месте, обнови страницу через минуту.
        </div>
      ) : !cards.length ? (
        <div className="mt-10 text-center px-2">
          <p className="text-[16px] leading-6 text-brand-text">Здесь будет все, что сделаешь. Одна мысль хранится вместе со всеми форматами из нее</p>
          <button type="button" onClick={() => router.push('/dashboard/make')} className="mt-4 h-12 px-6 rounded-2xl bg-brand-accent text-white font-semibold cursor-pointer">Сделать первый</button>
        </div>
      ) : !shown.length ? (
        <div className="mt-10 text-center">
          <p className="text-[16px] text-brand-text">С этим фильтром пусто</p>
          <button type="button" onClick={() => { setQ(''); setStatus('all'); setFmt(null) }} className="mt-3 h-11 px-5 rounded-xl border border-brand-border text-brand-text cursor-pointer">Сбросить</button>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map(c => (
            <li key={c.key} className="rounded-2xl bg-brand-card border border-brand-border p-4">
              <p className="text-[16px] leading-[22px] font-semibold text-brand-text line-clamp-2 break-words">{c.title}</p>
              <div className="mt-1 flex items-center gap-2 text-[13px] text-brand-muted">
                <span>{day(c.date)}</span>
                {c.motive && <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand-text">по мотивам</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.rows.map(r => {
                  const f = toMakeFormat(String(r.format || 'post'))
                  const hit = fmt === f
                  return (
                    <button key={r.id} type="button" onClick={() => router.push(`/dashboard/make?post=${r.id}&f=${f}`)}
                      className={`h-11 inline-flex items-center cursor-pointer`} aria-label={`Открыть: ${formatLabel(f)}${r.published_at ? ', опубликовано' : ''}`}>
                      <span className={`h-8 px-3 inline-flex items-center gap-1 rounded-full bg-brand-soft-2 text-[13px] text-brand-text ${hit ? 'border-[1.5px] border-brand-accent' : ''}`}>
                        {r.published_at && <Check className="w-3 h-3 text-brand-accent" />}{formatLabel(f)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
