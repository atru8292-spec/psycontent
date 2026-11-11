'use client'

// «Сделать» под флагом нового мозга, ввод мысли (задача sdelat-i-brend, раздел 3; спецификация designer-psycont).
// Пустое поле: заголовок, поле с микрофоном и скрепкой, «Продолжить черновик», карточки «Не знаю, о чем писать»
// и «Видела классный пост?». В поле есть текст: карточки прячутся, появляются форматы, цель и кнопка.
// Режим «так же»: в поле ссылка на чужой пост или выбраны скрины (раздел 5).

import { useFeatureOpen, useTrackOnce } from '@/lib/analytics/hooks'
import { track } from '@/lib/track'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Paperclip, Plus, Check, ChevronDown, ChevronRight, FileText, Link2, Image as ImageIcon, X, Loader2 } from 'lucide-react'
import { useVoiceRecorder } from '@/lib/use-voice-recorder'
import VoiceSheet, { VOICE_MAX, VOICE_NEAR } from './VoiceSheet'
import BottomSheet from './BottomSheet'
import VoiceTextarea from '@/components/VoiceTextarea'
import { VID_TEXT } from './vid-hints'
import { KARTY, AUTO_TEXT, KNOPKI } from './vid-cards'
import VidKartinka, { useVidKartinki } from './VidKartinka'
import { GRUPPY, gruppaOf, tipOf } from '@/lib/generation/zh6/gruppy'
import { MAKE_FORMATS, DEFAULT_FORMATS, GOAL_OPTIONS, makeButtonText, type MakeFormat, type MakeGoal } from './formats'

export const DRAFT_KEY = 'psycont_make_draft'
const FORMATS_KEY = 'psycont_make_formats'
// «так же» включают только ссылки на Telegram и Instagram; другая ссылка в поле это просто мысль
const URL_RE = /^\s*(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|instagram\.com|instagr\.am)\/\S+\s*$/i

export type SozheSource = { kind: 'link'; url: string } | { kind: 'screens'; files: File[] } | { kind: 'text'; text: string; label: string }
// mode и voice только для замеров (make_start): тема взята готовой или своя мысль, надиктована ли
export type ComposerSubmit = { text: string; formats: MakeFormat[]; goal: MakeGoal; sozhe?: SozheSource; about?: string; mode?: 'thought' | 'topic'; voice?: boolean; zh6?: Zh6Choice }

// Формат каталога zh6 (GET /api/generate-post/formaty). Пустой список: zh6 выключен, выбора формата нет совсем
export type Zh6Format = { code: string; name: string; tip: 'reels' | 'post' | 'carousel'; scene?: boolean; short?: boolean; bezGolosa?: boolean }
// Что уходит в тело /api/generate-post/group как zh6: вид каталога у каждого формата набора (vidy) и задача из плана
// для формата дня (forFormat). Формата нет в vidy: генератор подберет вид сам.
export type Zh6Choice = { vidy?: Partial<Record<MakeFormat, string>>; grupy?: Partial<Record<MakeFormat, string>>; forFormat?: MakeFormat; rol?: string; reakciya?: string }
// Формат и задача дня из плана тем (?fkod=&rol=&reakciya=), уходят один раз с темой этого дня
export type PlanPick = { formatKod?: string; forFormat?: MakeFormat; rol?: string; reakciya?: string; situaciya?: string }

// чипы, у которых есть выбор вида: тип формата каталога для каждого
const PICK_TIP: Partial<Record<MakeFormat, Zh6Format['tip']>> = { reels: 'reels', carousel: 'carousel', post: 'post' }
const PICK_TITLE: Partial<Record<MakeFormat, string>> = { reels: 'Какой рилс?', carousel: 'Какая карусель?', post: 'Какой пост?' }

// список форматов один на загрузку страницы: Composer пересоздается при «Назад», запрос не повторяем
let formatyCache: Promise<Zh6Format[]> | null = null
function loadFormaty(): Promise<Zh6Format[]> {
  if (!formatyCache) {
    formatyCache = fetch('/api/generate-post/formaty')
      .then(r => (r.ok ? r.json() : null))
      .then(d => (Array.isArray(d?.formaty) ? d.formaty.filter((f: any) => f && typeof f.code === 'string' && typeof f.name === 'string') : []))
      .catch(() => { formatyCache = null; return [] })
  }
  return formatyCache!
}

const readLS = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const writeLS = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch {} }

export default function Composer({ firstTime, topics, busy, onSubmit, initialText, initialFormats, askSampleText, onSampleCleared, plan }: {
  firstTime: boolean
  topics: string[]
  busy: boolean
  onSubmit: (s: ComposerSubmit) => void
  initialText?: string
  initialFormats?: MakeFormat[] // формат из плана (?format=) выбран заранее
  askSampleText?: boolean       // ссылка не открылась (закрытый канал, ошибка): просим вставить текст поста
  onSampleCleared?: () => void  // ссылку убрали или поменяли: просьба вставить текст больше не нужна
  plan?: PlanPick | null        // формат и задача дня из плана, пока не ушли в первый запуск
}) {
  const router = useRouter()
  const [text, setText] = useState(initialText || '')
  // черновик пишем, только когда человек сам печатал: тема из адреса не должна затирать ее черновик
  const typed = useRef(false)
  const [about, setAbout] = useState('')
  const [screens, setScreens] = useState<File[]>([])
  // текст чужого поста или расшифровка рилса, когда ссылка не открывается
  const [sampleText, setSampleText] = useState('')
  const [videoState, setVideoState] = useState<'idle' | 'busy' | 'error'>('idle')
  const videoInput = useRef<HTMLInputElement>(null)
  const [formats, setFormats] = useState<MakeFormat[]>(DEFAULT_FORMATS)
  const [goal, setGoal] = useState<MakeGoal>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [topicIdx, setTopicIdx] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // вид каталога zh6 у каждого отмеченного формата свой. В vidy только то, что она выбрала сама (null: «подберу сама»);
  // формата нет в vidy: стоит вид из плана (для формата дня) или «подберу сама». Сняла отметку: выбор забываем.
  const [formaty, setFormaty] = useState<Zh6Format[]>([])
  const [vidy, setVidy] = useState<Partial<Record<MakeFormat, string | null>>>({})
  const [planKodOff, setPlanKodOff] = useState(false)
  const [pickFor, setPickFor] = useState<MakeFormat | null>(null)
  // в листе раскрыто «Как снять» или «Выбрать точнее» у одной карточки (id карточки)
  const [kakOpen, setKakOpen] = useState<string | null>(null)
  const [tochOpen, setTochOpen] = useState<string | null>(null)
  const kartinki = useVidKartinki()
  // при открытии листа выбранный вид прокручиваем в середину: он может стоять ниже первого экрана
  const sheetList = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pickFor) return
    const t = setTimeout(() => sheetList.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'center' }), 250)
    return () => clearTimeout(t)
  }, [pickFor])
  useEffect(() => { let on = true; loadFormaty().then(f => { if (on) setFormaty(f) }); return () => { on = false } }, [])

  // прошлый набор форматов и незаконченный черновик
  useEffect(() => {
    try {
      const f = JSON.parse(readLS(FORMATS_KEY) || 'null')
      if (initialFormats?.length) setFormats(initialFormats)
      else if (Array.isArray(f) && f.length) setFormats(f.filter((x: string) => MAKE_FORMATS.some(m => m.id === x)))
    } catch {}
    const d = readLS(DRAFT_KEY)
    // черновик помним и при теме из адреса: тема в поле, а «Продолжить черновик» появится, если поле очистить
    if (d && d.trim() && d.trim() !== (initialText || '').trim()) setDraft(d)
  }, [initialText, initialFormats])
  useEffect(() => { if (initialText) setText(initialText) }, [initialText])

  // черновик пишется сам, пока человек печатает
  useEffect(() => {
    const t = setTimeout(() => { if (typed.current && text.trim().length >= 3 && !URL_RE.test(text)) writeLS(DRAFT_KEY, text) }, 600)
    return () => clearTimeout(t)
  }, [text])

  // поле растет от 3 до 6 строк, дальше прокрутка внутри
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 144)}px`
  }, [text])

  const usedVoice = useRef(false)
  const appendVoice = useCallback((t: string) => { typed.current = true; usedVoice.current = true; setText(prev => (prev.trim() ? `${prev.trim()} ${t}` : t)) }, [])
  const rec = useVoiceRecorder(appendVoice, { maxSeconds: VOICE_MAX, nearSeconds: VOICE_NEAR })
  const transcribing = rec.state === 'transcribing'
  const transcribeFailed = rec.state === 'error' && rec.errorKind === 'network'

  const link = URL_RE.test(text) ? text.trim() : null
  // Instagram по ссылке текст не отдает: просим скрины, подпись или расшифровку рилса (своим Whisper, бесплатно)
  const igLink = !!link && /instagram\.com|instagr\.am/i.test(link)
  const igReel = igLink && /\/(reel|reels)\//i.test(link!)
  const needText = !!link && (igLink || !!askSampleText)
  // новая ссылка: старую просьбу вставить текст снимаем
  const lastLink = useRef(link)
  useEffect(() => {
    if (lastLink.current !== link) { lastLink.current = link; if (askSampleText) onSampleCleared?.() }
  }, [link, askSampleText, onSampleCleared])
  const sozhe: SozheSource | undefined = screens.length ? { kind: 'screens', files: screens }
    : link && needText ? (sampleText.trim().length >= 40 ? { kind: 'text', text: sampleText.trim(), label: link } : undefined)
    : link ? { kind: 'link', url: link } : undefined
  const hasText = !!text.trim() || !!sozhe || screens.length > 0
  useFeatureOpen('sozhe', !!link || screens.length > 0)
  const topic = topics.length ? topics[topicIdx % topics.length] : null

  const toggleFormat = (f: MakeFormat) => {
    if (formats.includes(f)) {
      // сняла отметку: вид этого формата забываем, при новой отметке снова «подберу сама» (и вид из плана тоже не вернется)
      setVidy(prev => { const n = { ...prev }; delete n[f]; return n })
      if (plan?.forFormat === f) setPlanKodOff(true)
    }
    setFormats(prev => prev.includes(f) ? prev.filter(x => x !== f) : MAKE_FORMATS.map(m => m.id).filter(id => id === f || prev.includes(id)))
  }

  const pasteLink = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim()
      // не ссылка в поле не идет: чужой пост, вставленный текстом, ушел бы в генерацию как своя мысль
      if (t && URL_RE.test(t)) { setText(t); setHint(null); return }
      if (t) { setHint('В буфере не ссылка. Скопируй ссылку на пост или загрузи скрин'); return }
    } catch {}
    setHint('Телефон не дал прочитать скопированное. Вставь ссылку сама: долгое нажатие на поле и «Вставить»')
    area.current?.focus()
  }
  const pickScreens = (list: FileList | null) => {
    const files = Array.from(list || []).filter(f => f.type.startsWith('image/')).slice(0, 10)
    if (files.length) setScreens(files)
  }
  const clearSozhe = () => { setScreens([]); if (link) setText(''); setAbout(''); setSampleText(''); onSampleCleared?.() }
  // видео рилса: расшифровка тем же своим Whisper, что голос (ничего не считаем); видео не храним
  const transcribeVideo = async (file: File | undefined) => {
    if (!file) return
    setVideoState('busy')
    try {
      const fd = new FormData()
      fd.append('file', file, file.name || 'reel.mp4')
      fd.append('purpose', 'sample') // чужой ролик: сервер не пишет его в память голоса
      const res = await fetch('/api/voice-transcribe', { method: 'POST', body: fd })
      const d = await res.json().catch(() => null)
      const t = typeof d?.text === 'string' ? d.text.trim() : ''
      if (!res.ok || !t) throw new Error()
      setSampleText(t); setVideoState('idle')
    } catch { setVideoState('error') }
  }

  // формат и задача из плана действуют, пока в поле тема этого дня
  const planOn = !!plan && !!text.trim() && text.trim() === (initialText || '').trim()
  const tipFormats = (f: MakeFormat) => (PICK_TIP[f] ? formaty.filter(x => x.tip === PICK_TIP[f]) : [])
  // вид формата сейчас: свой выбор, иначе вид из плана для формата дня, иначе «подберу сама». Код без имени в каталоге
  // (не подходит голосу или «Пока без видео») не показываем и не шлем: генератор подберет сам
  // В vidy либо код вида, либо 'g:<карточка>' (карточка без подвида: генератор выберет вид внутри нее)
  const vidOf = (f: MakeFormat): { code: string | null; karta: string | null; name?: string; fromPlan: boolean } => {
    const own = f in vidy
    const val = own ? vidy[f] ?? null : planOn && !planKodOff && plan?.forFormat === f && plan.formatKod ? plan.formatKod : null
    const tip = tipOf(f)
    if (val && val.startsWith('g:') && tip) {
      const id = val.slice(2)
      return KARTY[tip][id] ? { code: null, karta: id, name: KARTY[tip][id].title, fromPlan: false } : { code: null, karta: null, fromPlan: false }
    }
    const fmt = val ? tipFormats(f).find(x => x.code === val) : undefined
    if (!fmt || !tip) return { code: null, karta: null, fromPlan: false }
    const g = gruppaOf(fmt.code)?.g.id || null
    const sub = g ? KARTY[tip][g]?.sub?.[fmt.code]?.[0] : undefined
    return { code: fmt.code, karta: g, name: sub || (g ? KARTY[tip][g]?.title : undefined) || fmt.name, fromPlan: !own }
  }
  const pickable = (f: MakeFormat) => formats.includes(f) && !sozhe && !link && tipFormats(f).length > 0
  // выбран подвид: сразу раскрываем «Выбрать точнее» у его карточки, чтобы выбор был виден
  const openPick = (f: MakeFormat) => { const v = vidOf(f); setPickFor(f); setKakOpen(null); setTochOpen(v.code && v.karta ? v.karta : null); track('feature_open', { feature: 'format_pick' }) }
  const choosePick = (f: MakeFormat, code: string | null) => {
    setVidy(prev => ({ ...prev, [f]: code }))
    setPickFor(null)
  }

  const submit = () => {
    if (busy || !hasText || !formats.length || transcribing || (link && needText && !sozhe)) return
    writeLS(FORMATS_KEY, JSON.stringify(formats))
    // черновик стирает MakeFlow после первого готового формата: при ошибке мысль должна остаться
    setDraft(null)
    // тема: поле ровно как готовая тема (из адреса, карточки «Беру» или плана), иначе своя мысль
    const t = text.trim()
    const isTopic = !!t && (t === (initialText || '').trim() || topics.includes(t))
    // вид у каждого отмеченного формата отдельно; задача и реакция из плана только формату дня
    const out: Partial<Record<MakeFormat, string>> = {}
    const gr: Partial<Record<MakeFormat, string>> = {}
    for (const f of formats) {
      if (!pickable(f)) continue
      const v = vidOf(f)
      if (v.code) out[f] = v.code
      else if (v.karta) gr[f] = v.karta
    }
    const hasVidy = Object.keys(out).length > 0 || Object.keys(gr).length > 0
    const planTask = planOn && !!(plan?.rol || plan?.reakciya)
    const zh6: Zh6Choice | undefined = hasVidy || planTask
      ? {
          ...(Object.keys(out).length ? { vidy: out } : {}),
          ...(Object.keys(gr).length ? { grupy: gr } : {}),
          ...(planOn && plan?.forFormat ? { forFormat: plan.forFormat } : {}),
          ...(planOn && plan?.rol ? { rol: plan.rol } : {}),
          ...(planOn && plan?.reakciya ? { reakciya: plan.reakciya } : {}),
        }
      : undefined
    onSubmit({ text: link ? '' : t, formats, goal, sozhe, about: sozhe ? about.trim() : undefined, mode: isTopic ? 'topic' : 'thought', voice: usedVoice.current, zh6 })
  }

  const sourceLabel = screens.length
    ? `${screens.length} ${screens.length === 1 ? 'скрин' : screens.length < 5 ? 'скрина' : 'скринов'}`
    : link ? link.replace(/^https?:\/\/(www\.)?/i, '') : ''

  return (
    <div className="max-w-[560px] mx-auto px-4 pt-4 pb-8">
      <h1 className="text-[22px] leading-7 font-semibold text-brand-text">О чем сегодня?</h1>
      {firstTime && <p className="mt-1 text-[15px] leading-5 text-brand-muted">Начни с мысли. Например: «Сегодня клиентка сказала...»</p>}

      {(sozhe || link) && (
        <div className="mt-3 h-11 flex items-center gap-2 pl-3 rounded-xl bg-brand-soft text-brand-text">
          {screens.length ? <ImageIcon className="w-4 h-4 shrink-0" /> : <Link2 className="w-4 h-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-[14px] [overflow-wrap:anywhere]">По мотивам: {sourceLabel}</span>
          <button type="button" onClick={clearSozhe} aria-label="Убрать источник" className="w-11 h-11 flex items-center justify-center rounded-full text-brand-muted hover:text-brand-text cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* поле мысли */}
      <div className="mt-3 rounded-[20px] bg-brand-card border-[1.5px] border-brand-border focus-within:border-brand-accent focus-within:ring-[3px] focus-within:ring-brand-soft transition">
        <textarea
          ref={area}
          value={text}
          onChange={e => { typed.current = true; setText(e.target.value); setHint(null) }}
          readOnly={transcribing}
          rows={3}
          aria-label="Мысль"
          placeholder={transcribing ? 'Расшифровываю...' : 'Наговори или напиши мысль. Пары слов хватит.'}
          className={`block w-full resize-none bg-transparent px-4 pt-3.5 text-[16px] leading-6 text-brand-text placeholder:text-brand-muted focus:outline-none ${transcribing ? 'animate-pulse' : ''}`}
        />
        <div className="h-16 flex items-center gap-2 pl-1 pr-1.5">
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Вставить скрин" className="w-11 h-11 flex items-center justify-center rounded-full text-brand-muted hover:text-brand-text hover:bg-brand-soft cursor-pointer shrink-0">
            <Paperclip className="w-[22px] h-[22px]" />
          </button>
          <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-brand-muted">
            {transcribing ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Расшифровываю...</span> : 'Можно вставить и свой старый текст'}
          </p>
          <button type="button" onClick={() => { rec.reset(); setVoiceOpen(true) }} disabled={transcribing} aria-label="Записать голосом"
            className="w-14 h-14 rounded-full bg-brand-accent text-white flex items-center justify-center hover:bg-brand-accent-hover active:scale-95 transition cursor-pointer disabled:opacity-50 shrink-0">
            <Mic className="w-[26px] h-[26px]" />
          </button>
        </div>
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={e => { pickScreens(e.target.files); e.target.value = '' }} />

      {transcribeFailed && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[14px] text-brand-text">
          <span className="min-w-0">Не получилось расшифровать. Запись цела</span>
          <button type="button" onClick={rec.retry} className="h-11 px-4 rounded-full border border-brand-border font-semibold cursor-pointer shrink-0">Еще раз</button>
        </div>
      )}
      {hint && <p className="mt-2 text-[13px] text-brand-muted" role="status">{hint}</p>}

      {!hasText && (
        <>
          {draft && (
            <button type="button" onClick={() => { typed.current = true; setText(draft); setDraft(null) }}
              className="mt-2 w-full h-11 flex items-center gap-2 px-1 text-left text-brand-text cursor-pointer">
              <FileText className="w-[18px] h-[18px] text-brand-muted shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[15px]">Продолжить черновик: {draft}</span>
              <ChevronRight className="w-4 h-4 text-brand-muted shrink-0" />
            </button>
          )}

          {/* Не знаю, о чем писать */}
          <div className="mt-4 rounded-2xl bg-brand-card border border-brand-border p-3.5">
            <p className="text-[13px] text-brand-muted">Не знаю, о чем писать</p>
            {topic ? (
              <p className="mt-1 text-[16px] leading-[22px] text-brand-text line-clamp-2">Сегодня можно: «{topic}»</p>
            ) : (
              <p className="mt-1 text-[16px] leading-[22px] text-brand-text">Загляни в темы: там идеи под твою нишу</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              {topic && (
                <>
                  <button type="button" onClick={() => setText(topic)} className="h-11 px-5 rounded-full border-[1.5px] border-brand-accent text-brand-accent text-[15px] font-semibold hover:bg-brand-soft cursor-pointer">Беру</button>
                  {topics.length > 1 && <button type="button" onClick={() => setTopicIdx(i => i + 1)} className="h-11 px-3 text-[15px] text-brand-text cursor-pointer">Другая</button>}
                </>
              )}
              <button type="button" onClick={() => router.push('/dashboard/content-plan?tab=ideas')} className="ml-auto h-11 px-2 text-[15px] text-brand-text-secondary hover:text-brand-text cursor-pointer">Все темы →</button>
            </div>
          </div>

          {/* Видела классный пост? */}
          <div className="mt-3 rounded-2xl bg-brand-soft p-3">
            <p className="text-[16px] leading-[22px] font-semibold text-brand-text">Видела классный пост?</p>
            <p className="mt-0.5 text-[14px] leading-5 text-brand-text/80">Вставь ссылку или скрин. Сделаю по тому же принципу, но про твое и так, как говоришь ты.</p>
            <div className="mt-2.5 flex gap-2">
              <button type="button" onClick={pasteLink} className="h-11 px-4 rounded-xl bg-white border border-brand-border-soft text-[15px] text-brand-text cursor-pointer">Вставить ссылку</button>
              <button type="button" onClick={() => fileInput.current?.click()} className="h-11 px-4 rounded-xl bg-white border border-brand-border-soft text-[15px] text-brand-text cursor-pointer">Скрин</button>
            </div>
            <p className="mt-2 text-[13px] text-brand-text/70">Только публичные посты. Переписки с клиентами не загружай</p>
          </div>
        </>
      )}

      {hasText && (
        <div className="mt-4">
          {link && needText && !screens.length && (
            <div className="mb-4 space-y-2">
              <p className="text-[14px] text-brand-text">
                {igReel ? 'Загрузи видео или вставь расшифровку. Расшифровка бесплатно'
                  : igLink ? 'Инстаграм не отдает текст по ссылке. Загрузи скрины или скопируй подпись'
                  : 'Не получилось открыть пост по ссылке. Пришли скрин или вставь его текст'}
              </p>
              <textarea value={sampleText} onChange={e => setSampleText(e.target.value)} rows={4} aria-label="Текст поста"
                placeholder={igReel ? 'Расшифровка ролика' : 'Текст поста'}
                className="block w-full resize-y rounded-xl bg-brand-card border border-brand-border px-4 py-3 text-[16px] leading-6 text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent" />
              <div className="flex flex-wrap gap-2">
                {igReel && (
                  <button type="button" onClick={() => videoInput.current?.click()} disabled={videoState === 'busy'} className="h-11 px-4 rounded-xl bg-white border border-brand-border-soft text-[15px] text-brand-text cursor-pointer disabled:opacity-50 inline-flex items-center gap-2">
                    {videoState === 'busy' && <Loader2 className="w-4 h-4 animate-spin" />}{videoState === 'busy' ? 'Расшифровываю...' : 'Загрузить видео'}
                  </button>
                )}
                <button type="button" onClick={() => fileInput.current?.click()} className="h-11 px-4 rounded-xl bg-white border border-brand-border-soft text-[15px] text-brand-text cursor-pointer">Скрин</button>
              </div>
              {videoState === 'error' && <p className="text-[13px] text-brand-muted">Не получилось расшифровать видео. Вставь расшифровку сама или загрузи скрины</p>}
              <input ref={videoInput} type="file" accept="video/*" hidden onChange={e => { transcribeVideo(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          )}
          {(sozhe || link) && (
            <div className="mb-4"><VoiceTextarea value={about} onChange={setAbout} placeholder="О чем у тебя? (можно пусто, подберу сама)" minHeight={56} /></div>
          )}
          <p className="text-[13px] text-brand-muted">Что сделать из этой мысли</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MAKE_FORMATS.map(f => {
              const on = formats.includes(f.id)
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => toggleFormat(f.id)}
                  className={`h-11 px-4 inline-flex items-center gap-1.5 rounded-full text-[15px] text-brand-text transition cursor-pointer ${on ? 'font-semibold bg-brand-soft border-[1.5px] border-brand-accent' : 'border border-brand-border'}`}>
                  {on ? <Check className="w-4 h-4 text-brand-accent" /> : <Plus className="w-4 h-4 text-brand-muted" />}
                  {f.label}
                </button>
              )
            })}
          </div>
          {/* вид у каждого отмеченного формата: строка под чипами, нажала и выбрала (только при zh6, иначе каталога нет) */}
          {MAKE_FORMATS.some(f => pickable(f.id)) && (
            <div className="mt-2 space-y-1.5">
              {MAKE_FORMATS.filter(f => pickable(f.id)).map(f => {
                const v = vidOf(f.id)
                const name = v.name || ''
                return (
                  <button key={f.id} type="button" onClick={() => openPick(f.id)} aria-haspopup="dialog"
                    aria-label={`${PICK_TITLE[f.id] || f.label}: ${v.name || VID_TEXT.auto}. Выбрать`}
                    className="w-full min-h-11 px-3 py-1.5 flex items-center gap-2 rounded-xl bg-brand-card border border-brand-border text-left cursor-pointer hover:border-brand-accent">
                    {/* всегда в одну строку: каждая лишняя строка отодвигает главную кнопку, полное имя видно в листе */}
                    <span className="min-w-0 flex-1 truncate text-[15px] leading-5">
                      <span className="text-brand-muted">{f.label} · </span>
                      {name ? <span className="text-brand-text">{name}</span> : <span className="text-brand-muted">{VID_TEXT.auto}</span>}
                    </span>
                    {v.fromPlan && <span className="shrink-0 px-2 rounded-full bg-brand-soft-2 text-[12px] leading-5 text-brand-text">{VID_TEXT.plan}</span>}
                    <ChevronDown className="w-4 h-4 text-brand-muted shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
          <button type="button" onClick={() => setGoalOpen(true)} className="mt-2 h-11 inline-flex items-center gap-1 text-[15px] cursor-pointer">
            <span className="text-brand-muted">Цель:</span>
            <span className="text-brand-text">{(GOAL_OPTIONS.find(g => g.id === goal)?.label || 'Любая').toLowerCase()}</span>
            <ChevronDown className="w-4 h-4 text-brand-muted" />
          </button>
          <button type="button" onClick={submit} disabled={busy || !formats.length || transcribing || (!!link && needText && !sozhe)}
            className={`mt-4 w-full h-[52px] rounded-2xl text-[16px] font-semibold transition cursor-pointer ${formats.length ? 'bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-60' : 'bg-brand-border text-brand-muted cursor-not-allowed'}`}>
            {!formats.length ? 'Выбери хотя бы один формат' : (sozhe || link) ? 'Сделать так же' : makeButtonText(formats)}
          </button>
          <p className="mt-2 text-center text-[13px] text-brand-muted">Все сохранится само в «Моих текстах»</p>
        </div>
      )}

      <VoiceSheet open={voiceOpen} rec={rec} onClose={() => setVoiceOpen(false)} onWriteText={() => { setVoiceOpen(false); rec.reset(); setTimeout(() => area.current?.focus(), 50) }} />
      <BottomSheet open={!!pickFor} onClose={() => setPickFor(null)} title={pickFor ? PICK_TITLE[pickFor] : ''}>
        {pickFor && (
          <div role="radiogroup" aria-label="Вид" ref={sheetList} className="space-y-2.5 pb-2">
            {(() => {
              const tip = tipOf(pickFor)
              if (!tip) return null
              const cur = vidOf(pickFor)
              const avail = tipFormats(pickFor).map(x => x.code)
              const isKak = tip === 'reels'
              const choose = (val: string | null) => choosePick(pickFor, val)
              return (
                <>
                  {/* подберу под тему: первой, без шагов */}
                  <button type="button" role="radio" aria-checked={!cur.code && !cur.karta} onClick={() => choose(null)}
                    className={`w-full p-3 flex items-center gap-3 rounded-2xl border text-left cursor-pointer ${!cur.code && !cur.karta ? 'border-brand-accent bg-brand-soft/50' : 'border-brand-border bg-white'}`}>
                    <VidKartinka id={`${tip}:auto`} k={kartinki} size={48} boxClass="w-[72px] h-[72px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] leading-[22px] font-semibold text-brand-text">{AUTO_TEXT[tip].title}</span>
                      <span className="block mt-0.5 text-[14px] leading-5 text-brand-muted">{AUTO_TEXT[tip].what}</span>
                    </span>
                  </button>
                  {GRUPPY[tip].map(g => {
                    const t = KARTY[tip][g.id]
                    const kody = g.codes.filter(c => avail.includes(c))
                    if (!t || !kody.length) return null
                    const sel = cur.karta === g.id
                    const subs = kody
                    return (
                      <div key={g.id} className={`relative rounded-2xl border ${sel ? 'border-brand-accent bg-brand-soft/50' : 'border-brand-border bg-white'}`}>
                        {sel && <Check className="absolute top-3 right-3 w-5 h-5 text-brand-accent" aria-hidden="true" />}
                        <button type="button" role="radio" aria-checked={sel} onClick={() => choose(`g:${g.id}`)}
                          className="w-full p-3 pr-9 flex items-start gap-3 text-left cursor-pointer">
                          {/* картинки с Верой крупнее: 96 px на телефоне, 112 px от 640 px, иначе деталей не разобрать */}
                          <VidKartinka id={`${tip}:${g.id}`} k={kartinki} size={kartinki === 'c' ? 112 : 64} boxClass="w-24 h-24 sm:w-28 sm:h-28" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[16px] leading-[22px] font-semibold text-brand-text">{t.title}</span>
                            <span className="block mt-0.5 text-[14px] leading-5 text-brand-text-secondary">{t.what}</span>
                            {/* у Onest нет курсива: пример отделен линией слева, реплики сценки по строкам */}
                            <span className="block mt-2 pl-2 border-l-2 border-[#DCCBF2] text-[13px] leading-[18px] text-brand-text-secondary whitespace-pre-line break-words">{t.example}</span>
                          </span>
                        </button>
                        <div className="flex flex-wrap gap-x-1 px-2 pb-1 -mt-1">
                          <button type="button" aria-expanded={kakOpen === g.id} onClick={() => setKakOpen(kakOpen === g.id ? null : g.id)}
                            className={`min-h-11 px-2 inline-flex items-center gap-1 text-[14px] font-medium cursor-pointer ${kakOpen === g.id ? 'text-brand-accent' : 'text-brand-text-secondary'}`}>
                            {isKak ? KNOPKI.kakSnyat : KNOPKI.kakVylozhit}<ChevronDown className={`w-4 h-4 transition ${kakOpen === g.id ? 'rotate-180' : ''}`} />
                          </button>
                          {/* «выбрать точнее» только у выбранной карточки: иначе на экране 8-10 одинаковых ссылок */}
                          {subs.length > 1 && sel && (
                            <button type="button" aria-expanded={tochOpen === g.id} onClick={() => setTochOpen(tochOpen === g.id ? null : g.id)}
                              className="min-h-11 px-2 inline-flex items-center gap-1 text-[14px] font-medium text-brand-accent cursor-pointer">
                              {KNOPKI.tochnee}<ChevronDown className={`w-4 h-4 transition ${tochOpen === g.id ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                        {kakOpen === g.id && (
                          <div className="px-4 pb-3">
                            <ol className="list-decimal pl-5 space-y-1 text-[14px] leading-5 text-brand-text marker:text-brand-muted">
                              {t.how.steps.map((st, n) => <li key={n}>{st}</li>)}
                            </ol>
                            <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">{t.how.time} · {t.how.need}</p>
                          </div>
                        )}
                        {tochOpen === g.id && (
                          <div className="px-2 pb-2 border-t border-brand-border mt-1 pt-1" role="radiogroup" aria-label={t.title}>
                            {[{ code: `g:${g.id}`, name: KNOPKI.luboj, line: '' }, ...subs.map(c => ({ code: c, name: t.sub?.[c]?.[0] || formaty.find(x => x.code === c)?.name || c, line: t.sub?.[c]?.[1] || '' }))].map(o => {
                              const on = o.code.startsWith('g:') ? sel && !cur.code : cur.code === o.code
                              return (
                                <button key={o.code} type="button" role="radio" aria-checked={on} onClick={() => choose(o.code)}
                                  className="w-full min-h-11 py-2 px-1 flex items-start gap-3 text-left cursor-pointer">
                                  <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand-accent' : 'border-[#B9AE9C]'}`}>
                                    {on && <span className="w-2.5 h-2.5 rounded-full bg-brand-accent" />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] leading-5 text-brand-text break-words">{o.name}</span>
                                    {o.line && <span className="block mt-0.5 text-[13px] leading-[18px] text-brand-muted break-words">{o.line}</span>}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )
            })()}
          </div>
        )}
      </BottomSheet>
      <BottomSheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Цель">
        <div role="radiogroup" aria-label="Цель">
          {GOAL_OPTIONS.map(g => (
            <button key={String(g.id)} type="button" role="radio" aria-checked={goal === g.id} onClick={() => { setGoal(g.id); setGoalOpen(false) }}
              className="w-full h-[52px] flex items-center gap-3 text-left text-[16px] text-brand-text cursor-pointer">
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${goal === g.id ? 'border-brand-accent' : 'border-[#B9AE9C]'}`}>
                {goal === g.id && <span className="w-2.5 h-2.5 rounded-full bg-brand-accent" />}
              </span>
              {g.label}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
