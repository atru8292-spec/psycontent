'use client'

// «Написать» под флагом нового мозга, ввод мысли (вариант А, макеты A1, A3, A5, A9; словарь 17.11).
// Заголовок «О чем сегодня?» с волнистой линией, поле с микрофоном и «Написать по образцу», плашка «На сегодня»
// («Взять тему», «Другая тема»), чипы «Что написать», «Зачем пишешь», главная кнопка и строка остатка.
// На телефоне кнопка прилипает над нижним меню, под ней всегда строка остатка (spendLine).
// Пустое поле и тема не взята: кнопка пишет на тему дня (та, что сейчас в плашке «На сегодня»).
// Режим образца: в поле ссылка на чужой пост или выбраны скриншоты (раздел 5 задачи sdelat-i-brend).

import { useFeatureOpen } from '@/lib/analytics/hooks'
import { track } from '@/lib/track'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Paperclip, Check, ChevronDown, ChevronRight, FileText, Link2, Image as ImageIcon, X, Loader2, CalendarDays } from 'lucide-react'
import Squiggle from '@/components/Squiggle'
import { useVoiceRecorder } from '@/lib/use-voice-recorder'
import { useDashboardMe } from '@/lib/dashboard-me'
import VoiceSheet, { VOICE_MAX, VOICE_NEAR } from './VoiceSheet'
import BottomSheet from './BottomSheet'
import VoiceTextarea from '@/components/VoiceTextarea'
import { VID_TEXT } from './vid-hints'
import { KARTY, AUTO_TEXT, KNOPKI } from './vid-cards'
import VidKartinka, { useVidKartinki } from './VidKartinka'
import { GRUPPY, gruppaOf, tipOf } from '@/lib/generation/zh6/gruppy'
import { MAKE_FORMATS, DEFAULT_FORMATS, GOAL_OPTIONS, makeButtonText, formatOne, type MakeFormat, type MakeGoal } from './formats'
import { END, TARIFF_HREF, spendLine, type Materials } from '@/lib/limit-texts'
import { GENERIC_TOPIC } from '@/lib/first-topic'
import { QUIET_BTN, QUIET_BTN_SM, QUIET_BTN_SM_MUTED } from '@/lib/ui-classes'

export const DRAFT_KEY = 'psycont_make_draft'
const FORMATS_KEY = 'psycont_make_formats'
// режим образца включают только ссылки на Telegram и Instagram; другая ссылка в поле это просто мысль
const URL_RE = /^\s*(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|instagram\.com|instagr\.am)\/\S+\s*$/i

export type SozheSource = { kind: 'link'; url: string } | { kind: 'screens'; files: File[] } | { kind: 'text'; text: string; label: string }
// mode и voice только для замеров (make_start): тема взята готовой или своя мысль, надиктована ли.
// situaciya: ситуация дня из плана (подсказка под темой), уходит деталью
export type ComposerSubmit = { text: string; formats: MakeFormat[]; goal: MakeGoal; sozhe?: SozheSource; about?: string; mode?: 'thought' | 'topic'; voice?: boolean; zh6?: Zh6Choice; situaciya?: string }

// Формат каталога zh6 (GET /api/generate-post/formaty). Пустой список: zh6 выключен, выбора подачи нет совсем
export type Zh6Format = { code: string; name: string; tip: 'reels' | 'post' | 'carousel'; scene?: boolean; short?: boolean; bezGolosa?: boolean }
// Что уходит в тело /api/generate-post/group как zh6: подача каталога у каждого формата набора (vidy) и задача из плана
// для формата дня (forFormat). Формата нет в vidy: генератор подберет подачу сам.
export type Zh6Choice = { vidy?: Partial<Record<MakeFormat, string>>; grupy?: Partial<Record<MakeFormat, string>>; forFormat?: MakeFormat; rol?: string; reakciya?: string }
// Формат и задача дня из плана тем (?fkod=&rol=&reakciya= или «Взять тему»), уходят один раз с темой этого дня
export type PlanPick = { formatKod?: string; forFormat?: MakeFormat; rol?: string; reakciya?: string; situaciya?: string }
// Тема в плашке «На сегодня» и в «Плане тем»: текст, формат дня из плана, номер дня и задача дня
export type TopicPick = { text: string; format?: MakeFormat; day?: number; plan?: PlanPick }

// чипы, у которых есть выбор подачи: тип формата каталога для каждого
const PICK_TIP: Partial<Record<MakeFormat, Zh6Format['tip']>> = { reels: 'reels', carousel: 'carousel', post: 'post' }
const PICK_TITLE: Partial<Record<MakeFormat, string>> = { reels: 'Как снять рилс', carousel: 'Подача карусели', post: 'Подача поста' }

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
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const CARD_SHADOW = 'shadow-[0_1px_2px_rgba(59,42,34,.05)]'

export default function Composer({ firstTime, topics, busy, onSubmit, initialText, initialFormats, askSampleText, onSampleCleared, plan, materials, until, paymentsOn, subline, below, take, onTextChange }: {
  materials?: Materials | null // остаток текстов: при 0 главная кнопка неактивна, строка под кнопкой
  until?: string               // платный тариф: до какого числа («12 декабря»)
  paymentsOn?: boolean         // оплата подключена: кнопка конца пробных ведет на оплату
  firstTime?: boolean          // undefined: еще не загружено (заголовок не мигает)
  topics: (TopicPick | string)[]
  busy: boolean
  onSubmit: (s: ComposerSubmit) => void
  initialText?: string
  initialFormats?: MakeFormat[] // формат из плана (?format=) выбран заранее
  askSampleText?: boolean       // ссылка не открылась (закрытый канал, ошибка): просим вставить текст поста
  onSampleCleared?: () => void  // ссылку убрали или поменяли: просьба вставить текст больше не нужна
  plan?: PlanPick | null        // формат и задача дня из адреса (план тем), пока не ушли в первый запуск
  subline?: string              // строка под заголовком на компьютере («День 10 из 30 по плану тем»)
  below?: ReactNode             // блок под кнопкой («Еще не в блоге», ритм на телефоне)
  take?: { pick: TopicPick; n: number } | null // тема, взятая снаружи (строка «Плана тем» справа)
  onTextChange?: (t: string) => void
}) {
  const router = useRouter()
  const { typing } = useDashboardMe()
  const list: TopicPick[] = topics.map(x => (typeof x === 'string' ? { text: x } : x))
  const [text, setText] = useState(initialText || '')
  // черновик пишем, только когда человек сам печатал: тема из адреса не должна затирать ее черновик
  const typed = useRef(false)
  const [about, setAbout] = useState('')
  const [screens, setScreens] = useState<File[]>([])
  const [sampleOpen, setSampleOpen] = useState(false)
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
  // тема, взятая кнопкой «Взять тему» или строкой плана: ее формат и задача дня действуют, пока она в поле
  const [taken, setTaken] = useState<TopicPick | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // подача каталога zh6 у каждого отмеченного формата своя. В vidy только выбранное руками (null: «подберется»);
  // формата нет в vidy: стоит подача из плана (для формата дня) или «подберется под тему». Сняли отметку: выбор забываем.
  const [formaty, setFormaty] = useState<Zh6Format[]>([])
  const [vidy, setVidy] = useState<Partial<Record<MakeFormat, string | null>>>({})
  const [planKodOff, setPlanKodOff] = useState(false)
  const [pickFor, setPickFor] = useState<MakeFormat | null>(null)
  // в листе раскрыто «Как снять» или «Выбрать точнее» у одной карточки (id карточки)
  const [kakOpen, setKakOpen] = useState<string | null>(null)
  const [tochOpen, setTochOpen] = useState<string | null>(null)
  const kartinki = useVidKartinki()
  // при открытии листа выбранную подачу прокручиваем в середину: она может стоять ниже первого экрана
  const sheetList = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pickFor) return
    const tm = setTimeout(() => sheetList.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'center' }), 250)
    return () => clearTimeout(tm)
  }, [pickFor])
  useEffect(() => { let on = true; loadFormaty().then(f => { if (on) setFormaty(f) }); return () => { on = false } }, [])

  // прошлый набор форматов и незаконченный черновик
  useEffect(() => {
    try {
      const f = JSON.parse(readLS(FORMATS_KEY) || 'null')
      if (initialFormats?.length) setFormats(initialFormats)
      else if (Array.isArray(f) && f.length) {
        const ok = MAKE_FORMATS.map(m => m.id).filter(id => f.includes(id))
        if (ok.length) setFormats(ok)
      }
    } catch {}
    const d = readLS(DRAFT_KEY)
    // черновик помним и при теме из адреса: тема в поле, а «Продолжить черновик» появится, если поле очистить
    if (d && d.trim() && d.trim() !== (initialText || '').trim()) setDraft(d)
  }, [initialText, initialFormats])
  useEffect(() => { if (initialText) setText(initialText) }, [initialText])
  useEffect(() => { onTextChange?.(text) }, [text, onTextChange])

  // черновик пишется сам, пока человек печатает
  useEffect(() => {
    const tm = setTimeout(() => { if (typed.current && text.trim().length >= 3 && !URL_RE.test(text)) writeLS(DRAFT_KEY, text) }, 600)
    return () => clearTimeout(tm)
  }, [text])

  // поле растет от 3 до 6 строк, дальше прокрутка внутри
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 78), 156)}px`
  }, [text])

  const usedVoice = useRef(false)
  const appendVoice = useCallback((v: string) => { typed.current = true; usedVoice.current = true; setText(prev => (prev.trim() ? `${prev.trim()} ${v}` : v)) }, [])
  const rec = useVoiceRecorder(appendVoice, { maxSeconds: VOICE_MAX, nearSeconds: VOICE_NEAR })
  const transcribing = rec.state === 'transcribing'
  const transcribeFailed = rec.state === 'error' && rec.errorKind === 'network'

  const link = URL_RE.test(text) ? text.trim() : null
  // Instagram по ссылке текст не отдает: просим скриншоты, описание или расшифровку рилса (своим Whisper, бесплатно)
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
  const sampleMode = !!sozhe || !!link || screens.length > 0
  useFeatureOpen('sozhe', !!link || screens.length > 0)

  // тема дня: та, что сейчас в плашке «На сегодня»; пока темы грузятся, общая тема
  const dayTopic: TopicPick = list.length ? list[topicIdx % list.length] : { text: GENERIC_TOPIC }
  const t = text.trim()
  // формат и задача из плана действуют, пока в поле тема этого дня (взятая или из адреса); пустое поле: тема дня
  const urlPick: TopicPick | null = plan && initialText ? { text: initialText, plan } : null
  const activePick: TopicPick | null = t
    ? (taken?.plan && t === taken.text.trim() ? taken : urlPick && t === urlPick.text.trim() ? urlPick : null)
    : (dayTopic.plan ? dayTopic : null)
  const curPlan = activePick?.plan && !sampleMode ? activePick.plan : null
  const activeKey = activePick?.text || ''
  useEffect(() => { setPlanKodOff(false) }, [activeKey])

  const takeTopic = useCallback((p: TopicPick) => {
    typed.current = false
    setText(p.text)
    setTaken(p)
    setHint(null)
    // формат из плана подставляется в чипы, его можно поменять
    if (p.format) { setFormats([p.format]); setVidy({}) }
  }, [])
  const takeN = take?.n
  useEffect(() => { if (take?.pick) takeTopic(take.pick) }, [takeN]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFormat = (f: MakeFormat) => {
    if (formats.includes(f)) {
      // сняли отметку: подачу этого формата забываем (и подача из плана тоже не вернется)
      setVidy(prev => { const n = { ...prev }; delete n[f]; return n })
      if (curPlan?.forFormat === f) setPlanKodOff(true)
    }
    setFormats(prev => prev.includes(f) ? prev.filter(x => x !== f) : MAKE_FORMATS.map(m => m.id).filter(id => id === f || prev.includes(id)))
  }

  const pasteLink = async () => {
    try {
      const v = (await navigator.clipboard.readText()).trim()
      // не ссылка в поле не идет: чужой пост, вставленный текстом, ушел бы в генерацию как своя мысль
      if (v && URL_RE.test(v)) { setText(v); setHint(null); return }
      if (v) { setHint('Скопированное не похоже на ссылку. Скопируй ссылку на пост или загрузи скриншот'); return }
    } catch {}
    setHint('Телефон не дал прочитать скопированное. Вставь ссылку в поле: долгое нажатие и «Вставить»')
    area.current?.focus()
  }
  const pickScreens = (fl: FileList | null) => {
    const files = Array.from(fl || []).filter(f => f.type.startsWith('image/')).slice(0, 10)
    if (files.length) setScreens(files)
  }
  const clearSozhe = () => { setScreens([]); if (link) setText(''); setAbout(''); setSampleText(''); setSampleOpen(false); onSampleCleared?.() }
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
      const v = typeof d?.text === 'string' ? d.text.trim() : ''
      if (!res.ok || !v) throw new Error()
      setSampleText(v); setVideoState('idle')
    } catch { setVideoState('error') }
  }

  const tipFormats = (f: MakeFormat) => (PICK_TIP[f] ? formaty.filter(x => x.tip === PICK_TIP[f]) : [])
  // подача формата сейчас: свой выбор, иначе подача из плана для формата дня, иначе «подберется». Код без имени в каталоге
  // (не подходит голосу или «Пока без видео») не показываем и не шлем: генератор подберет сам.
  // В vidy либо код подачи, либо 'g:<карточка>' (карточка без подвида: генератор выберет внутри нее)
  const vidOf = (f: MakeFormat): { code: string | null; karta: string | null; name?: string; fromPlan: boolean } => {
    const own = f in vidy
    const val = own ? vidy[f] ?? null : curPlan && !planKodOff && curPlan.forFormat === f && curPlan.formatKod ? curPlan.formatKod : null
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

  const noMaterials = !!materials && materials.remaining <= 0
  // форматов выбрано больше, чем осталось текстов: сервер откажет (text_limit_partial), поэтому кнопку выключаем сразу
  const tooMany = !!materials && !noMaterials && formats.length > materials.remaining
  const disabled = noMaterials || tooMany || busy || !formats.length || transcribing || (!!link && needText && !sozhe)
  const submit = () => {
    if (disabled) return
    writeLS(FORMATS_KEY, JSON.stringify(formats))
    // черновик стирает MakeFlow после первого готового формата: при ошибке мысль должна остаться
    setDraft(null)
    // пустое поле без образца: пишем на тему дня. Тема: поле ровно как готовая тема (адрес, «Взять тему», план), иначе своя мысль
    const eff = link ? '' : t || (sozhe ? '' : dayTopic.text)
    const isTopic = !!eff && (!t || eff === (initialText || '').trim() || list.some(x => x.text === eff))
    // подача у каждого отмеченного формата отдельно; задача и реакция из плана только формату дня
    const out: Partial<Record<MakeFormat, string>> = {}
    const gr: Partial<Record<MakeFormat, string>> = {}
    for (const f of formats) {
      if (!pickable(f)) continue
      const v = vidOf(f)
      if (v.code) out[f] = v.code
      else if (v.karta) gr[f] = v.karta
    }
    const hasVidy = Object.keys(out).length > 0 || Object.keys(gr).length > 0
    const planTask = !!(curPlan?.rol || curPlan?.reakciya)
    const zh6: Zh6Choice | undefined = hasVidy || planTask
      ? {
          ...(Object.keys(out).length ? { vidy: out } : {}),
          ...(Object.keys(gr).length ? { grupy: gr } : {}),
          ...(curPlan?.forFormat ? { forFormat: curPlan.forFormat } : {}),
          ...(curPlan?.rol ? { rol: curPlan.rol } : {}),
          ...(curPlan?.reakciya ? { reakciya: curPlan.reakciya } : {}),
        }
      : undefined
    onSubmit({ text: eff, formats, goal, sozhe, about: sozhe ? about.trim() : undefined, mode: isTopic ? 'topic' : 'thought', voice: usedVoice.current, zh6, ...(curPlan?.situaciya ? { situaciya: curPlan.situaciya } : {}) })
  }

  const sourceLabel = screens.length
    ? `${screens.length} ${screens.length === 1 ? 'скриншот' : screens.length < 5 ? 'скриншота' : 'скриншотов'}`
    : link ? link.replace(/^https?:\/\/(www\.)?/i, '') : ''

  // плашка «На сегодня»: пока поле пустое или в нем взятая тема (своя мысль в поле ее прячет, чтобы не затереть)
  const showToday = !sampleMode && !sampleOpen && (!t || list.some(x => x.text.trim() === t) || t === GENERIC_TOPIC)
  const todayInField = !!t && t === dayTopic.text.trim()
  const otherTopic = () => {
    const next = list[(topicIdx + 1) % list.length]
    setTopicIdx(i => i + 1)
    // тема уже стояла в поле: следующая встает на ее место
    if (todayInField && next) takeTopic(next)
  }
  const todayLabel = !dayTopic.day && firstTime ? 'На сегодня, под то, с чем ты работаешь' : 'На сегодня'

  const spend = materials ? spendLine(materials, formats.length, until) : ''
  const deskHint = `Около минуты${spend ? ` · ${lowerFirst(spend)}` : ''}`
  const phoneHint = spend || (materials ? '' : 'Около минуты, текст сохранится в «Моих текстах»')
  // кнопка на телефоне прилипает над нижним меню (56 px); пока печатают (меню уехало) или тексты закончились, стоит в потоке
  const stick = !typing && !noMaterials
  // на платном заголовок блока выше уже говорит «Тексты этого месяца закончились», на кнопке не повторяем
  const buttonText = noMaterials ? (materials?.kind === 'month' ? END.monthButton : END.disabled) : tooMany ? END.tooMany : !formats.length ? 'Выбери, что написать' : sampleMode ? 'Написать по образцу' : makeButtonText(formats)

  return (
    <div className={`min-w-0 ${stick ? 'max-lg:pb-[120px]' : ''}`}>
      <h1 className={`text-[26px] leading-8 lg:text-[32px] lg:leading-10 font-semibold tracking-[-0.3px] text-brand-text ${firstTime === undefined ? 'invisible' : ''}`}>{firstTime ? 'О чем первый текст?' : 'О чем сегодня?'}</h1>
      <Squiggle variant={0} width="150px" />
      {subline && <p className="hidden lg:block mt-1.5 text-[14px] leading-5 text-brand-muted">{subline}</p>}

      {sampleMode && (
        <div className="mt-4 min-h-11 flex items-center gap-2 pl-3 rounded-xl bg-brand-soft-2 text-brand-text">
          {screens.length ? <ImageIcon className="w-4 h-4 shrink-0" /> : <Link2 className="w-4 h-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-[14px] [overflow-wrap:anywhere]">По образцу: {sourceLabel}</span>
          <button type="button" onClick={clearSozhe} className={`mr-1 shrink-0 ${QUIET_BTN_SM}`}>Убрать образец</button>
        </div>
      )}

      {/* поле мысли */}
      <div className={`mt-4 lg:mt-5 rounded-[20px] bg-brand-card ${CARD_SHADOW} ring-brand-accent/40 focus-within:ring-2 transition`}>
        <textarea
          ref={area}
          value={text}
          onChange={e => { typed.current = true; setText(e.target.value); setHint(null) }}
          readOnly={transcribing}
          rows={3}
          aria-label="Мысль"
          placeholder={transcribing ? 'Расшифровка...' : 'Мысль, вопрос, который часто слышишь, или совет, который бесит. Можно оставить пустым'}
          className={`block w-full resize-none bg-transparent px-4 lg:px-5 pt-3.5 lg:pt-5 text-[16px] lg:text-[17px] leading-[26px] text-brand-text placeholder:text-[#A39A8C] focus:outline-none ${transcribing ? 'animate-pulse' : ''}`}
        />
        <div className="h-[72px] flex items-center gap-2 pl-2 lg:pl-3 pr-3">
          <button type="button" onClick={() => setSampleOpen(o => !o)} aria-expanded={sampleOpen || sampleMode}
            className={`shrink-0 ${QUIET_BTN}`}>
            <Paperclip className="w-[18px] h-[18px]" />
            <span className="sm:hidden">По образцу</span><span className="hidden sm:inline">Написать по образцу</span>
          </button>
          <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-brand-muted" aria-live="polite">
            {transcribing && <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Расшифровка...</span>}
          </p>
          <button type="button" onClick={() => { rec.reset(); setVoiceOpen(true) }} disabled={transcribing} aria-label="Записать голосом"
            className="w-14 h-14 rounded-full bg-brand-accent text-white flex items-center justify-center hover:bg-brand-accent-hover active:scale-95 transition cursor-pointer disabled:opacity-50 shrink-0">
            <Mic className="w-6 h-6" />
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
      {!t && !sampleMode && !noMaterials && <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">Если оставить пустым, текст будет на тему дня</p>}

      {!t && !sampleMode && draft && (
        <button type="button" onClick={() => { typed.current = true; setText(draft); setDraft(null) }}
          className="mt-2 w-full min-h-11 flex items-center gap-2 px-3 rounded-xl border border-brand-border bg-brand-card text-left text-brand-text hover:bg-brand-soft-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent">
          <FileText className="w-[18px] h-[18px] text-brand-muted shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[15px]">Продолжить черновик: {draft}</span>
          <ChevronRight className="w-4 h-4 text-brand-muted shrink-0" />
        </button>
      )}

      {/* Написать по образцу */}
      {sampleOpen && !sampleMode && (
        <div className="mt-3 rounded-2xl bg-brand-card border border-brand-border p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] leading-[22px] font-semibold text-brand-text">Понравился чужой пост?</p>
              <p className="mt-0.5 text-[14px] leading-5 text-brand-text-secondary">Вставь ссылку или скриншоты. Устройство возьмется оттуда, тема и слова будут твои.</p>
            </div>
            <button type="button" onClick={() => setSampleOpen(false)} aria-label="Закрыть" className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-full text-brand-muted hover:text-brand-text cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={pasteLink} className="h-11 px-4 rounded-xl border-[1.5px] border-brand-accent text-[15px] font-semibold text-brand-accent hover:bg-brand-soft-2 cursor-pointer">Вставить ссылку</button>
            <button type="button" onClick={() => fileInput.current?.click()} className="h-11 px-4 rounded-xl border border-brand-border text-[15px] text-brand-text hover:border-brand-accent cursor-pointer">Загрузить скриншоты</button>
          </div>
          <p className="mt-2 text-[13px] text-brand-muted">Только публичные посты. Переписки с клиентами не загружай</p>
        </div>
      )}

      {link && needText && !screens.length && (
        <div className="mt-3 space-y-2">
          <p className="text-[14px] text-brand-text">
            {igReel ? 'Загрузи видео или вставь расшифровку. Расшифровка не тратит тексты'
              : igLink ? 'Instagram не отдает текст по ссылке. Загрузи скриншоты или скопируй описание'
              : 'Не получилось открыть пост по ссылке. Пришли скриншот или вставь его текст'}
          </p>
          <textarea value={sampleText} onChange={e => setSampleText(e.target.value)} rows={4} aria-label="Текст поста"
            placeholder={igReel ? 'Расшифровка ролика' : 'Текст поста'}
            className="block w-full resize-y rounded-xl bg-brand-card border border-brand-border px-4 py-3 text-[16px] leading-6 text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent" />
          <div className="flex flex-wrap gap-2">
            {igReel && (
              <button type="button" onClick={() => videoInput.current?.click()} disabled={videoState === 'busy'} className="h-11 px-4 rounded-xl bg-white border border-brand-border text-[15px] text-brand-text cursor-pointer disabled:opacity-50 inline-flex items-center gap-2">
                {videoState === 'busy' && <Loader2 className="w-4 h-4 animate-spin" />}{videoState === 'busy' ? 'Расшифровка...' : 'Загрузить видео'}
              </button>
            )}
            <button type="button" onClick={() => fileInput.current?.click()} className="h-11 px-4 rounded-xl bg-white border border-brand-border text-[15px] text-brand-text cursor-pointer">Загрузить скриншоты</button>
          </div>
          {videoState === 'error' && <p className="text-[13px] text-brand-muted">Видео не расшифровалось. Вставь расшифровку текстом или загрузи скриншоты</p>}
          <input ref={videoInput} type="file" accept="video/*" hidden onChange={e => { transcribeVideo(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      )}
      {sampleMode && (
        <div className="mt-3"><VoiceTextarea value={about} onChange={setAbout} placeholder="О чем у тебя? Можно оставить пустым, тема подберется сама" minHeight={56} /></div>
      )}

      {/* На сегодня */}
      {showToday && (
        <div className="mt-3.5 rounded-2xl bg-brand-soft-2 px-3.5 py-3 lg:pl-4 lg:pr-3 flex flex-col lg:flex-row lg:items-center gap-2.5 lg:gap-3.5">
          <div className="flex items-start lg:items-center gap-3.5 min-w-0 flex-1">
            <CalendarDays className="hidden lg:block w-5 h-5 text-brand-accent shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-[18px] font-medium text-brand-muted">{todayLabel}{dayTopic.day ? <span className="lg:hidden"> · день {dayTopic.day}</span> : null}</p>
              <p className="mt-0.5 text-[16px] leading-[22px] font-medium text-brand-text break-words">
                {dayTopic.text}{dayTopic.format && <span className="hidden lg:inline"> · {formatOne(dayTopic.format)}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {todayInField ? (
              <span className="h-11 px-4 inline-flex items-center gap-1.5 rounded-xl text-[14px] font-semibold text-brand-accent"><Check className="w-4 h-4" />Тема в поле</span>
            ) : (
              <button type="button" onClick={() => takeTopic(dayTopic)}
                className="h-11 px-4 rounded-xl bg-white border-[1.5px] border-brand-accent text-[14px] font-semibold text-brand-accent hover:bg-brand-soft cursor-pointer">Взять тему</button>
            )}
            {list.length > 1 && (
              <button type="button" onClick={otherTopic} className={QUIET_BTN}>Другая тема</button>
            )}
          </div>
        </div>
      )}

      {/* Что написать */}
      <p className="hidden lg:block mt-6 mb-2.5 text-[13px] leading-[18px] font-medium text-brand-muted" id="what-h">Что написать</p>
      <div role="group" aria-labelledby="what-h" className="max-lg:mt-4 flex flex-wrap gap-2">
        {MAKE_FORMATS.map(f => {
          const on = formats.includes(f.id)
          return (
            <button key={f.id} type="button" aria-pressed={on} onClick={() => toggleFormat(f.id)}
              className={`h-11 px-4 inline-flex items-center gap-1.5 rounded-full text-[15px] font-medium text-brand-text transition cursor-pointer ${on ? 'bg-brand-soft border border-brand-text' : 'bg-white border border-brand-border hover:border-brand-text/40'}`}>
              {on && <Check className="w-4 h-4 text-brand-accent" aria-hidden="true" />}
              {f.label}
            </button>
          )
        })}
      </div>
      {/* подача у каждого отмеченного формата: строка под чипами, нажала и выбрала (только при zh6, иначе каталога нет) */}
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
                  <span className="text-brand-muted">{f.id === 'reels' ? 'Рилс, как снять' : `${f.label}, подача`} · </span>
                  {name ? <span className="text-brand-text">{name}</span> : <span className="text-brand-muted">{VID_TEXT.auto}</span>}
                </span>
                {v.fromPlan && <span className="shrink-0 px-2 rounded-full bg-brand-soft-2 text-[12px] leading-5 text-brand-text">{VID_TEXT.plan}</span>}
                <ChevronDown className="w-4 h-4 text-brand-muted shrink-0" />
              </button>
            )
          })}
        </div>
      )}
      <button type="button" onClick={() => setGoalOpen(true)} aria-haspopup="dialog" className="mt-2 max-w-full min-h-11 px-3 inline-flex items-center gap-1 rounded-xl border border-brand-border bg-brand-card text-[15px] text-left hover:border-brand-accent cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent">
        <span className="text-brand-muted">Зачем пишешь:</span>
        <span className="text-brand-text">{lowerFirst(GOAL_OPTIONS.find(g => g.id === goal)?.label || 'Подобрать по теме')}</span>
        <ChevronDown className="w-4 h-4 text-brand-muted" />
      </button>

      {/* конец текстов: над неактивной кнопкой (SOSTOYANIYA-A) */}
      {noMaterials && materials && (
        <div className="mt-4 rounded-2xl bg-brand-card border border-brand-border px-4 py-4" role="status">
          <p className="text-[17px] leading-6 font-semibold text-brand-text">{materials.kind === 'trial' ? END.trial.short : END.month.title()}</p>
          <p className="mt-1 text-[15px] leading-[22px] text-brand-text-secondary">{END[materials.kind].text}</p>
          {END[materials.kind].note && !paymentsOn && <p className="mt-1 text-[13px] leading-5 text-brand-muted">{END[materials.kind].note}</p>}
          <button type="button" onClick={() => { track('paywall_view', { where: 'make_limit' }); router.push(paymentsOn && materials.kind === 'trial' ? '/dashboard/oplata?plan=start' : TARIFF_HREF) }}
            className="mt-3 w-full sm:w-auto h-12 px-5 rounded-2xl bg-brand-accent text-white text-[15px] font-semibold hover:bg-brand-accent-hover cursor-pointer">{paymentsOn && materials.kind === 'trial' ? END.buttonPay : END.button}</button>
        </div>
      )}

      {/* главная кнопка: телефон прилипает над нижним меню и всегда со строкой остатка, компьютер в строку с подсказкой */}
      <div className={`${stick ? 'max-lg:fixed max-lg:inset-x-0 max-lg:z-30 max-lg:bottom-[calc(56px+env(safe-area-inset-bottom))] max-lg:px-4 max-lg:pt-3 max-lg:pb-2 max-lg:bg-brand-bg max-lg:border-t max-lg:border-brand-border' : 'max-lg:mt-4'} lg:mt-6 lg:flex lg:items-center lg:gap-4`}>
        <button type="button" onClick={submit} disabled={disabled}
          className={`w-full lg:w-auto h-[52px] lg:px-7 rounded-2xl text-[16px] font-semibold transition cursor-pointer disabled:cursor-not-allowed ${formats.length && !noMaterials && !tooMany ? 'bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-60' : 'bg-brand-border text-brand-text/70'}`}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin inline" aria-label="Пишется" /> : buttonText}
        </button>
        {!noMaterials && (
          <>
            <p className="lg:hidden mt-1.5 text-center text-[14px] leading-5 text-brand-muted" aria-live="polite">{phoneHint}</p>
            <p className="hidden lg:block min-w-0 text-[14px] leading-5 text-brand-muted" aria-live="polite">{deskHint}</p>
          </>
        )}
      </div>

      {below && <div className="mt-6 lg:mt-11">{below}</div>}

      <VoiceSheet open={voiceOpen} rec={rec} onClose={() => setVoiceOpen(false)} onWriteText={() => { setVoiceOpen(false); rec.reset(); setTimeout(() => area.current?.focus(), 50) }} />
      <BottomSheet open={!!pickFor} onClose={() => setPickFor(null)} title={pickFor ? PICK_TITLE[pickFor] : ''}>
        {pickFor && (
          <div role="radiogroup" aria-label={pickFor === 'reels' ? 'Как снять' : 'Подача'} ref={sheetList} className="space-y-2.5 pb-2">
            {(() => {
              const tip = tipOf(pickFor)
              if (!tip) return null
              const cur = vidOf(pickFor)
              const avail = tipFormats(pickFor).map(x => x.code)
              const isKak = tip === 'reels'
              const choose = (val: string | null) => choosePick(pickFor, val)
              return (
                <>
                  {/* подобрать под тему: первой, без шагов */}
                  <button type="button" role="radio" aria-checked={!cur.code && !cur.karta} onClick={() => choose(null)}
                    className={`w-full p-3 flex items-center gap-3 rounded-2xl border text-left cursor-pointer ${!cur.code && !cur.karta ? 'border-brand-text bg-brand-soft/50' : 'border-brand-border bg-white'}`}>
                    <VidKartinka id={`${tip}:auto`} k={kartinki} size={48} boxClass="w-[72px] h-[72px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] leading-[22px] font-semibold text-brand-text">{AUTO_TEXT[tip].title}</span>
                      <span className="block mt-0.5 text-[14px] leading-5 text-brand-muted">{AUTO_TEXT[tip].what}</span>
                    </span>
                  </button>
                  {GRUPPY[tip].map(g => {
                    const kt = KARTY[tip][g.id]
                    const kody = g.codes.filter(c => avail.includes(c))
                    if (!kt || !kody.length) return null
                    const sel = cur.karta === g.id
                    const subs = kody
                    return (
                      <div key={g.id} className={`relative rounded-2xl border ${sel ? 'border-brand-text bg-brand-soft/50' : 'border-brand-border bg-white'}`}>
                        {sel && <Check className="absolute top-3 right-3 w-5 h-5 text-brand-accent" aria-hidden="true" />}
                        <button type="button" role="radio" aria-checked={sel} onClick={() => choose(`g:${g.id}`)}
                          className="w-full p-3 pr-9 flex items-start gap-3 text-left cursor-pointer">
                          {/* картинки с Верой крупнее: 96 px на телефоне, 112 px от 640 px, иначе деталей не разобрать */}
                          <VidKartinka id={`${tip}:${g.id}`} k={kartinki} size={kartinki === 'c' ? 112 : 64} boxClass="w-24 h-24 sm:w-28 sm:h-28" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[16px] leading-[22px] font-semibold text-brand-text">{kt.title}</span>
                            <span className="block mt-0.5 text-[14px] leading-5 text-brand-text-secondary">{kt.what}</span>
                            {/* у Onest нет курсива: пример отделен линией слева, реплики сценки по строкам */}
                            <span className="block mt-2 pl-2 border-l-2 border-brand-border-soft text-[13px] leading-[18px] text-brand-text-secondary whitespace-pre-line break-words">{kt.example}</span>
                          </span>
                        </button>
                        <div className="flex flex-wrap gap-2 px-3 pb-3">
                          <button type="button" aria-expanded={kakOpen === g.id} onClick={() => setKakOpen(kakOpen === g.id ? null : g.id)}
                            className={kakOpen === g.id ? QUIET_BTN_SM : QUIET_BTN_SM_MUTED}>
                            {isKak ? KNOPKI.kakSnyat : KNOPKI.kakVylozhit}<ChevronDown className={`w-4 h-4 transition ${kakOpen === g.id ? 'rotate-180' : ''}`} />
                          </button>
                          {/* «выбрать точнее» только у выбранной карточки: иначе на экране 8-10 одинаковых кнопок */}
                          {subs.length > 1 && sel && (
                            <button type="button" aria-expanded={tochOpen === g.id} onClick={() => setTochOpen(tochOpen === g.id ? null : g.id)}
                              className={QUIET_BTN_SM}>
                              {KNOPKI.tochnee}<ChevronDown className={`w-4 h-4 transition ${tochOpen === g.id ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                        {kakOpen === g.id && (
                          <div className="px-4 pb-3">
                            <ol className="list-decimal pl-5 space-y-1 text-[14px] leading-5 text-brand-text marker:text-brand-muted">
                              {kt.how.steps.map((st, n) => <li key={n}>{st}</li>)}
                            </ol>
                            <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">{kt.how.time} · {kt.how.need}</p>
                          </div>
                        )}
                        {tochOpen === g.id && (
                          <div className="px-2 pb-2 border-t border-brand-border mt-1 pt-1" role="radiogroup" aria-label={kt.title}>
                            {[{ code: `g:${g.id}`, name: KNOPKI.luboj, line: '' }, ...subs.map(c => ({ code: c, name: kt.sub?.[c]?.[0] || formaty.find(x => x.code === c)?.name || c, line: kt.sub?.[c]?.[1] || '' }))].map(o => {
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
      <BottomSheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Зачем пишешь">
        <div role="radiogroup" aria-label="Зачем пишешь">
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
