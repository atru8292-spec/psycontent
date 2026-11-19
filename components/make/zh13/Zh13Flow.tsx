'use client'

// Экран «Сделать» для генератора zh13 (19.11, только при флаге: /api/me zh13). Спецификация designer-psycont 19.11:
// ввод (своя мысль голосом или текстом, формат заранее, по умолчанию «Подбери сам») → ожидание → результат.
// В результате главное отдельно от съемки: текст без меток с кнопкой «Скопировать текст», подпись своим блоком,
// «Как снять» (рилсы) справа на компьютере и свернутым блоком под заголовком на телефоне, «Подойдет еще» (три
// формата от модели с причиной) и «Все форматы». Тап по формату пишет новый вариант на ту же тему или мысль,
// прошлые остаются (стрелки и лист «Прошлые варианты»). Каждый вариант это 1 текст. Генерация /api/generate-post/zh13.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ChevronDown, Mic, Loader2, Check, MoreHorizontal, ArrowRight } from 'lucide-react'
import Squiggle from '@/components/Squiggle'
import CaptionBlock from '@/components/CaptionBlock'
import CarouselDesigner from '@/components/CarouselDesigner'
import BottomSheet from '../BottomSheet'
import VoiceSheet, { VOICE_MAX, VOICE_NEAR } from '../VoiceSheet'
import { useVoiceRecorder } from '@/lib/use-voice-recorder'
import { useDashboardMe } from '@/lib/dashboard-me'
import { track } from '@/lib/track'
import { isMaterials, spendLine, END, TARIFF_HREF, type Materials } from '@/lib/limit-texts'
import { dateRu } from '@/lib/billing/pay-texts'
import { FORMATY } from '@/lib/generation/zh13/formaty'

type Ready = {
  status: 'ready'; postId: string; groupId: string; kod: string; vid: 'reels' | 'carousel' | 'post'; imya: string
  glavnoe: string; podpis: string; nadpis: string; kakSnyat: string[]; podoydet: { kod: string; imya: string; pochemu: string }[]
  tema: string | null; mysl: string | null; edited?: string; text?: string
}
type Variant = Ready | { status: 'pending'; kod: string | null } | { status: 'failed'; kod: string | null; error: string; limit?: boolean; zanovo?: boolean; fromPostId?: string }

const SHADOW = 'shadow-[0_1px_2px_rgba(59,42,34,.05),0_8px_24px_rgba(59,42,34,.06)]'
const PAD = 'px-4 pt-3 lg:px-12 lg:pt-11 pb-8'
const VID: Record<string, string> = { reels: 'Рилс', carousel: 'Карусель', post: 'Пост' }
const GOING: Record<string, string> = { reels: 'Рилс пишется', carousel: 'Карусель собирается', post: 'Пост пишется' }
const GRUPPY = [{ vid: 'reels', imya: 'Рилсы' }, { vid: 'carousel', imya: 'Карусели' }, { vid: 'post', imya: 'Посты' }] as const
const imyaFormata = (kod: string | null) => (kod ? FORMATY.find(f => f.kod === kod)?.imya || kod : 'Подбери сам')
const vidFormata = (kod: string | null) => (kod ? FORMATY.find(f => f.kod === kod)?.vid || null : null)
const SBOY = 'Текст не дописался из-за сбоя в PsyCont.'
const TREBUET: Record<string, string> = { fakty: 'Только из твоих фактов: впиши их в «Свою мысль»', scena: 'Если в базе есть проверенная сцена под тему' }
const sub = (f: { korotko: string; trebuet?: string }) => (f.trebuet ? `${f.korotko}. ${TREBUET[f.trebuet]}` : f.korotko)

function deystvie(postId: string, action: 'copy' | 'copy_podpis' | 'edit') {
  fetch('/api/generate-post/zh13/deystvie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, action }) }).catch(() => {})
}

// реплики ролей («Психолог:», «Клиентка:») и надписи по кадрам: метка жирным, текст обычным
function Glavnoe({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <div key={i} className="space-y-1.5">
          {b.split('\n').map((l, j) => {
            const m = l.match(/^\s*([А-ЯЁA-Z][А-Яа-яЁёA-Za-z\s\d-]{0,24}):\s+(.*)$/u)
            return (
              <p key={j} className="text-[16px] leading-[26px] lg:text-[17px] lg:leading-[28px] text-brand-text whitespace-pre-wrap break-words">
                {m ? <><span className="font-semibold">{m[1]}:</span> {m[2]}</> : l}
              </p>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function KakSnyat({ v, open, onToggle, aside }: { v: Ready; open: boolean; onToggle: () => void; aside?: boolean }) {
  const [copied, setCopied] = useState(false)
  if (v.vid !== 'reels' || !v.kakSnyat.length) return null
  // хук и плашки по ходу ролика: «Плашки:» с новой строки, по-человечески
  const nadpis = v.nadpis.replace(/[;,.]?\s*Плашки?:\s*/i, '\nПо ходу: ').trim()
  const body = (
    <div className={aside ? 'mt-3' : 'px-4 pb-4'}>
      <ol className="space-y-2.5">
        {v.kakSnyat.map((s, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-[22px] text-brand-text">
            <span className="w-6 h-6 shrink-0 rounded-full bg-brand-soft-2 text-[13px] font-semibold flex items-center justify-center tabular-nums">{i + 1}</span>
            <span className="min-w-0 break-words">{s}</span>
          </li>
        ))}
      </ol>
      {nadpis && v.kod !== 'ekran' && (
        <div className="mt-3 rounded-xl bg-brand-soft px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-brand-text">Надпись на видео</p>
            <button type="button" onClick={() => { navigator.clipboard.writeText(nadpis).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {}) }}
              className="h-8 -my-1 px-2 text-[13px] font-semibold text-brand-accent cursor-pointer">{copied ? 'Скопировано' : 'Скопировать'}</button>
          </div>
          <p className="mt-1 text-[15px] leading-[22px] text-brand-text break-words whitespace-pre-wrap">{nadpis}</p>
        </div>
      )}
    </div>
  )
  if (aside) return (
    <div className={`rounded-[20px] bg-brand-card ${SHADOW} p-5`}>
      <p className="text-[17px] font-semibold text-brand-text">Как снять</p>
      {body}
    </div>
  )
  return (
    <div className="mt-3 rounded-2xl border border-brand-border bg-brand-card">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full min-h-11 px-4 py-2.5 flex items-center gap-2 text-left cursor-pointer">
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-brand-text">Как снять <span className="font-normal text-brand-muted">· {v.kakSnyat.length} {v.kakSnyat.length < 5 ? 'шага' : 'шагов'}</span></span>
        <ChevronDown className={`w-5 h-5 text-brand-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && body}
    </div>
  )
}

export default function Zh13Flow() {
  const { me, typing, refresh: refreshMe } = useDashboardMe()
  const materials: Materials | null = isMaterials(me?.materials) ? me.materials : null
  const until = useMemo(() => { try { return me?.paidUntil ? dateRu(me.paidUntil) : undefined } catch { return undefined } }, [me?.paidUntil])
  const noMaterials = !!materials && materials.remaining <= 0

  const [mysl, setMysl] = useState('')
  const [formatKod, setFormatKod] = useState<string | null>(null)
  const [formatOpen, setFormatOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [topic, setTopic] = useState<string | null>(null)
  const [varianty, setVarianty] = useState<Variant[]>([])
  const [idx, setIdx] = useState(0)
  const [view, setView] = useState<'compose' | 'result'>('compose')
  const [composeError, setComposeError] = useState<{ text: string; limit?: boolean } | null>(null)
  const [kakOpen, setKakOpen] = useState(false)
  const [vseOpen, setVseOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [spisokOpen, setSpisokOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [slow, setSlow] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // тема из адреса (план, «На сегодня»): пишем на нее, а не на тему по кругу
    let post = ''
    try {
      const sp = new URLSearchParams(window.location.search)
      const t = sp.get('topic'); if (t && t.trim()) setTopic(t.trim().slice(0, 300))
      post = sp.get('post') || ''
    } catch {}
    // свой текст из «Моих текстов» (?post=<id>): сразу результат
    if (post) fetch(`/api/generate-post/zh13?post=${encodeURIComponent(post)}`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (d && typeof d.glavnoe === 'string') { setVarianty([{ status: 'ready', ...d }]); setIdx(0); setView('result') }
    }).catch(() => {})
  }, [])

  const appendVoice = useCallback((v: string) => setMysl(prev => (prev.trim() ? `${prev.trim()} ${v}` : v)), [])
  const rec = useVoiceRecorder(appendVoice, { maxSeconds: VOICE_MAX, nearSeconds: VOICE_NEAR })
  const transcribing = rec.state === 'transcribing'

  const cur = varianty[idx]
  const ready = cur?.status === 'ready' ? cur : null
  const busy = varianty.some(v => v.status === 'pending')
  const lastReady = [...varianty].reverse().find((v): v is Ready => v.status === 'ready') || null

  useEffect(() => {
    if (!busy) { setSlow(false); return }
    const t = setTimeout(() => setSlow(true), 60000)
    return () => clearTimeout(t)
  }, [busy])
  useEffect(() => { setExpanded(false); setEditing(false); setCopied(false); setVseOpen(false) }, [idx])

  const napisat = async (opts: { kod: string | null; fromPostId?: string; zanovo?: boolean; first?: boolean }) => {
    if (busy) return
    setComposeError(null)
    const pos = opts.first ? 0 : varianty.length
    setVarianty(prev => (opts.first ? [{ status: 'pending', kod: opts.kod }] : [...prev, { status: 'pending', kod: opts.kod }]))
    setIdx(pos)
    if (opts.first) setView('result')
    try {
      const r = await fetch('/api/generate-post/zh13', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: opts.kod || 'auto', ...(opts.fromPostId ? { fromPostId: opts.fromPostId, zanovo: !!opts.zanovo } : {}),
          ...(opts.first && mysl.trim() ? { mysl: mysl.trim() } : {}), ...(opts.first && topic && !mysl.trim() ? { topic } : {}),
          voice: rec.state !== 'idle',
        }),
      })
      const d = await r.json().catch(() => ({}))
      // 429 с server_error это сбой чтения счетчика, а не конец тарифа: показываем как обычный сбой
      if (r.status === 429 && d?.error !== 'server_error') {
        const text = typeof d?.message === 'string' && d.message.trim() ? d.message.trim() : END.trial.short
        if (opts.first) { setVarianty([]); setView('compose'); setComposeError({ text, limit: true }) }
        else setVarianty(prev => prev.map((v, i) => (i === pos ? { status: 'failed', kod: opts.kod, error: text, limit: true, zanovo: opts.zanovo, fromPostId: opts.fromPostId } : v)))
        return
      }
      // формат требует фактов о себе или сцены: понятное объяснение, ничего не списано
      if (r.status === 422 && typeof d?.message === 'string') {
        if (opts.first) { setVarianty([]); setView('compose'); setComposeError({ text: d.message }) }
        else setVarianty(prev => prev.map((v, i) => (i === pos ? { status: 'failed', kod: opts.kod, error: d.message } : v)))
        return
      }
      if (!r.ok || typeof d?.glavnoe !== 'string') throw new Error(String(r.status))
      const v: Ready = { status: 'ready', postId: d.postId, groupId: d.groupId, kod: d.kod, vid: d.vid, imya: d.imya, glavnoe: d.glavnoe, podpis: d.podpis || '', nadpis: d.nadpis || '', kakSnyat: d.kakSnyat || [], podoydet: d.podoydet || [], tema: d.tema, mysl: d.mysl, text: d.text }
      setVarianty(prev => prev.map((x, i) => (i === pos ? v : x)))
      refreshMe?.()
    } catch (e: any) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const text = offline ? 'Пропала связь. Проверь интернет и нажми еще раз, мысль на месте' : `${SBOY} ${opts.first ? 'Мысль на месте, попробуй через минуту' : 'Прошлый вариант на месте'}`
      if (opts.first) { setVarianty([]); setView('compose'); setComposeError({ text }) }
      else setVarianty(prev => prev.map((v, i) => (i === pos ? { status: 'failed', kod: opts.kod, error: text, zanovo: opts.zanovo, fromPostId: opts.fromPostId } : v)))
    }
  }

  const copyText = () => {
    if (!ready) return
    const t = ready.edited ?? ready.glavnoe
    navigator.clipboard.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) }).catch(() => {})
    track('material_take', { how: 'copy_text', format: ready.vid, post: ready.postId })
    // правка перед копированием идет в память голоса, как у zh6 (пара «было → стало»)
    if (ready.edited !== undefined && ready.edited !== ready.glavnoe) fetch('/api/voice-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'copy', postId: ready.postId, generated: ready.glavnoe, copied: t }) }).catch(() => {})
    deystvie(ready.postId, 'copy')
  }
  const drugoyFormat = (kod: string) => { if (lastReady && !noMaterials) napisat({ kod, fromPostId: (ready || lastReady).postId }) }
  const zanovo = () => { if (ready && !noMaterials) napisat({ kod: ready.kod, fromPostId: ready.postId, zanovo: true }) }

  const spend = materials ? spendLine(materials, 1, until) : ''
  const nuzhnyFakty = FORMATY.find(f => f.kod === formatKod)?.trebuet === 'fakty' && !mysl.trim()
  const stick = !typing && !noMaterials

  // ---------- ввод ----------
  if (view === 'compose') {
    return (
      <div className={`${PAD} xl:max-w-[752px]`}>
        <div className={`min-w-0 ${stick ? 'max-lg:pb-[120px]' : ''}`}>
          <h1 className="text-[26px] leading-8 lg:text-[32px] lg:leading-10 font-semibold tracking-[-0.3px] text-brand-text">О чем сегодня?</h1>
          <Squiggle variant={0} width="150px" />

          <div className={`mt-4 lg:mt-5 rounded-[20px] bg-brand-card ${SHADOW} ring-brand-accent/40 focus-within:ring-2 transition`}>
            <label htmlFor="zh13-mysl" className="block px-4 lg:px-5 pt-3.5 lg:pt-4 text-[14px] font-semibold text-brand-text">Своя мысль <span className="font-normal text-brand-muted">· можно пропустить</span></label>
            <textarea id="zh13-mysl" ref={area} value={mysl} onChange={e => setMysl(e.target.value)} readOnly={transcribing} rows={3}
              placeholder={transcribing ? 'Расшифровка...' : 'Что хочется сказать? Можно пару слов или голосом'}
              className={`block w-full resize-none bg-transparent px-4 lg:px-5 pt-1.5 text-[16px] lg:text-[17px] leading-[26px] text-brand-text placeholder:text-[#A39A8C] focus:outline-none ${transcribing ? 'animate-pulse' : ''}`} />
            <div className="h-[68px] flex items-center gap-2 pl-4 lg:pl-5 pr-3">
              <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-brand-muted" aria-live="polite">
                {transcribing ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Расшифровка...</span>
                  : mysl.trim() ? 'Текст будет из этой мысли, смысл не поменяется' : topic ? `Пусто? Напишу на тему «${topic}»` : 'Пусто? Напишу на тему из твоей анкеты'}
              </p>
              <button type="button" onClick={() => { rec.reset(); setVoiceOpen(true) }} disabled={transcribing} aria-label="Записать голосом"
                className="w-14 h-14 rounded-full bg-brand-accent text-white flex items-center justify-center hover:bg-brand-accent-hover active:scale-95 transition cursor-pointer disabled:opacity-50 shrink-0">
                <Mic className="w-6 h-6" />
              </button>
            </div>
          </div>
          {rec.state === 'error' && rec.errorKind === 'network' && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[14px] text-brand-text">
              <span className="min-w-0">Не получилось расшифровать. Запись цела</span>
              <button type="button" onClick={rec.retry} className="h-11 px-4 rounded-full border border-brand-border font-semibold cursor-pointer shrink-0">Еще раз</button>
            </div>
          )}

          <button type="button" onClick={() => setFormatOpen(true)} className="mt-3 w-full min-h-[52px] px-4 flex items-center gap-2 rounded-2xl border border-brand-border bg-brand-card text-left cursor-pointer hover:bg-brand-soft-2">
            <span className="text-[15px] text-brand-text-secondary shrink-0">Формат</span>
            <span className="min-w-0 flex-1 text-right text-[15px] font-semibold text-brand-text truncate">{imyaFormata(formatKod)}</span>
            <ChevronRight className="w-4 h-4 text-brand-muted shrink-0" />
          </button>

          {composeError && (
            <div role="status" className="mt-4 rounded-2xl bg-brand-card border border-brand-border p-4 text-[15px] text-brand-text">
              <p>{composeError.text}</p>
              {composeError.limit && <Link href={TARIFF_HREF} className="mt-2 inline-flex h-11 items-center px-4 rounded-xl border border-brand-border font-semibold">{END.button}</Link>}
            </div>
          )}

          <div className={`${stick ? 'max-lg:fixed max-lg:inset-x-0 max-lg:z-30 max-lg:bottom-[calc(56px+env(safe-area-inset-bottom))] max-lg:px-4 max-lg:pt-3 max-lg:pb-2 max-lg:bg-brand-bg max-lg:border-t max-lg:border-brand-border' : 'max-lg:mt-4'} lg:mt-6 lg:flex lg:items-center lg:gap-4`}>
            {nuzhnyFakty && <p className="mb-2 text-[14px] text-brand-text">Этот формат пишется только из твоих фактов. Впиши в «Свою мысль», что с тобой было</p>}
            <button type="button" onClick={() => napisat({ kod: formatKod, first: true })} disabled={noMaterials || transcribing || nuzhnyFakty}
              className={`w-full lg:w-auto h-[52px] lg:px-7 rounded-2xl text-[16px] font-semibold transition cursor-pointer disabled:cursor-not-allowed ${noMaterials ? 'bg-brand-border text-brand-text/70' : 'bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-60'}`}>
              {noMaterials ? (materials?.kind === 'month' ? END.monthButton : END.disabled) : 'Написать · 1 текст'}
            </button>
            {!noMaterials && <p className="max-lg:mt-1.5 max-lg:text-center text-[14px] leading-5 text-brand-muted" aria-live="polite">{spend || 'Около минуты, текст сохранится в «Моих текстах»'}</p>}
          </div>
        </div>

        <BottomSheet open={formatOpen} onClose={() => setFormatOpen(false)} title="Какой формат">
          <div className="pt-1 pb-2">
            {[{ kod: null as string | null, imya: 'Подбери сам', korotko: 'Формат выберется под тему' }, ...FORMATY.filter(f => f.kod === 'mysl')].map(f => (
              <FormatRow key={f.kod || 'auto'} imya={f.imya} sub={f.korotko} on={formatKod === f.kod} onClick={() => { setFormatKod(f.kod); setFormatOpen(false) }} />
            ))}
            {GRUPPY.map(g => (
              <div key={g.vid} className="mt-3">
                <p className="px-1 py-1.5 text-[13px] font-semibold text-brand-muted">{g.imya}</p>
                {FORMATY.filter(f => f.vid === g.vid && f.kod !== 'mysl').map(f => (
                  <FormatRow key={f.kod} imya={f.imya} sub={sub(f)} on={formatKod === f.kod} onClick={() => { setFormatKod(f.kod); setFormatOpen(false) }} />
                ))}
              </div>
            ))}
          </div>
        </BottomSheet>
        <VoiceSheet open={voiceOpen} rec={rec} onClose={() => setVoiceOpen(false)} onWriteText={() => { setVoiceOpen(false); setTimeout(() => area.current?.focus(), 50) }} prompt="Говори, как сказал бы в камеру. Паузы не страшны." />
      </div>
    )
  }

  // ---------- результат и ожидание ----------
  const n = varianty.length
  const pokazany = new Set([ready?.kod, ...(ready?.podoydet || []).map(p => p.kod)])
  const vse = FORMATY.filter(f => !pokazany.has(f.kod) && (f.trebuet !== 'fakty' || !!ready?.mysl))
  const podzagolovok = ready ? (ready.mysl ? `Из твоей мысли: ${ready.mysl}` : ready.tema ? `Тема: ${ready.tema}` : '') : mysl.trim() || topic || ''

  return (
    <div className={`${PAD} max-lg:pt-0`}>
      <div className="h-14 lg:h-11 flex items-center gap-2 max-lg:-mx-4 max-lg:px-4 max-lg:mb-3 max-lg:bg-brand-card max-lg:border-b max-lg:border-brand-border xl:max-w-[1104px]">
        <button type="button" onClick={() => { if (!busy) { setView('compose'); setVarianty([]); setIdx(0) } }} disabled={busy}
          className="h-11 -ml-2 pl-1 pr-2 inline-flex items-center gap-0.5 text-[15px] font-medium text-brand-text cursor-pointer shrink-0 disabled:opacity-40">
          <ChevronLeft className="w-5 h-5" /><span className="lg:hidden">Назад</span><span className="hidden lg:inline">Новая мысль</span>
        </button>
        <span className="flex-1" />
        {copied ? (
          <span role="status" className="shrink-0 h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-accent text-white text-[14px] font-semibold"><Check className="w-4 h-4" />Скопировано</span>
        ) : n > 1 ? (
          <div className="flex items-center gap-0.5 shrink-0" aria-label="Варианты">
            <button type="button" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Прошлый вариант" className="w-11 h-11 flex items-center justify-center rounded-full cursor-pointer disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
            <button type="button" onClick={() => setSpisokOpen(true)} className="h-11 px-1.5 text-[15px] font-medium text-brand-text tabular-nums cursor-pointer">{idx + 1} из {n}</button>
            <button type="button" onClick={() => setIdx(i => Math.min(n - 1, i + 1))} disabled={idx === n - 1} aria-label="Следующий вариант" className="w-11 h-11 flex items-center justify-center rounded-full cursor-pointer disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
          </div>
        ) : null}
      </div>

      {/* ожидание */}
      {cur?.status === 'pending' && (
        <div className="xl:max-w-[704px]">
          <p className="text-[14px] text-brand-muted truncate">{podzagolovok}</p>
          <div className={`mt-3 rounded-[20px] bg-brand-card ${SHADOW} p-6 lg:p-8`}>
            <p className="text-[20px] leading-7 font-semibold text-brand-text">{cur.kod ? GOING[vidFormata(cur.kod) || 'reels'] : 'Подбираю формат и пишу'}</p>
            {cur.kod && <p className="mt-1 text-[15px] text-brand-text-secondary">{imyaFormata(cur.kod)}</p>}
            <svg viewBox="0 0 240 24" className="mt-5 w-full max-w-[320px] h-6 text-brand-sage" aria-hidden>
              <path d="M0 12 C 20 2, 40 22, 60 12 S 100 2, 120 12 S 160 22, 180 12 S 220 2, 240 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="motion-safe:animate-pulse" />
            </svg>
            <p className="mt-4 text-[15px] leading-[22px] text-brand-text-secondary">
              {slow ? 'Пишется дольше обычного. Текст не потеряется, он появится здесь или в «Моих текстах»' : 'Обычно это 20-60 секунд. Можно закрыть вкладку, текст сохранится в «Моих текстах»'}
            </p>
            {idx > 0 && <button type="button" onClick={() => setIdx(idx - 1)} className="mt-4 h-11 inline-flex items-center gap-1 text-[15px] font-semibold text-brand-accent cursor-pointer"><ChevronLeft className="w-4 h-4" />Прошлый вариант на месте</button>}
          </div>
        </div>
      )}

      {cur?.status === 'failed' && (
        <div className={`xl:max-w-[704px] rounded-[20px] bg-brand-card ${SHADOW} p-5`}>
          <p className="text-[15px] text-brand-text">{cur.error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cur.limit ? <Link href={TARIFF_HREF} className="h-11 inline-flex items-center px-5 rounded-xl bg-brand-accent text-white font-semibold">{END.button}</Link>
              : <button type="button" disabled={busy} onClick={() => { const k = cur.kod, z = cur.zanovo, from = cur.fromPostId || lastReady?.postId; setVarianty(prev => prev.filter((_, i) => i !== idx)); setIdx(Math.max(0, idx - 1)); if (from) napisat({ kod: k, fromPostId: from, zanovo: z }) }} className="h-11 px-5 rounded-xl bg-brand-accent text-white font-semibold cursor-pointer disabled:opacity-50">Попробовать еще раз</button>}
            {idx > 0 && <button type="button" onClick={() => setIdx(idx - 1)} className="h-11 px-4 rounded-xl border border-brand-border font-semibold cursor-pointer">К прошлому варианту</button>}
          </div>
        </div>
      )}

      {ready && (
        <div className="xl:flex xl:items-start xl:gap-10 max-lg:pb-[84px]">
          <div className="min-w-0 xl:w-[704px] xl:shrink-0">
            <p className="text-[13px] leading-5 text-brand-muted truncate">{VID[ready.vid]}{podzagolovok ? ` · ${podzagolovok}` : ''}</p>
            <h1 className="mt-0.5 text-[20px] leading-7 lg:text-[24px] lg:leading-8 font-semibold text-brand-text break-words">{ready.imya}</h1>

            <div className="xl:hidden"><KakSnyat v={ready} open={kakOpen} onToggle={() => setKakOpen(o => !o)} /></div>

            {/* компьютер: действия над текстом, чтобы «Скопировать» не уезжала под длинный текст */}
            {!editing && (
            <div className="hidden lg:flex mt-3 flex-wrap items-center gap-2.5">
              <button type="button" onClick={copyText} className="h-12 min-w-[220px] px-6 rounded-2xl bg-brand-accent text-white font-semibold cursor-pointer hover:bg-brand-accent-hover">{copied ? 'Скопировано' : 'Скопировать текст'}</button>
              <button type="button" onClick={zanovo} disabled={busy || noMaterials} className="h-12 px-5 rounded-2xl border border-brand-border text-brand-text font-semibold cursor-pointer hover:bg-brand-soft-2 disabled:opacity-40">Сделать заново · 1 текст</button>
              <button type="button" onClick={() => setEditing(true)} className="h-12 px-4 rounded-2xl text-brand-text-secondary font-semibold cursor-pointer hover:bg-brand-soft-2">Править</button>
            </div>
            )}
            <div className={`mt-3 rounded-[20px] bg-brand-card ${SHADOW} p-5 lg:px-[30px] lg:py-7 min-w-0`}>
              {editing ? (
                <>
                  <textarea value={ready.edited ?? ready.glavnoe} autoFocus aria-label="Текст"
                    onChange={e => { const t = e.target.value; setVarianty(prev => prev.map((v, i) => (i === idx && v.status === 'ready' ? { ...v, edited: t } : v))) }}
                    rows={Math.min(24, Math.max(8, (ready.edited ?? ready.glavnoe).split('\n').length + 2))}
                    className="w-full px-3 py-2.5 rounded-xl border border-brand-border bg-white text-brand-text text-[16px] leading-relaxed focus:outline-none focus:border-brand-accent resize-y" />
                  <button type="button" onClick={() => { setEditing(false); if (ready.edited !== undefined && ready.edited !== ready.glavnoe) deystvie(ready.postId, 'edit') }} className="mt-3 h-11 px-5 rounded-xl bg-brand-accent text-white font-semibold cursor-pointer">Готово</button>
                </>
              ) : (
                <>
                  <div className={`relative ${!expanded ? 'max-lg:max-h-[222px] max-lg:overflow-hidden' : ''}`}>
                    <Glavnoe text={ready.edited ?? ready.glavnoe} />
                    {!expanded && <span aria-hidden="true" className="lg:hidden absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-brand-card to-brand-card/0" />}
                  </div>
                  {/* телефон: под текстом всегда видно, что есть другие форматы (тройка ниже первого экрана) */}
                  <div className="lg:hidden mt-1 flex items-center justify-between gap-2">
                    {!expanded ? <button type="button" onClick={() => setExpanded(true)} className="h-11 text-[15px] font-semibold text-brand-text-secondary cursor-pointer">Читать целиком</button> : <span />}
                    <button type="button" onClick={() => document.getElementById('zh13-eshe')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="h-11 inline-flex items-center gap-1 text-[15px] font-semibold text-brand-accent cursor-pointer">Подойдет еще<ChevronDown className="w-4 h-4" /></button>
                  </div>
                </>
              )}
            </div>

            {ready.podpis && (
              <div className="mt-3">
                <CaptionBlock caption={ready.podpis} title={ready.vid === 'carousel' ? 'Подпись под каруселью' : 'Подпись под роликом'} format={ready.vid} postId={ready.postId} onCopy={() => deystvie(ready.postId, 'copy_podpis')} />
              </div>
            )}

            {/* карусель пишет zh6: оформление слайдов то же, что на проде */}
            {ready.vid === 'carousel' && ready.text && (
              <div className="mt-4"><CarouselDesigner key={ready.postId} postId={ready.postId} text={ready.edited ?? ready.text}
                onTextChange={t => setVarianty(prev => prev.map((v, i) => (i === idx && v.status === 'ready' ? { ...v, text: t } : v)))} /></div>
            )}

            {/* Подойдет еще */}
            <section className={`mt-4 rounded-[20px] bg-brand-card ${SHADOW} p-4 lg:p-5 scroll-mt-16`} aria-labelledby="zh13-eshe-h" id="zh13-eshe">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="zh13-eshe-h" className="text-[17px] font-semibold text-brand-text">Подойдет еще</h2>
                <p className="text-[13px] text-brand-muted text-right">{noMaterials ? END.trial.short : `Каждый вариант это 1 текст${materials ? ` · осталось ${materials.remaining}` : ''}`}</p>
              </div>
              <div className="mt-2 divide-y divide-brand-border">
                {ready.podoydet.map(p => (
                  <button key={p.kod} type="button" onClick={() => drugoyFormat(p.kod)} disabled={busy || noMaterials}
                    className="w-full min-h-16 py-2.5 flex items-center gap-3 text-left cursor-pointer disabled:opacity-40 group">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold text-brand-text">{p.imya}</span>
                      <span className="block mt-0.5 text-[14px] leading-5 text-brand-text-secondary break-words">{p.pochemu}</span>
                    </span>
                    <ArrowRight className="w-5 h-5 text-brand-muted group-hover:text-brand-accent shrink-0" />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setVseOpen(o => !o)} aria-expanded={vseOpen} className="mt-1 h-11 inline-flex items-center gap-1 text-[15px] font-semibold text-brand-accent cursor-pointer">
                Все форматы<ChevronDown className={`w-4 h-4 transition-transform ${vseOpen ? 'rotate-180' : ''}`} />
              </button>
              {vseOpen && (
                <div className="mt-1">
                  {vse.filter(f => f.kod === 'mysl').map(f => <FormatRow key={f.kod} imya={f.imya} sub={sub(f)} disabled={busy || noMaterials} onClick={() => drugoyFormat(f.kod)} />)}
                  {GRUPPY.map(g => {
                    const xs = vse.filter(f => f.vid === g.vid && f.kod !== 'mysl')
                    if (!xs.length) return null
                    return (
                      <div key={g.vid} className="mt-2">
                        <p className="px-1 py-1.5 text-[13px] font-semibold text-brand-muted">{g.imya}</p>
                        {xs.map(f => <FormatRow key={f.kod} imya={f.imya} sub={sub(f)} disabled={busy || noMaterials} onClick={() => drugoyFormat(f.kod)} />)}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          {/* на компьютере справа «Как снять», раскрыт всегда */}
          {ready.vid === 'reels' && (
            <aside className="hidden xl:block w-[360px] shrink-0 sticky top-6 mt-[112px]">
              <KakSnyat v={ready} open onToggle={() => {}} aside />
            </aside>
          )}

          {/* телефон: липкая панель над нижним меню */}
          {!typing && !editing && (
            <div className="lg:hidden fixed inset-x-0 z-30 bottom-[calc(56px+env(safe-area-inset-bottom))] bg-brand-card border-t border-brand-border">
              <div className="flex items-center gap-2 px-4 py-2.5">
                <button type="button" onClick={copyText} className="flex-1 min-w-0 h-12 rounded-2xl bg-brand-accent text-white text-[16px] font-semibold cursor-pointer">{copied ? 'Скопировано' : 'Скопировать текст'}</button>
                <button type="button" onClick={() => setMoreOpen(true)} aria-label="Еще" className="w-12 h-12 shrink-0 rounded-2xl border border-brand-border flex items-center justify-center cursor-pointer"><MoreHorizontal className="w-5 h-5" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Еще">
        <div className="pt-1">
          <button type="button" onClick={() => { setMoreOpen(false); zanovo() }} disabled={busy || noMaterials} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-40">Сделать заново · 1 текст</button>
          <button type="button" onClick={() => { setMoreOpen(false); setEditing(true) }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Править текст</button>
          {n > 1 && <button type="button" onClick={() => { setMoreOpen(false); setSpisokOpen(true) }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Прошлые варианты</button>}
        </div>
      </BottomSheet>

      <BottomSheet open={spisokOpen} onClose={() => setSpisokOpen(false)} title="Прошлые варианты">
        <div className="pt-1 pb-2 space-y-1">
          {varianty.map((v, i) => (
            <button key={i} type="button" onClick={() => { setIdx(i); setSpisokOpen(false) }} aria-current={i === idx ? 'true' : undefined}
              className={`w-full min-h-[56px] px-3 py-2 rounded-xl flex items-center gap-3 text-left cursor-pointer ${i === idx ? 'bg-brand-soft' : 'hover:bg-brand-soft-2'}`}>
              <span className="w-6 text-[14px] text-brand-muted tabular-nums shrink-0">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-brand-text truncate">{v.status === 'ready' ? v.imya : imyaFormata(v.kod)}</span>
                <span className="block text-[13px] text-brand-muted truncate">{v.status === 'ready' ? (v.edited ?? v.glavnoe).split('\n')[0] : v.status === 'pending' ? 'Пишется' : 'Не дописался'}</span>
              </span>
              {i === idx && <Check className="w-4 h-4 text-brand-accent shrink-0" />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}

function FormatRow({ imya, sub, on, disabled, onClick }: { imya: string; sub?: string; on?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`w-full min-h-[52px] px-3 py-2 rounded-xl flex items-center gap-3 text-left cursor-pointer disabled:opacity-40 ${on ? 'bg-brand-soft' : 'hover:bg-brand-soft-2'}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-brand-text">{imya}</span>
        {sub && <span className="block text-[13px] leading-[18px] text-brand-text-secondary">{sub}</span>}
      </span>
      {on && <Check className="w-4 h-4 text-brand-accent shrink-0" />}
    </button>
  )
}
