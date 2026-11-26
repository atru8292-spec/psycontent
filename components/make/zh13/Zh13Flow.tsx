'use client'

// Экран «Сделать» для генератора zh13 (19.11, у всех по умолчанию: /api/me zh13). Спецификация designer-psycont 19.11,
// правки по аудиту UI 19.11 (Б1, Б2, В1-В5, В14, В15, В18):
// ввод (своя мысль голосом или текстом, формат заранее, по умолчанию «Под тему») → ожидание → результат.
// Финал знакомства передает тему и одноразовый признак go (lib/make-handoff.ts): первый текст пишется сразу.
// Тексты кончились: вместо серой кнопки карточка с путем к оплате (EndCard).
// Результат: крупный заголовок из темы или первой строки, вид и формат серой строкой над ним, текст целиком,
// «Править текст» в карточке, «Описание» своим блоком, после копирования «Уже в блоге? Отметь» и «Следующая тема»,
// ниже «Эта же мысль в другом формате». На телефоне шапки кабинета и нижнего меню нет (useShellBare), снизу липко
// «Скопировать текст» и «•••». Рилс: «Как снять» справа с 1280 px (колонка текста гибкая), на телефоне свернутым блоком.
// Карусель: слайды в первом предложенном стиле сверху, главная «Сохранить слайды», копирование текста в «•••».
// Тап по формату пишет новый вариант на ту же тему или мысль (на пробном один раз за сессию спрашиваем про трату),
// прошлые остаются (стрелки и лист «Прошлые варианты»). Каждый формат это 1 текст. Генерация /api/generate-post/zh13.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ChevronDown, Mic, Loader2, Check, MoreHorizontal, ArrowRight, Copy, PenLine } from 'lucide-react'
import Squiggle from '@/components/Squiggle'
import CaptionBlock from '@/components/CaptionBlock'
import CarouselDesigner from '@/components/CarouselDesigner'
import { useShellBare } from '@/components/dashboard/DashboardShell'
import BottomSheet from '../BottomSheet'
import VoiceSheet, { VOICE_MAX, VOICE_NEAR } from '../VoiceSheet'
import EndCard from './EndCard'
import HelpCard from './HelpCard'
import PohozheNaTebya from './PohozheNaTebya'
import { BTN_P, BTN_S, BTN_T } from './knopki'
import { useVoiceRecorder } from '@/lib/use-voice-recorder'
import { useDashboardMe } from '@/lib/dashboard-me'
import { track } from '@/lib/track'
import { goalFirst, prepareFirsts } from '@/lib/metrika'
import { isMaterials, spendLine, shagov, END, TARIFF_HREF, TRIAL_SPEND, type Materials } from '@/lib/limit-texts'
import { dateRu } from '@/lib/billing/pay-texts'
import { FORMATY, imyaNaEkrane, korotkoNaEkrane, sZaglavnoy } from '@/lib/generation/zh13/formaty'
import { readMakeParam, takeMakeOnce } from '@/lib/make-handoff'

type Ready = {
  status: 'ready'; postId: string; groupId: string; kod: string; vid: 'reels' | 'carousel' | 'post'; imya: string
  glavnoe: string; podpis: string; nadpis: string; kakSnyat: string[]; podoydet: { kod: string; imya: string; pochemu: string }[]
  tema: string | null; mysl: string | null; edited?: string; text?: string
  // после копирования или сохранения слайдов: строка «Уже в блоге? Отметь»
  vzyat?: boolean; otmetka?: 'busy' | 'done' | 'fail'
}
type Variant = Ready | { status: 'pending'; kod: string | null } | { status: 'failed'; kod: string | null; error: string; limit?: boolean; zanovo?: boolean; fromPostId?: string }

// Запуск генерации идет (26.11, активация): отметка в sessionStorage до запроса. Если ответ оборвался (связь,
// свернутый браузер, обновление страницы), а сервер текст дописал и списал, экран спрашивает его по ?since=
// до 4 минут и показывает, вместо «сбоя» и второго потраченного пробного (как psycont_make_running у MakeFlow).
const RUN_KEY = 'psy_zh13_run'
const RUN_WAIT_MS = 4 * 60000
const readRun = (): { t: number } | null => { try { const r = JSON.parse(sessionStorage.getItem(RUN_KEY) || 'null'); return r && typeof r.t === 'number' && Date.now() - r.t < RUN_WAIT_MS ? r : null } catch { return null } }
const markRun = (t: number) => { try { sessionStorage.setItem(RUN_KEY, JSON.stringify({ t })) } catch {} }
const clearRun = () => { try { sessionStorage.removeItem(RUN_KEY) } catch {} }
const sleepMs = (ms: number) => new Promise(r => setTimeout(r, ms))
// текст, записанный после t (минус 5 с на расхождение часов), или null, когда от t прошло 4 минуты
async function zhdatTekst(t: number): Promise<any | null> {
  while (Date.now() - t < RUN_WAIT_MS) {
    try {
      const r = await fetch(`/api/generate-post/zh13?since=${t - 5000}`, { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); if (typeof d?.glavnoe === 'string') return d }
    } catch { /* связи нет: ждем дальше */ }
    await sleepMs(5000)
  }
  return null
}

const SHADOW = 'shadow-[0_1px_2px_rgba(59,42,34,.05)]'
const PAD = 'px-4 pt-3 lg:px-12 lg:pt-11 pb-8'
const VID: Record<string, string> = { reels: 'Рилс', carousel: 'Карусель', post: 'Пост' }
const GOING: Record<string, string> = { reels: 'Рилс пишется', carousel: 'Карусель собирается', post: 'Пост пишется' }
const GRUPPY = [{ vid: 'reels', imya: 'Рилсы' }, { vid: 'carousel', imya: 'Карусели' }, { vid: 'post', imya: 'Посты' }] as const
const AUTO = { imya: 'Под тему', korotko: 'PsyCont выберет формат под тему' }
const imyaFormata = (kod: string | null) => (kod ? imyaNaEkrane(kod) : AUTO.imya)
const vidFormata = (kod: string | null) => (kod ? FORMATY.find(f => f.kod === kod)?.vid || null : null)
const SBOY = 'Текст не дописался из-за сбоя в PsyCont.'
const FAKTY = 'Тут нужна твоя история. Впиши в «Свою мысль», что с тобой было'
const TREBUET: Record<string, string> = { fakty: 'Нужна твоя история, впиши ее в «Свою мысль»', scena: 'Сработает, если под тему найдется подходящий фильм' }
const sub = (f: { kod: string; trebuet?: string }) => {
  const k = korotkoNaEkrane(f.kod)
  return f.trebuet ? `${k}. ${TREBUET[f.trebuet]}` : k
}
const TRIAL_OK = 'psy_trial_spend_ok' // sessionStorage: на пробном уже согласились тратить на другие форматы

// Заголовок результата: тема, своя мысль или первая строка текста, до ~60 знаков по границе слова
function zagolovok(v: Ready): string {
  const pervaya = (v.edited ?? v.glavnoe).split('\n').map(l => l.trim()).find(Boolean) || ''
  const src = (v.tema || v.mysl || pervaya).replace(/^[А-ЯЁA-Z][А-Яа-яЁёA-Za-z\s\d-]{0,24}:\s+/u, '').replace(/\s+/g, ' ').trim()
  if (src.length <= 60) return sZaglavnoy(src)
  const cut = src.slice(0, 60)
  const sp = cut.lastIndexOf(' ')
  return sZaglavnoy(`${(sp > 30 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/u, '')}…`)
}
// серая строка над заголовком: «Пост · Признание», «Рилс · Кусок сессии», у карусели просто «Карусель»
const rubrika = (v: Ready) => (v.vid === 'carousel' ? VID.carousel : `${VID[v.vid]} · ${imyaNaEkrane(v.kod)}`)

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

// На телефоне длинный текст свернут примерно на экран (15 строк по 26 px) с затуханием и «Читать дальше».
// Короче 16 строк показывается целиком. На десктопе всегда целиком. Копируется всегда весь текст.
const SVERNUTO_PX = 15 * 26
const POROG_PX = 16 * 26
function Svernutyi({ open, onOpen, children }: { open: boolean; onOpen: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dlinnyi, setDlinnyi] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mq = window.matchMedia('(min-width: 1024px)')
    const check = () => setDlinnyi(!mq.matches && el.scrollHeight > POROG_PX + 8)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    mq.addEventListener('change', check)
    return () => { ro.disconnect(); mq.removeEventListener('change', check) }
  }, [])
  const svernut = dlinnyi && !open
  return (
    <div>
      <div ref={ref} className="relative overflow-hidden" style={svernut ? { maxHeight: SVERNUTO_PX } : undefined}>
        {children}
        {svernut && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-brand-card" />}
      </div>
      {svernut && (
        <button type="button" onClick={onOpen} className={`mt-1 -ml-2 ${BTN_T}`}>Читать дальше<ChevronDown className="w-4 h-4" /></button>
      )}
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
              className="h-11 -my-2 px-2 text-[13px] font-semibold text-brand-accent cursor-pointer">{copied ? 'Скопировано' : 'Скопировать'}</button>
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
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-brand-text">Как снять <span className="font-normal text-brand-muted">· {shagov(v.kakSnyat.length)}</span></span>
        <ChevronDown className={`w-5 h-5 text-brand-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && body}
    </div>
  )
}

export default function Zh13Flow() {
  const { me, loaded: meLoaded, typing, refresh: refreshMe } = useDashboardMe()
  // ответ базы «было ли раньше» нужен до первого нажатия «Написать» (цели Метрики make_first_click, first_material)
  useEffect(() => { prepareFirsts() }, [])
  const materials: Materials | null = isMaterials(me?.materials) ? me.materials : null
  const until = useMemo(() => { try { return me?.paidUntil ? dateRu(me.paidUntil) : undefined } catch { return undefined } }, [me?.paidUntil])
  const noMaterials = !!materials && materials.remaining <= 0
  const planCode: string | null = me?.plan?.code ?? null
  const paymentsOn = me?.paymentsOn === true

  const [mysl, setMysl] = useState('')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [formatKod, setFormatKod] = useState<string | null>(null)
  const [formatOpen, setFormatOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [topic, setTopic] = useState<string | null>(null)
  // тема, которую сервер возьмет при пустом поле (26.11): только для подсказки, на сервер не уходит, он выберет сам
  const [temaKruga, setTemaKruga] = useState<string | null>(null)
  const [varianty, setVarianty] = useState<Variant[]>([])
  const [idx, setIdx] = useState(0)
  const [view, setView] = useState<'compose' | 'result'>('compose')
  const [composeError, setComposeError] = useState<{ text: string; limit?: boolean } | null>(null)
  const [kakOpen, setKakOpen] = useState(false)
  const [vseOpen, setVseOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [spisokOpen, setSpisokOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [polnost, setPolnost] = useState(false) // «Читать дальше» на телефоне
  const [copied, setCopied] = useState(false)
  const [slow, setSlow] = useState(false)
  const [trialAsk, setTrialAsk] = useState<string | null>(null) // формат, который ждет «Потратить 1 пробный текст?»
  const area = useRef<HTMLTextAreaElement>(null)
  const doneBar = useRef<HTMLDivElement>(null)
  const autoRan = useRef(false)

  useEffect(() => {
    // тема из адреса или из передачи по ключу h (финал знакомства, «Темы», «Идеи» кладут ее в sessionStorage,
    // lib/make-handoff.ts): пишем на нее, а не на тему по кругу
    const t = readMakeParam('topic'); if (t && t.trim()) setTopic(t.trim().slice(0, 300))
    // «Написать карусель» (оформление каруселей, старая страница карусели): сразу формат карусели
    if (readMakeParam('format') === 'carousel' && FORMATY.some(f => f.kod === 'karusel')) setFormatKod('karusel')
    const post = readMakeParam('post') || ''
    // свой текст из «Моих текстов» (?post=<id>): сразу результат; старый текст (404) открывает прежний экран (make/page.tsx)
    if (post) fetch(`/api/generate-post/zh13?post=${encodeURIComponent(post)}`).then(async r => {
      if (r.status === 404) return
      const d = r.ok ? await r.json() : null
      if (d && typeof d.glavnoe === 'string') { setVarianty([{ status: 'ready', ...d }]); setIdx(0); setView('result') }
      else setComposeError({ text: 'Не получилось открыть текст. Обнови страницу, он сохранен в «Моих текстах»' })
    }).catch(() => setComposeError({ text: 'Не получилось открыть текст. Проверь интернет и обнови страницу' }))
    // страницу обновили, пока писался текст: показываем ожидание и ждем его (26.11)
    const run = post ? null : readRun()
    if (run) {
      setVarianty([{ status: 'pending', kod: null }]); setIdx(0); setView('result')
      void zhdatTekst(run.t).then(d => {
        clearRun()
        if (d) { setVarianty([{ status: 'ready', ...d }]); refreshMe?.() }
        else { setVarianty([]); setView('compose'); setComposeError({ text: `${SBOY} Попробуй через минуту` }) }
      })
    }
  }, [])

  // при каждом возврате к вводу: какая тема будет при пустом поле (после текста круг сдвигается)
  useEffect(() => {
    if (view !== 'compose' || topic) return
    let on = true
    fetch('/api/generate-post/zh13?tema=1', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      .then(d => { if (on) setTemaKruga(typeof d?.tema === 'string' && d.tema.trim() ? d.tema.trim().slice(0, 300) : null) }).catch(() => {})
    return () => { on = false }
  }, [view, topic])

  const appendVoice = useCallback((v: string) => setMysl(prev => (prev.trim() ? `${prev.trim()} ${v}` : v)), [])
  const rec = useVoiceRecorder(appendVoice, { maxSeconds: VOICE_MAX, nearSeconds: VOICE_NEAR })
  const transcribing = rec.state === 'transcribing'

  const cur = varianty[idx]
  const ready = cur?.status === 'ready' ? cur : null
  const busy = varianty.some(v => v.status === 'pending')
  const lastReady = [...varianty].reverse().find((v): v is Ready => v.status === 'ready') || null
  // телефон: на готовом тексте без шапки кабинета и нижнего меню (В2). Держим и пока пишется новый вариант
  // (ready → pending), если готовый уже был: иначе меню мигает на каждом «Еще вариант»
  const bare = view === 'result' && !!lastReady
  useShellBare(bare)

  useEffect(() => {
    if (!busy) { setSlow(false); return }
    const t = setTimeout(() => setSlow(true), 60000)
    return () => clearTimeout(t)
  }, [busy])
  useEffect(() => { setEditing(false); setCopied(false); setVseOpen(false); setPolnost(false) }, [idx])

  // правка на телефоне: клавиатура кладется поверх, «Готово» держим над ней (тот же прием, что в анкете express)
  useEffect(() => {
    if (!editing) return
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const onResize = () => doneBar.current?.scrollIntoView({ block: 'nearest' })
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [editing])

  const patchPost = (postId: string, patch: Partial<Ready>) =>
    setVarianty(prev => prev.map(v => (v.status === 'ready' && v.postId === postId ? { ...v, ...patch } : v)))

  const napisat = async (opts: { kod: string | null; fromPostId?: string; zanovo?: boolean; first?: boolean; topic?: string }) => {
    if (busy) return
    setComposeError(null)
    const pos = opts.first ? 0 : varianty.length
    const tema = opts.topic ?? topic
    setVarianty(prev => (opts.first ? [{ status: 'pending', kod: opts.kod }] : [...prev, { status: 'pending', kod: opts.kod }]))
    setIdx(pos)
    if (opts.first) setView('result')
    // цель Метрики «первый запуск» (один раз на человека); база отвечает до того, как сервер запишет make_start (26.11)
    void goalFirst('make')
    const runT = Date.now()
    markRun(runT)
    // ответ оборвался, а текст мог дописаться: ждем его до 4 минут, только потом сбой
    const iskat = async (): Promise<boolean> => {
      const d = await zhdatTekst(runT)
      if (!d) return false
      clearRun()
      setVarianty(prev => prev.map((x, i) => (i === pos ? { status: 'ready', ...d } : x)))
      refreshMe?.()
      return true
    }
    try {
      const r = await fetch('/api/generate-post/zh13', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: opts.kod || 'auto', ...(opts.fromPostId ? { fromPostId: opts.fromPostId, zanovo: !!opts.zanovo } : {}),
          ...(opts.first && mysl.trim() ? { mysl: mysl.trim() } : {}), ...(opts.first && tema && !mysl.trim() ? { topic: tema } : {}),
          voice: rec.state !== 'idle',
        }),
      })
      // 502/503/504: оборвал прокси (предел 120 с), сервер мог дописать
      if (r.status >= 502 && r.status <= 504 && await iskat()) return
      clearRun()
      const d = await r.json().catch(() => ({}))
      // 429 с server_error это сбой чтения счетчика, а не конец тарифа: показываем как обычный сбой
      if (r.status === 429 && d?.error !== 'server_error') {
        const text = typeof d?.message === 'string' && d.message.trim() ? d.message.trim() : END.trial.short
        // остаток перечитываем: при нуле вместо кнопки встанет карточка с тарифом
        refreshMe?.()
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
      void goalFirst('material') // цель Метрики: первый готовый текст
      refreshMe?.()
    } catch (e: any) {
      if (await iskat()) return
      clearRun()
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const text = offline ? 'Пропала связь. Проверь интернет и нажми еще раз, мысль на месте' : `${SBOY} ${opts.first ? 'Мысль на месте, попробуй через минуту' : 'Прошлый вариант на месте'}`
      if (opts.first) { setVarianty([]); setView('compose'); setComposeError({ text }) }
      else setVarianty(prev => prev.map((v, i) => (i === pos ? { status: 'failed', kod: opts.kod, error: text, zanovo: opts.zanovo, fromPostId: opts.fromPostId } : v)))
    }
  }

  // Б1: финал знакомства («Написать первый текст») передал тему и go=1: пишем сразу, без второго нажатия.
  // Признак стирается при чтении (takeMakeOnce), ref страхует от второго запуска при перерисовке.
  // Текстов нет: не запускаем, на вводе стоит карточка с тарифом
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    if (takeMakeOnce('go') !== '1' || readMakeParam('post')) return
    const t = (readMakeParam('topic') || '').trim().slice(0, 300)
    if (!t || noMaterials) return
    napisat({ kod: null, first: true, topic: t })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const copyText = () => {
    if (!ready) return
    const t = ready.edited ?? ready.glavnoe
    navigator.clipboard.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) }).catch(() => {})
    track('material_take', { how: 'copy_text', format: ready.vid, post: ready.postId })
    // правка перед копированием идет в память голоса, как у zh6 (пара «было → стало»)
    if (ready.edited !== undefined && ready.edited !== ready.glavnoe) fetch('/api/voice-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'copy', postId: ready.postId, generated: ready.glavnoe, copied: t }) }).catch(() => {})
    deystvie(ready.postId, 'copy')
    if (!ready.vzyat) patchPost(ready.postId, { vzyat: true })
  }
  // «Уже в блоге? Отметь»: published_at, сервер сам пишет material_take how=published (роут published)
  const otmetit = async () => {
    if (!ready || ready.otmetka === 'busy' || ready.otmetka === 'done') return
    const id = ready.postId
    patchPost(id, { otmetka: 'busy' })
    try {
      const r = await fetch('/api/generate-post/published', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: id }) })
      patchPost(id, { otmetka: r.ok ? 'done' : 'fail' })
    } catch { patchPost(id, { otmetka: 'fail' }) }
  }
  // «Следующая тема»: на ввод с пустой мыслью, тему подберет сервер по кругу
  const sleduyushchaya = () => {
    track('make_next_topic')
    setMysl(''); setTopic(null); setComposeError(null)
    setVarianty([]); setIdx(0); setView('compose')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }
  const pisatFormat = (kod: string) => { if (lastReady && !noMaterials) napisat({ kod, fromPostId: (ready || lastReady).postId }) }
  // В4: на пробном перед первой тратой на другой формат спрашиваем один раз за сессию
  const drugoyFormat = (kod: string) => {
    if (!lastReady || noMaterials) return
    let ok = false
    try { ok = sessionStorage.getItem(TRIAL_OK) === '1' } catch { ok = true }
    if (materials?.kind === 'trial' && !ok) { setTrialAsk(kod); return }
    pisatFormat(kod)
  }
  const trialYes = () => {
    const kod = trialAsk
    setTrialAsk(null)
    try { sessionStorage.setItem(TRIAL_OK, '1') } catch {}
    track('trial_spend_confirm', { answer: 'yes' })
    if (kod) pisatFormat(kod)
  }
  const trialNo = () => { setTrialAsk(null); track('trial_spend_confirm', { answer: 'no' }) }
  const zanovo = () => { if (ready && !noMaterials) napisat({ kod: ready.kod, fromPostId: ready.postId, zanovo: true }) }
  const novayaMysl = () => { if (!busy) { setView('compose'); setVarianty([]); setIdx(0) } }

  const spend = materials ? spendLine(materials, 1, until) : ''
  const nuzhnyFakty = FORMATY.find(f => f.kod === formatKod)?.trebuet === 'fakty' && !mysl.trim()
  const stick = !typing && !noMaterials

  // ---------- ввод ----------
  if (view === 'compose') {
    return (
      <div className={`${PAD} xl:max-w-[752px]`}>
        <div className={`min-w-0 ${stick ? 'max-lg:pb-[120px]' : ''}`}>
          {/* застряла или вернулась после паузы: помощь с конкретным шагом (26.11); при конце текстов там своя карточка */}
          {/* только когда сводка пришла и тексты есть: иначе показ тратился бы на того, у кого сейчас появится EndCard */}
          {meLoaded && materials && !noMaterials && (
            <HelpCard skip={() => !!mysl.trim() || document.activeElement === area.current} onClose={() => titleRef.current?.focus()} />
          )}
          <h1 ref={titleRef} tabIndex={-1} className="outline-none text-[26px] leading-8 lg:text-[32px] lg:leading-10 font-semibold tracking-[-0.3px] text-brand-text">О чем сегодня?</h1>
          <Squiggle variant={0} width="150px" />

          <div className={`mt-4 lg:mt-5 rounded-[20px] bg-brand-card ${SHADOW} ring-brand-accent/40 focus-within:ring-2 transition`}>
            <label htmlFor="zh13-mysl" className="block px-4 lg:px-5 pt-3.5 lg:pt-4 text-[14px] font-semibold text-brand-text">Своя мысль</label>
            <textarea id="zh13-mysl" ref={area} value={mysl} onChange={e => setMysl(e.target.value)} readOnly={transcribing} rows={3}
              placeholder={transcribing ? 'Расшифровка...' : 'Что хочется сказать? Можно пару слов или голосом'}
              className={`block w-full resize-none bg-transparent px-4 lg:px-5 pt-1.5 text-[16px] lg:text-[17px] leading-[26px] text-brand-text placeholder:text-[#A39A8C] focus:outline-none ${transcribing ? 'animate-pulse' : ''}`} />
            <div className="h-[68px] flex items-center gap-2 pl-4 lg:pl-5 pr-3">
              <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-brand-muted" aria-live="polite">
                {transcribing ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Расшифровка...</span>
                  : mysl.trim() ? 'Текст будет из этой мысли, смысл не поменяется' : topic ? `Если пусто, напишу на тему «${topic}»` : temaKruga ? `Если пусто, напишу на тему «${temaKruga}»` : 'Если пусто, напишу на тему из того, с чем ты работаешь'}
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

          {composeError && !(composeError.limit && noMaterials) && (
            <div role="status" className="mt-4 rounded-2xl bg-brand-card border border-brand-border p-4 text-[15px] text-brand-text">
              <p>{composeError.text}</p>
              {composeError.limit && <Link href={TARIFF_HREF} className={`mt-3 ${BTN_S}`}>{END.button}</Link>}
            </div>
          )}

          {/* Б2: текстов нет, вместо серой кнопки карточка с путем к тарифу */}
          {noMaterials && materials ? (
            <div className="mt-4 lg:mt-6"><EndCard materials={materials} planCode={planCode} paymentsOn={paymentsOn} /></div>
          ) : (
            <div className={`${stick ? 'max-lg:fixed max-lg:inset-x-0 max-lg:z-30 max-lg:bottom-[calc(56px+env(safe-area-inset-bottom))] max-lg:px-4 max-lg:pt-3 max-lg:pb-2 max-lg:bg-brand-bg max-lg:border-t max-lg:border-brand-border' : 'max-lg:mt-4'} lg:mt-6 lg:flex lg:items-center lg:gap-4`}>
              {nuzhnyFakty && <p className="mb-2 text-[14px] text-brand-text">{FAKTY}</p>}
              <button type="button" onClick={() => napisat({ kod: formatKod, first: true })} disabled={transcribing || nuzhnyFakty}
                className={`w-full lg:w-auto ${BTN_P} lg:px-7`}>
                Написать · 1 текст
              </button>
              <p className="max-lg:mt-1.5 empty:hidden max-lg:text-center text-[14px] leading-5 text-brand-muted" aria-live="polite">{spend}</p>
            </div>
          )}
        </div>

        <BottomSheet open={formatOpen} onClose={() => setFormatOpen(false)} title="Какой формат?">
          <div className="pt-1 pb-2">
            <FormatRow imya={AUTO.imya} sub={AUTO.korotko} on={formatKod === null} onClick={() => { setFormatKod(null); setFormatOpen(false) }} />
            {FORMATY.filter(f => f.kod === 'mysl').map(f => (
              <FormatRow key={f.kod} imya={imyaNaEkrane(f.kod)} sub={korotkoNaEkrane(f.kod)} on={formatKod === f.kod} onClick={() => { setFormatKod(f.kod); setFormatOpen(false) }} />
            ))}
            {GRUPPY.map(g => (
              <div key={g.vid} className="mt-3">
                <p className="px-1 py-1.5 text-[13px] font-semibold text-brand-muted">{g.imya}</p>
                {FORMATY.filter(f => f.vid === g.vid && f.kod !== 'mysl').map(f => (
                  <FormatRow key={f.kod} imya={imyaNaEkrane(f.kod)} sub={sub(f)} on={formatKod === f.kod} onClick={() => { setFormatKod(f.kod); setFormatOpen(false) }} />
                ))}
              </div>
            ))}
          </div>
        </BottomSheet>
        <VoiceSheet open={voiceOpen} rec={rec} onClose={() => setVoiceOpen(false)} onWriteText={() => { setVoiceOpen(false); setTimeout(() => area.current?.focus(), 50) }} prompt="Говори, как в камеру. Паузы не страшны." />
      </div>
    )
  }

  // ---------- результат и ожидание ----------
  const n = varianty.length
  const pokazany = new Set([ready?.kod, ...(ready?.podoydet || []).map(p => p.kod)])
  const vse = FORMATY.filter(f => !pokazany.has(f.kod) && (f.trebuet !== 'fakty' || !!ready?.mysl))
  const podzagolovok = mysl.trim() || topic || ''
  const karusel = ready?.vid === 'carousel' && !!ready.text
  const tekst = ready ? ready.edited ?? ready.glavnoe : ''
  const setTekst = (t: string) => setVarianty(prev => prev.map((v, i) => (i === idx && v.status === 'ready' ? { ...v, edited: t } : v)))
  const gotovo = () => { if (!ready) return; setEditing(false); if (ready.edited !== undefined && ready.edited !== ready.glavnoe) deystvie(ready.postId, 'edit') }

  return (
    <div className={`${PAD} max-lg:pt-0`}>
      {/* одна строка: на телефоне знак и «Новая мысль» вместо шапки кабинета (В2); на компьютере знак в меню слева */}
      <div className={`h-14 lg:h-11 flex items-center gap-2 max-lg:-mx-4 max-lg:px-4 max-lg:mb-2 ${bare ? 'max-lg:sticky max-lg:top-0 max-lg:z-30 max-lg:bg-brand-bg/95 max-lg:backdrop-blur max-lg:box-content max-lg:pt-[env(safe-area-inset-top)]' : ''} xl:max-w-[1064px]`}>
        {bare && <Image src="/brand/psycont-icon.svg" alt="" width={32} height={32} className="lg:hidden w-8 h-8 shrink-0" />}
        <button type="button" onClick={novayaMysl} disabled={busy}
          className="h-11 pl-1 pr-2 lg:-ml-2 inline-flex items-center gap-0.5 text-[15px] font-medium text-brand-text cursor-pointer shrink-0 rounded-xl hover:bg-brand-soft-2 disabled:opacity-40">
          <ChevronLeft className="w-5 h-5" />Новая мысль
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
              {slow ? 'Пишется дольше обычного. Текст не потеряется, он появится здесь или в «Моих текстах»' : 'Обычно 20-60 секунд. Можно закрыть вкладку, текст сохранится в «Моих текстах»'}
            </p>
            {idx > 0 && <button type="button" onClick={() => setIdx(idx - 1)} className={`mt-4 -ml-2 ${BTN_T}`}><ChevronLeft className="w-4 h-4" />Прошлый вариант на месте</button>}
          </div>
        </div>
      )}

      {cur?.status === 'failed' && (
        <div className={`xl:max-w-[704px] rounded-[20px] bg-brand-card ${SHADOW} p-5`}>
          {cur.limit && materials && noMaterials ? (
            <EndCard materials={materials} planCode={planCode} paymentsOn={paymentsOn} compact />
          ) : (
            <>
              <p className="text-[15px] text-brand-text">{cur.error}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {cur.limit ? <Link href={TARIFF_HREF} className={BTN_P}>{END.button}</Link>
                  : <button type="button" disabled={busy} onClick={() => { const k = cur.kod, z = cur.zanovo, from = cur.fromPostId || lastReady?.postId; setVarianty(prev => prev.filter((_, i) => i !== idx)); setIdx(Math.max(0, idx - 1)); if (from) napisat({ kod: k, fromPostId: from, zanovo: z }) }} className={BTN_P}>Попробовать еще раз</button>}
              </div>
            </>
          )}
          {idx > 0 && <button type="button" onClick={() => setIdx(idx - 1)} className={`mt-2 ${BTN_S}`}>К прошлому варианту</button>}
        </div>
      )}

      {ready && (
        <div className="xl:flex xl:items-start xl:gap-10 max-lg:pb-[calc(84px+env(safe-area-inset-bottom))]">
          {/* колонка текста гибкая (до 704): на 1280 «Как снять» 320 рядом без прокрутки вбок (В14) */}
          <div className="min-w-0 xl:flex-1 xl:max-w-[704px]">
            <p className="text-[13px] leading-5 text-brand-muted truncate">{rubrika(ready)}</p>
            <h1 className="mt-0.5 text-[24px] leading-8 lg:text-[28px] lg:leading-9 font-semibold tracking-[-0.2px] text-brand-text break-words">{zagolovok(ready)}</h1>

            {/* карусель: слайды в предложенном стиле на первом экране, главная «Сохранить слайды» (В18) */}
            {karusel && (
              <div className="mt-4">
                <CarouselDesigner key={ready.postId} postId={ready.postId} text={ready.edited ?? ready.text!} mobileBar="bare" autoStyle
                  onTextChange={t => setVarianty(prev => prev.map((v, i) => (i === idx && v.status === 'ready' ? { ...v, text: t } : v)))}
                  onExported={() => { if (!ready.vzyat) patchPost(ready.postId, { vzyat: true }) }}
                  moreItems={[
                    { label: 'Скопировать текст', onClick: copyText },
                    { label: 'Сделать заново · 1 текст', onClick: zanovo, disabled: busy || noMaterials },
                    ...(n > 1 ? [{ label: 'Прошлые варианты', onClick: () => setSpisokOpen(true) }] : []),
                  ]} />
              </div>
            )}

            <div className="xl:hidden"><KakSnyat v={ready} open={kakOpen} onToggle={() => setKakOpen(o => !o)} /></div>

            {/* компьютер: действия над текстом, чтобы «Скопировать» не уезжала под длинный текст */}
            {!editing && !karusel && (
              <div className="hidden lg:flex mt-4 flex-wrap items-center gap-2.5">
                <button type="button" onClick={copyText} className={`${BTN_P} min-w-[220px]`}><Copy className="w-5 h-5" />{copied ? 'Скопировано' : 'Скопировать текст'}</button>
                <button type="button" onClick={zanovo} disabled={busy || noMaterials} className={BTN_S}>Сделать заново · 1 текст</button>
              </div>
            )}

            <div className={`mt-4 rounded-[20px] bg-brand-card ${SHADOW} p-5 lg:px-8 lg:py-7 min-w-0`}>
              {karusel && <p className="mb-3 text-[15px] font-semibold text-brand-text">Текст карусели</p>}
              {editing ? (
                <>
                  <label htmlFor="zh13-pravka" className="sr-only">Текст</label>
                  <textarea id="zh13-pravka" value={tekst} autoFocus onChange={e => setTekst(e.target.value)}
                    rows={Math.min(24, Math.max(8, tekst.split('\n').length + 2))}
                    className="block w-full max-h-[50dvh] overflow-y-auto px-3 py-2.5 rounded-xl border border-brand-border bg-white text-brand-text text-[16px] leading-relaxed focus:outline-none focus:border-brand-accent resize-none" />
                  {/* липкая панель: над клавиатурой и у нижнего края, пока поле длинное */}
                  <div ref={doneBar} className="sticky bottom-0 -mx-5 lg:-mx-8 px-5 lg:px-8 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] bg-brand-card rounded-b-[20px] flex items-center gap-2">
                    <button type="button" onClick={gotovo} className={`${BTN_P} max-lg:flex-1`}>Готово</button>
                  </div>
                </>
              ) : (
                <>
                  <Svernutyi key={`${idx}:${tekst.length}`} open={polnost} onOpen={() => setPolnost(true)}><Glavnoe text={tekst} /></Svernutyi>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => { setPolnost(true); setEditing(true) }} className={BTN_S}><PenLine className="w-[18px] h-[18px]" />Править текст</button>
                  </div>
                </>
              )}
            </div>

            {ready.podpis && (
              <div className="mt-3">
                <CaptionBlock caption={ready.podpis} format={ready.vid} postId={ready.postId} onCopy={() => deystvie(ready.postId, 'copy_podpis')} />
              </div>
            )}

            {/* В3: после копирования отметка «в блоге» (North Star) и следующий шаг */}
            {ready.vzyat && (
              <div className="mt-3 rounded-2xl border border-brand-border bg-brand-card px-4 py-3" role="status">
                {ready.otmetka === 'done' ? (
                  <p className="min-h-12 flex items-center gap-2 text-[15px] font-semibold text-brand-text"><Check className="w-5 h-5 text-brand-accent" />Отмечено</p>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 text-[15px] text-brand-text">{ready.otmetka === 'fail' ? 'Не получилось отметить. Нажми еще раз' : 'Уже в блоге? Отметь'}</p>
                    <button type="button" onClick={otmetit} disabled={ready.otmetka === 'busy'} className={`shrink-0 ${BTN_S}`}>
                      {ready.otmetka === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Отметить
                    </button>
                  </div>
                )}
                <button type="button" onClick={sleduyushchaya} className={`mt-1 -ml-2 ${BTN_T}`}>Следующая тема<ArrowRight className="w-4 h-4" /></button>
              </div>
            )}

            {/* главный показатель продукта: звучит ли как человек (26.11, на старом экране это было в FormatPane); ниже отметки «в блоге» (North Star) */}
            {ready.postId && <PohozheNaTebya key={ready.postId} postId={ready.postId} />}

            {/* Эта же мысль в другом формате */}
            <section className={`mt-4 rounded-[20px] bg-brand-card ${SHADOW} p-4 lg:p-5 scroll-mt-16`} aria-labelledby="zh13-eshe-h" id="zh13-eshe">
              <h2 id="zh13-eshe-h" className="text-[17px] font-semibold text-brand-text">Эта же мысль в другом формате</h2>
              {noMaterials && materials ? (
                <div className="mt-2"><EndCard materials={materials} planCode={planCode} paymentsOn={paymentsOn} compact /></div>
              ) : (
                <>
                  <p className="mt-0.5 text-[13px] text-brand-muted">Каждый формат это 1 текст{materials ? ` · осталось ${materials.remaining}` : ''}</p>
                  <div className="mt-2 divide-y divide-brand-border">
                    {ready.podoydet.map(p => (
                      <button key={p.kod} type="button" onClick={() => drugoyFormat(p.kod)} disabled={busy}
                        className="w-full min-h-16 py-2.5 flex items-center gap-3 text-left cursor-pointer disabled:opacity-40 group">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[16px] font-semibold text-brand-text">{imyaNaEkrane(p.kod)}</span>
                          <span className="block mt-0.5 text-[14px] leading-5 text-brand-text-secondary break-words">{sZaglavnoy(p.pochemu)}</span>
                        </span>
                        <ArrowRight className="w-5 h-5 text-brand-muted group-hover:text-brand-accent shrink-0" />
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setVseOpen(o => !o)} aria-expanded={vseOpen} className={`mt-1 -ml-2 ${BTN_T}`}>
                    Все форматы<ChevronDown className={`w-4 h-4 transition-transform ${vseOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {vseOpen && (
                    <div className="mt-1">
                      {vse.filter(f => f.kod === 'mysl').map(f => <FormatRow key={f.kod} imya={imyaNaEkrane(f.kod)} sub={sub(f)} disabled={busy} onClick={() => drugoyFormat(f.kod)} />)}
                      {GRUPPY.map(g => {
                        const xs = vse.filter(f => f.vid === g.vid && f.kod !== 'mysl')
                        if (!xs.length) return null
                        return (
                          <div key={g.vid} className="mt-2">
                            <p className="px-1 py-1.5 text-[13px] font-semibold text-brand-muted">{g.imya}</p>
                            {xs.map(f => <FormatRow key={f.kod} imya={imyaNaEkrane(f.kod)} sub={sub(f)} disabled={busy} onClick={() => drugoyFormat(f.kod)} />)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          {/* с 1280 справа «Как снять», раскрыт всегда; 320 px, текст рядом сжимается (В14) */}
          {ready.vid === 'reels' && (
            <aside className="hidden xl:block w-[320px] shrink-0 sticky top-6 mt-[120px]">
              <KakSnyat v={ready} open onToggle={() => {}} aside />
            </aside>
          )}

          {/* телефон: липкая панель у нижнего края (нижнего меню на этом экране нет); у карусели своя панель слайдов */}
          {!typing && !editing && !karusel && (
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-brand-card border-t border-brand-border px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-2">
                <button type="button" onClick={copyText} className={`flex-1 min-w-0 ${BTN_P}`}><Copy className="w-5 h-5 shrink-0" />{copied ? 'Скопировано' : 'Скопировать текст'}</button>
                <button type="button" onClick={() => setMoreOpen(true)} aria-label="Еще" className="w-12 h-12 shrink-0 rounded-xl border border-brand-border bg-brand-card flex items-center justify-center cursor-pointer"><MoreHorizontal className="w-5 h-5" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Еще">
        <div className="pt-1">
          <button type="button" onClick={() => { setMoreOpen(false); zanovo() }} disabled={busy || noMaterials} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-40">Сделать заново · 1 текст</button>
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
                <span className="block text-[15px] font-semibold text-brand-text truncate">{v.status === 'ready' ? imyaNaEkrane(v.kod) : imyaFormata(v.kod)}</span>
                <span className="block text-[13px] text-brand-muted truncate">{v.status === 'ready' ? (v.edited ?? v.glavnoe).split('\n')[0] : v.status === 'pending' ? 'Пишется' : 'Не дописался'}</span>
              </span>
              {i === idx && <Check className="w-4 h-4 text-brand-accent shrink-0" />}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* В4: на пробном один раз за сессию перед тратой на другой формат */}
      <BottomSheet open={!!trialAsk} onClose={trialNo} title={TRIAL_SPEND.title}>
        <div className="pt-1 pb-2">
          {materials && <p className="text-[15px] leading-[22px] text-brand-text-secondary">{TRIAL_SPEND.line(materials.remaining - 1)}</p>}
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={trialYes} className={`w-full ${BTN_P}`}>{TRIAL_SPEND.yes}</button>
            <button type="button" onClick={trialNo} className={`w-full ${BTN_S}`}>{TRIAL_SPEND.no}</button>
          </div>
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
