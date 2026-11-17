'use client'

// Оформление карусели на экране результата (07-KARUSELI-TZ.md; вариант А, макеты A2 и A10).
// Компьютер (от lg): режим фокуса из трех зон поверх области контента. Слева «Оформление» (три стиля под текст,
// «Все стили», цвета, «Сохранить оформление»), в центре большой слайд со стрелками и лента миниатюр
// («Все слайды рядом» сеткой), справа правка текущего слайда. В шапке «Назад», форматы мысли (если переданы),
// «Скопировать описание», «Скачать все слайды».
// Телефон: листалка слайдов с точками, тап по слайду открывает правку под ним, ниже «Оформление»,
// панель «Сохранить в Фото» (share с файлами), «Описание», «•••».
// Первая карусель: три стиля под тон текста. Дальше карусель сразу открывается в сохраненном оформлении.
//
// Режим фокуса и меню кабинета: useShellFocus (DashboardShell) сворачивает меню в иконки 72 px, панель стоит
// от 72 px слева. Экрану результата при входе и выходе зовется onFocusChange(on).

import { useFeatureOpen } from '@/lib/analytics/hooks'
import { useShellFocus } from '@/components/dashboard/DashboardShell'
import { track as trackEvent } from '@/lib/track'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Check, Copy, Download, X, Plus, Shuffle, ChevronDown, ChevronLeft, ChevronRight, Scissors, Type, ImageDown, LayoutGrid, MoreHorizontal, Maximize2 } from 'lucide-react'
import { parseCarouselText } from '@/lib/carousel/parse'
import { shrink } from '@/lib/image-shrink'
import VoiceTextarea from '@/components/VoiceTextarea'
import BottomSheet from '@/components/make/BottomSheet'
import { STYLES, TEMPLATE_STYLES, PALETTES, VARIANTS, DECORS, isSuggestable, type Decor, type TemplateStyle, type Palette } from '@/lib/carousel/styles'

type Slide = { n: number; role: string; big: string; small: string; accent: string | null; photo: boolean; overflow: boolean }
type Options = { accentKind?: 'color' | 'marker' | 'underline'; bigNumbers?: boolean; rubric?: string; coverPhoto?: boolean; theme?: 'light' | 'dark' }
type DesignView = {
  id: string
  style: TemplateStyle
  palette: Palette
  custom: boolean
  colorNotes: string[]
  variant: number
  decor: Decor
  decorAllowed: boolean
  fontPair: number
  fontPairs: string[]
  options: Options
  tunable: boolean      // в базе есть поля шрифта и вида (миграция применена)
  isMine: boolean       // вид совпадает с сохраненным оформлением
  hasMine: boolean
  canSaveMine: boolean  // оформление можно сохранить (миграция применена)
  caption: string
  sourceText: string
  version: string
  handle: string
  photosCount: number
  hasAvatar: boolean
  needsPhotos: boolean
  slides: Slide[]
}
type Photo = { path: string; url: string }
type Author = { name: string; about: string; nameSet: boolean; aboutSet: boolean }

// Шапка режима фокуса: что передает экран результата. Без onBack «Назад» просто выходит из фокуса.
export type CarouselFocusOpts = {
  title?: string
  formats?: { id: string; label: string }[]
  activeFormat?: string
  onFormat?: (id: string) => void
  onBack?: () => void
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim()
const pad2 = (n: number) => String(n).padStart(2, '0')
const DEFAULT_SUGGESTED: TemplateStyle[] = ['t_redakciya', 't_stikery', 't_zametki']
// цвета первым рядом; остальные палитры и пипетка в «Еще настройки»
const QUICK_PALETTES = ['Бумага', 'Шалфей', 'Пудра', 'Море', 'Сливки', 'Графит']
const ACCENT_KINDS = [['color', 'Цветом'], ['marker', 'Маркером'], ['underline', 'Подчеркнуть']] as const

// Телефон, который умеет отдать картинки в «Сохранить N изображений» (share с файлами)
function canShareFiles(): boolean {
  try {
    if (typeof navigator === 'undefined' || !navigator.canShare || !window.matchMedia('(pointer: coarse)').matches) return false
    return navigator.canShare({ files: [new File([new Uint8Array([0])], '01.png', { type: 'image/png' })] })
  } catch { return false }
}
// инициалы, как на последнем слайде, пока фото нет
export const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'Я'
const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

function useDesk() {
  const [desk, setDesk] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const f = () => setDesk(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return desk
}

export default function CarouselDesigner({ postId, text, onTextChange, focus, onFocusChange, mobileBar = 'inline' }: {
  postId: string
  text: string
  onTextChange: (t: string) => void
  focus?: CarouselFocusOpts
  onFocusChange?: (on: boolean) => void
  // 'fixed': панель «Сохранить в Фото · Описание · •••» прилипает к низу над таб-баром (когда экран прячет свою);
  // 'inline': стоит в потоке под листалкой
  mobileBar?: 'inline' | 'fixed'
}) {
  useFeatureOpen('carousel_design')
  const desk = useDesk()
  const [design, setDesign] = useState<DesignView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // что сейчас делаем, для подписи на кнопке
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [handle, setHandle] = useState('')
  const [author, setAuthor] = useState<Author>({ name: '', about: '', nameSet: false, aboutSet: false })
  const [suggested, setSuggested] = useState<TemplateStyle[]>(DEFAULT_SUGGESTED)
  const [mine, setMine] = useState<{ style: TemplateStyle } | null>(null)
  const [canSaveMine, setCanSaveMine] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [avatar, setAvatar] = useState<Photo | null>(null)
  const [bust, setBust] = useState(0) // перерисовать картинки после смены фото или ника
  const [cur, setCur] = useState(0)   // какой слайд сейчас открыт
  const [loading, setLoading] = useState<Record<number, boolean>>({}) // слайд перерисовывается
  const [broken, setBroken] = useState<Record<number, boolean>>({})
  const [editN, setEditN] = useState<number | null>(null)
  const [editBig, setEditBig] = useState('')
  const [editSmall, setEditSmall] = useState('')
  const [copied, setCopied] = useState(false)
  const [draftPal, setDraftPal] = useState<Palette | null>(null) // свои цвета, пока крутит пипетку
  const [allStyles, setAllStyles] = useState(false)
  const [tune, setTune] = useState(false)       // «Еще настройки»
  const [saveForm, setSaveForm] = useState(false) // форма «Сохранить оформление» (ник, имя, фото)
  const [saved, setSaved] = useState(false)
  const [share, setShare] = useState(false)
  const [files, setFiles] = useState<File[] | null>(null) // слайды заранее, чтобы share сработал сразу по нажатию
  const [listMode, setListMode] = useState(false)
  const [grid, setGrid] = useState(false)       // компьютер: «Все слайды рядом»
  const [moreOpen, setMoreOpen] = useState(false)
  const [wantFocus, setWantFocus] = useState(true)
  const [rubric, setRubric] = useState('')
  const [brandV, setBrandV] = useState('') // версия ника, имени и фото: входит в адрес превью
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const autoMine = useRef(false)
  const editRef = useRef<HTMLDivElement>(null)
  const tuneRef = useRef<HTMLDivElement>(null)
  const focusCb = useRef(onFocusChange)
  focusCb.current = onFocusChange

  const parsed = useMemo(() => parseCarouselText(text), [text])
  const cover = parsed.slides[0] || ''
  const stale = !!design && norm(design.sourceText) !== norm(text)
  const caption = design?.caption || parsed.caption
  const shownSuggested = useMemo(() => {
    const xs = suggested.filter(isSuggestable)
    for (const s of DEFAULT_SUGGESTED) if (xs.length < 3 && !xs.includes(s)) xs.push(s)
    return xs.slice(0, 3)
  }, [suggested])

  const call = useCallback(async (label: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setBusy(label); setError(null); setNote(null)
    try {
      const r = await fetch('/api/carousel/design', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Не получилось сохранить, правки на месте. Нажми еще раз')
      if (d.design) { setDesign(d.design); setRubric(d.design.options?.rubric || '') }
      if ('mine' in d) setMine(d.mine)
      if (typeof d.text === 'string' && d.text) onTextChange(d.text)
      if (Array.isArray(d.design?.colorNotes) && d.design.colorNotes.length) setNote(d.design.colorNotes.join('. '))
      return d
    } catch (e: any) {
      setError(e.message)
      return null
    } finally {
      setBusy(null)
    }
  }, [onTextChange])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [d, p] = await Promise.all([
          fetch(`/api/carousel/design?postId=${encodeURIComponent(postId)}`).then(r => r.json()),
          fetch('/api/carousel/photos').then(r => r.json()),
        ])
        if (!alive) return
        setDesign(d.design || null)
        setRubric(d.design?.options?.rubric || '')
        setBrandV(d.brandVersion || '')
        setHandle(d.handle || '')
        if (d.author) setAuthor(d.author)
        if (Array.isArray(d.suggested) && d.suggested.length) setSuggested(d.suggested)
        setMine(d.mine || null)
        setCanSaveMine(!!d.canSaveMine)
        setPhotos(Array.isArray(p.photos) ? p.photos : [])
        setAvatar(p.avatar || null)
      } catch { /* покажем выбор стиля */ }
      if (alive) { setLoaded(true); setShare(canShareFiles()) }
    })()
    return () => { alive = false }
  }, [postId])

  // Сохраненное оформление есть, а у этой карусели оформления еще нет: сразу открываем в нем, без выбора стиля
  useEffect(() => {
    if (!loaded || design || !mine || autoMine.current || parsed.slides.length < 2) return
    autoMine.current = true
    call('mine', 'POST', { postId, useMine: true, text })
  }, [loaded, design, mine, parsed.slides.length, call, postId, text])

  // режим фокуса: только на компьютере и только когда есть что оформлять
  const focusOn = desk && wantFocus && loaded && parsed.slides.length >= 2
  useShellFocus(focusOn)
  useEffect(() => {
    focusCb.current?.(focusOn)
    if (!focusOn) return
    // под панелью фокуса страница не крутится
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prev
      focusCb.current?.(false)
    }
  }, [focusOn])

  const slideUrl = useCallback((n: number, dl = false) =>
    `/api/carousel/render?designId=${design?.id}&n=${n}&v=${encodeURIComponent(design?.version || '')}-${bust}${dl ? '&dl=1' : ''}`, [design?.id, design?.version, bust])
  const previewUrl = (s: TemplateStyle) =>
    `/api/carousel/preview?style=${s}&total=${parsed.slides.length}&cover=${encodeURIComponent(cover.slice(0, 160))}&v=${brandV}-${bust}`

  // новая версия слайдов: помечаем перерисовку, заранее готовим файлы для share
  const total = design?.slides.length || 0
  useEffect(() => {
    if (!design) return
    setLoading(Object.fromEntries(design.slides.map(s => [s.n, true])))
    setBroken({})
    setFiles(null)
    if (!share) return
    // ждем полторы секунды после последней правки (картинки в листалке успевают лечь в кеш браузера),
    // потом по одному слайду; новая версия отменяет старую загрузку, сервер не рисует лишнего
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const out: File[] = []
        for (const s of design.slides) {
          const b = await fetch(slideUrl(s.n), { signal: ctrl.signal }).then(r => { if (!r.ok) throw new Error(); return r.blob() })
          out.push(new File([b], `${pad2(s.n)}.png`, { type: 'image/png' }))
        }
        if (!ctrl.signal.aborted) setFiles(out)
      } catch { if (!ctrl.signal.aborted) setFiles(null) }
    }, 1500)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [design?.id, design?.version, bust, share]) // eslint-disable-line react-hooks/exhaustive-deps

  const fillEdit = (s: Slide) => {
    setEditN(s.n)
    // у диалога и финала одно поле: реплики построчно, финал одной фразой
    if (s.role === 'dialog' || s.role === 'final') { setEditBig([s.big, s.small].filter(Boolean).join('\n')); setEditSmall('') }
    else { setEditBig(s.big); setEditSmall(s.small) }
  }
  const curSlide = design?.slides[Math.min(cur, Math.max(0, total - 1))]
  const editing = design?.slides.find(s => s.n === editN) || null
  const single = !!editing && (editing.role === 'dialog' || editing.role === 'final')
  const dirty = !!editing && (single
    ? norm(editBig) !== norm([editing.big, editing.small].filter(Boolean).join('\n'))
    : norm(editBig) !== norm(editing.big) || norm(editSmall) !== norm(editing.small))

  // компьютер: правка справа всегда про открытый слайд. Смена цвета или стиля во время набора
  // не стирает несохраненный текст: поля перезаполняются, только если правки нет или слайд другой
  useEffect(() => {
    if (!focusOn || !curSlide) return
    if (editN === curSlide.n && dirty) return
    fillEdit(curSlide)
  }, [focusOn, curSlide?.n, design?.version]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (style: TemplateStyle) => {
    const d = await call(style, 'POST', { postId, style, text })
    if (d) { setAllStyles(false); setCur(0); setSaved(false); track.current?.scrollTo({ left: 0 }) }
  }
  const relayout = () => design && call('relayout', 'POST', { postId, style: design.style, text })
  const exported = (how: 'share' | 'zip' | 'single' | 'list') => {
    if (design) fetch('/api/carousel/design', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ designId: design.id, exported: how }) }).catch(() => {}) // только отметка, вид не меняет
  }

  const saveHandle = async () => {
    const h = handle.replace(/^@/, '').trim()
    if (design && h === design.handle) return
    await fetch('/api/carousel/design', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: h }) }).catch(() => {})
    if (design) setDesign({ ...design, handle: h })
    setBust(b => b + 1)
  }

  const saveColors = async (colors: Palette | null) => {
    if (!design) return
    const d = await call('colors', 'PATCH', { designId: design.id, colors })
    if (d) { setDraftPal(null); setSaved(false) }
  }
  // пипетка шлет изменения часто: сохраняем, когда рука остановилась
  const pickColor = (key: keyof Palette, value: string) => {
    // пока сохраняется правка текста, цвет не шлем: ответы могли бы прийти не по порядку
    if (!design || busy === 'edit' || busy === 'split') return
    const next = { ...(draftPal || design.palette), [key]: value }
    setDraftPal(next)
    if (colorTimer.current) clearTimeout(colorTimer.current)
    colorTimer.current = setTimeout(() => saveColors(next), 600)
  }
  const setOption = (o: Options) => { if (design) { setSaved(false); call('options', 'PATCH', { designId: design.id, options: o }) } }

  const saveEdit = async () => {
    if (!design || editN == null) return
    const d = await call('edit', 'PATCH', { designId: design.id, edit: { n: editN, big: editBig, small: editSmall } })
    if (d && !focusOn) setEditN(null)
  }
  const go = (i: number) => {
    if (!total) return
    const k = Math.max(0, Math.min(total - 1, i))
    if (focusOn) {
      // ушла на другой слайд с несохраненной правкой: сохраняем ее, чтобы не потерять
      if (dirty && busy !== 'edit') saveEdit()
      setCur(k)
      return
    }
    const el = track.current
    if (el) el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' })
  }
  const onScroll = () => {
    const el = track.current
    if (el) setCur(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
  }

  const startEdit = (s: Slide) => {
    if (editN === s.n) { setEditN(null); return }
    fillEdit(s)
    // карточка правки под листалкой: подводим к ней экран
    setTimeout(() => editRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }
  const split = async (n: number) => {
    if (!design) return
    const d = await call('split', 'PATCH', { designId: design.id, split: n })
    if (d && !focusOn) setEditN(null)
  }

  const upload = async (list: FileList | null, kind: 'photo' | 'avatar') => {
    if (!list || !list.length) return
    setBusy(kind); setError(null)
    try {
      for (const f of Array.from(list).slice(0, kind === 'avatar' ? 1 : 6)) {
        const blob = await shrink(f)
        const fd = new FormData()
        fd.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
        fd.append('kind', kind)
        const r = await fetch('/api/carousel/photos', { method: 'POST', body: fd })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Не получилось загрузить фото')
        setPhotos(d.photos || []); setAvatar(d.avatar || null)
      }
      setBust(b => b + 1)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
      if (avatarRef.current) avatarRef.current.value = ''
    }
  }

  const removePhoto = async (path: string) => {
    const r = await fetch(`/api/carousel/photos?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setPhotos(d.photos || []); setAvatar(d.avatar || null); setBust(b => b + 1) }
  }

  const copyCaption = () => {
    if (!caption) return
    navigator.clipboard.writeText(caption)
    trackEvent('material_take', { how: 'copy_caption', format: 'carousel', post: postId })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // «Сохранить в Фото»: файлы уже готовы, share вызываем сразу по нажатию (иначе айфон не откроет меню)
  const saveToPhotos = async () => {
    if (!files) return
    try {
      await navigator.share({ files })
      exported('share')
    } catch (e: any) {
      // закрыли меню: это не ошибка. Не вышло по-другому: показываем слайды списком
      if (e?.name !== 'AbortError') { setListMode(true); exported('list') }
    }
  }

  // «Сохранить оформление» в первый раз: короткая форма (ник, имя, строка о себе, фото), все можно пропустить
  const saveMine = async () => {
    if (!design) return
    setBusy('mine-save'); setError(null)
    try {
      const r = await fetch('/api/carousel/design', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handle.replace(/^@/, '').trim(), name: author.name, about: author.about }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Не получилось сохранить, нажми еще раз')
      if (d.author) setAuthor(d.author)
    } catch (e: any) { setError(e.message); setBusy(null); return }
    const d = await call('mine-save', 'PATCH', { designId: design.id, makeMine: true })
    if (d) { setSaveForm(false); setSaved(true); setBust(b => b + 1) }
  }
  // сохраненное оформление уже есть: новый вид этой карусели становится основным сразу
  const keepThis = async () => {
    if (!design) return
    const d = await call('keep', 'PATCH', { designId: design.id, makeMine: true })
    if (d) setSaved(true)
  }
  const onSaveLook = () => { if (mine) keepThis(); else setSaveForm(v => !v) }

  if (!loaded) return null
  if (parsed.slides.length < 2) return null

  const photoStyle = design && (design.style === 't_premium' || design.style === 't_skrapbuk')
  const opening = !design && (busy === 'mine' || (!!mine && !error))
  const hasList = !!design?.slides.some(s => s.role === 'list')
  const choosing = !!busy && TEMPLATE_STYLES.includes(busy as TemplateStyle)
  const canSave = !!design && (design.canSaveMine || canSaveMine)
  const zipHref = design ? `/api/carousel/zip?designId=${design.id}` : '#'
  const field = 'w-full px-3 py-2.5 rounded-xl border border-brand-border bg-white text-base text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent'
  const chip = (on: boolean) => `inline-flex items-center gap-2 px-3 min-h-11 rounded-full text-sm border cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${on ? 'border-brand-border-soft bg-brand-soft text-brand-text font-semibold' : 'border-brand-border bg-white text-brand-text hover:border-brand-muted'}`
  const outlineBtn = 'inline-flex items-center justify-center gap-2 rounded-xl border border-brand-text/70 bg-white text-brand-text font-semibold hover:bg-brand-bg cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'
  const accentBtn = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'

  // ---------- общие куски ----------

  // мини-обложка стиля на настоящем тексте этой карусели
  const styleThumb = (s: TemplateStyle) => {
    const active = design?.style === s
    return (
      <button key={s} type="button" disabled={!!busy} onClick={() => !active && choose(s)} aria-pressed={active}
        className="min-w-0 text-left cursor-pointer disabled:cursor-wait group focus-visible:outline-none">
        <span className={`relative block aspect-[3/4] rounded-xl overflow-hidden border-2 transition group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-brand-accent ${active ? 'border-brand-accent' : 'border-brand-border group-hover:border-brand-muted'}`}>
          <img src={previewUrl(s)} alt="" loading="lazy" className="w-full h-full object-cover bg-brand-bg" />
          {busy === s && <span className="absolute inset-0 bg-brand-bg/70 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-accent" /></span>}
        </span>
        <span className="mt-1.5 block text-center text-[14px] text-brand-text truncate">{STYLES[s].label}</span>
        <span className="sr-only">{STYLES[s].hint}</span>
      </button>
    )
  }
  const others = TEMPLATE_STYLES.filter(s => !shownSuggested.includes(s))
  const allStylesGrid = allStyles && (
    <div className="grid grid-cols-3 gap-x-2 gap-y-3 pt-2">
      {others.map(styleThumb)}
    </div>
  )

  // цвета: «как в стиле» и шесть палитр кружками; у Заметок вместо цветов светлый или темный фон
  const colorsRow = design && (design.style === 't_zametki' ? (design.tunable && (
    <div className="space-y-2">
      <p className="text-[14px] text-brand-muted">Фон</p>
      <div className="inline-flex rounded-full border border-brand-border bg-white p-1" role="group" aria-label="Фон">
        {([['light', 'Светлый'], ['dark', 'Темный']] as const).map(([k, label]) => {
          const on = (design.options.theme || 'light') === k
          return <button key={k} type="button" disabled={!!busy} aria-pressed={on} onClick={() => !on && setOption({ theme: k })}
            className={`h-10 px-4 rounded-full text-[15px] cursor-pointer disabled:opacity-50 ${on ? 'bg-brand-soft font-semibold text-brand-text' : 'text-brand-text'}`}>{label}</button>
        })}
      </div>
    </div>
  )) : (
    <div className="space-y-2">
      <p className="text-[14px] text-brand-muted">Цвета</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Цвета">
        <button type="button" disabled={!!busy} aria-pressed={!design.custom} onClick={() => design.custom && saveColors(null)} title="Как в стиле" aria-label="Цвета как в стиле"
          className="w-11 h-11 rounded-full inline-flex items-center justify-center cursor-pointer disabled:opacity-50">
          <span className={`w-9 h-9 rounded-full border-2 ${!design.custom ? 'border-brand-text' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.14)]'}`}
            style={{ background: `linear-gradient(135deg, ${STYLES[design.style].palette.bg} 50%, ${STYLES[design.style].palette.accent} 50%)` }} />
        </button>
        {QUICK_PALETTES.map(name => PALETTES.find(p => p.name === name)).filter(Boolean).map(p => {
          const pal = p!.p
          const on = design.custom && pal.bg.toLowerCase() === design.palette.bg.toLowerCase() && pal.accent.toLowerCase() === design.palette.accent.toLowerCase()
          return (
            <button key={p!.name} type="button" disabled={!!busy} aria-pressed={on} onClick={() => !on && saveColors(pal)} title={p!.name} aria-label={`Цвета: ${p!.name}`}
              className="w-11 h-11 rounded-full inline-flex items-center justify-center cursor-pointer disabled:opacity-50">
              <span className={`relative w-9 h-9 rounded-full border-2 ${on ? 'border-brand-text' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.14)]'}`} style={{ background: pal.bg }}>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ background: pal.accent }} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  ))

  // «Сохранить оформление»: следующие карусели откроются в этом виде
  const saveLook = canSave && design && (
    <div className="space-y-2">
      {design.isMine && !saved ? (
        <p className="text-[14px] text-brand-muted inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-brand-sage" aria-hidden="true" />Это сохраненное оформление</p>
      ) : saved ? (
        <p className="text-[14px] text-brand-text" role="status"><Check className="w-4 h-4 inline -mt-0.5 mr-1 text-brand-sage" aria-hidden="true" />Сохранено. Следующая карусель откроется в этом оформлении</p>
      ) : (
        <>
          <button type="button" onClick={onSaveLook} disabled={!!busy} aria-expanded={mine ? undefined : saveForm} className={`${outlineBtn} w-full h-11 text-[15px]`}>
            {busy === 'keep' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Сохранить оформление
          </button>
          <p className="text-[13px] text-brand-muted">Следующие карусели откроются в нем</p>
        </>
      )}
      {saveForm && !mine && (
        <div className="rounded-2xl border border-brand-border bg-white p-4 space-y-3">
          <p className="text-[14px] text-brand-text">Ник, имя и фото встанут на обложку и последний слайд. Все можно пропустить</p>
          <div className="space-y-1">
            <label htmlFor="my-handle" className="block text-sm font-medium text-brand-text">Ник в Instagram</label>
            <input id="my-handle" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@anna.psy" autoCapitalize="none" autoCorrect="off" className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="my-name" className="block text-sm font-medium text-brand-text">Как тебя подписать</label>
            <input id="my-name" value={author.name} onChange={e => setAuthor({ ...author, name: e.target.value })} placeholder="Анна Соколова" className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="my-about" className="block text-sm font-medium text-brand-text">Пара слов о себе</label>
            <textarea id="my-about" value={author.about} onChange={e => setAuthor({ ...author, about: e.target.value })} maxLength={90} rows={2} placeholder="Психолог, работаю с тревогой и отношениями" className={field + ' resize-none'} />
          </div>
          {avatarRow()}
          <div className="flex items-center gap-2">
            <button type="button" onClick={saveMine} disabled={busy === 'mine-save'} className={`${accentBtn} h-11 px-5 text-[15px]`}>
              {busy === 'mine-save' ? 'Сохраняется' : 'Сохранить оформление'}
            </button>
            <button type="button" onClick={() => setSaveForm(false)} className="h-11 px-3 text-[15px] text-brand-muted hover:text-brand-text cursor-pointer">Не сейчас</button>
          </div>
        </div>
      )}
    </div>
  )

  const settingsLink = (
    <p className="text-[13px] leading-5 text-brand-muted">
      Фото на обложку и ник: <Link href="/dashboard/settings#carousel" className="font-semibold text-brand-text hover:text-brand-accent">в настройках оформления</Link>
    </p>
  )

  function avatarRow(label = 'Твое фото') {
    return (
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-brand-soft border border-brand-border shrink-0">
          {avatar ? <img src={avatar.url} alt="" className="w-full h-full object-cover" />
            : <span className="w-full h-full flex items-center justify-center text-sm font-bold text-brand-text">{initialsOf(author.name)}</span>}
        </div>
        <div className="min-w-0">
          <button type="button" onClick={() => avatarRef.current?.click()} disabled={!!busy} className="min-h-11 text-sm font-semibold text-brand-accent cursor-pointer">
            {busy === 'avatar' ? 'Загрузка' : avatar ? 'Сменить фото' : label}
          </button>
          <p className="text-xs text-brand-muted">{avatar ? 'Оно на последнем слайде, рядом с именем' : 'Подойдет любое, где хорошо видно лицо. Пока вместо него инициалы'}</p>
        </div>
        <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files, 'avatar')} />
      </div>
    )
  }

  const photoStrip = (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-brand-text">
        {design?.style === 't_premium' || design?.options.coverPhoto ? 'Твое фото на обложку' : 'Фото из жизни'}
        <span className="font-normal text-brand-muted"> {design?.style === 't_premium' ? '(без фото обложка будет текстовой)' : '(2-3 штуки, лучше разные)'}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {photos.map(p => (
          <div key={p.path} className="relative w-16 h-20 rounded-lg overflow-hidden border border-brand-border">
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            <button type="button" aria-label="Убрать фото" onClick={() => removePhoto(p.path)} className="absolute top-0.5 right-0.5 p-1 rounded-full bg-white/90 text-brand-text cursor-pointer"><X className="w-3 h-3" /></button>
          </div>
        ))}
        {photos.length < 6 && (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} aria-label="Добавить фото"
            className="w-16 h-20 rounded-lg border border-dashed border-brand-border flex items-center justify-center text-brand-muted hover:border-brand-accent hover:text-brand-accent cursor-pointer disabled:opacity-50">
            {busy === 'photo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files, 'photo')} />
      <p className="text-xs text-brand-muted">Только твои фото, без клиентов. Видны только тебе.</p>
    </div>
  )

  // «Выделение»: как отмечено главное слово на всех слайдах
  const accentChoice = design?.tunable && (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-brand-text">Выделение</p>
      <div className="flex flex-wrap gap-2">
        {ACCENT_KINDS.map(([k, label]) => {
          const on = (design.options.accentKind || 'color') === k
          return <button key={k} type="button" disabled={!!busy} aria-pressed={on} onClick={() => !on && setOption({ accentKind: k })} className={chip(on)}>{label}</button>
        })}
      </div>
    </div>
  )

  // «Еще настройки»: все палитры и свои цвета, компоновка, шрифт, узор, рубрика, номера, фото, ник
  const moreSettings = design && (
    <div ref={tuneRef} className="border-t border-brand-border pt-2 scroll-mt-4">
      <button type="button" onClick={() => setTune(v => !v)} aria-expanded={tune} className="w-full flex items-center justify-between min-h-11 text-[15px] font-semibold text-brand-text cursor-pointer">
        Еще настройки <ChevronDown className={`w-4 h-4 transition ${tune ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {tune && (
        <div className="space-y-5 pt-3 pb-2">
          {design.style !== 't_zametki' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-brand-text">Все цвета</p>
              <div className="flex flex-wrap gap-1.5">
                {PALETTES.map(p => {
                  const on = design.custom && p.p.bg.toLowerCase() === design.palette.bg.toLowerCase() && p.p.accent.toLowerCase() === design.palette.accent.toLowerCase()
                  return (
                    <button key={p.name} type="button" title={p.name} aria-label={`Цвета: ${p.name}`} aria-pressed={on} disabled={!!busy} onClick={() => saveColors(p.p)}
                      className={`relative w-10 h-10 rounded-full border-2 cursor-pointer flex items-center justify-center text-[11px] font-bold ${on ? 'border-brand-text' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]'}`}
                      style={{ background: p.p.bg, color: p.p.text }}>
                      Aa
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: p.p.accent }} />
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-4">
                {([['bg', 'Фон'], ['text', 'Текст'], ['accent', 'Выделение']] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-brand-text-secondary cursor-pointer">
                    <input type="color" value={(draftPal || design.palette)[k]} onChange={e => pickColor(k, e.target.value)}
                      className="w-11 h-11 rounded-lg border border-brand-border bg-white p-0.5 cursor-pointer" />
                    {label}
                  </label>
                ))}
              </div>
              {note && <p className="text-xs text-brand-muted">{note}</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => { setSaved(false); call('variant', 'PATCH', { designId: design.id, variant: (design.variant + 1) % VARIANTS }) }} className={chip(false)}>
              {busy === 'variant' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />} Другая компоновка
            </button>
            {design.tunable && (
              <button type="button" disabled={!!busy} onClick={() => { setSaved(false); call('font', 'PATCH', { designId: design.id, fontPair: (design.fontPair + 1) % design.fontPairs.length }) }} className={chip(false)}>
                {busy === 'font' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} Другой шрифт: {design.fontPairs[(design.fontPair + 1) % design.fontPairs.length]}
              </button>
            )}
          </div>

          {/* Узор на фоне: одна лента идет через все слайды, при листании картинка продолжается */}
          {design.decorAllowed && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-brand-text">Узор</p>
              <div className="flex flex-wrap gap-2">
                {DECORS.map(({ id: k, label }) => (
                  <button key={k} type="button" disabled={!!busy} aria-pressed={design.decor === k} onClick={() => { if (k !== design.decor) { setSaved(false); call('decor', 'PATCH', { designId: design.id, decor: k }) } }} className={chip(design.decor === k)}>
                    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true" className="shrink-0">
                      <rect width="22" height="14" rx="3" fill={design.palette.bg} stroke="rgba(0,0,0,0.12)" />
                      {k === 'lenty' && <path d="M-1 4 Q 6 0 11 4 T 23 4" stroke={design.palette.accent} strokeOpacity="0.45" strokeWidth="3" fill="none" />}
                      {k === 'lenty' && <path d="M-1 11 Q 6 7 11 11 T 23 10" stroke={design.palette.accent} strokeOpacity="0.45" strokeWidth="2.5" fill="none" />}
                      {k === 'linii' && <path d="M-1 5 Q 6 1 11 6 T 23 4" stroke={design.palette.text} strokeOpacity="0.5" strokeWidth="0.8" fill="none" />}
                      {k === 'linii' && <path d="M-1 9 Q 7 13 12 8 T 23 10" stroke={design.palette.text} strokeOpacity="0.5" strokeWidth="0.8" fill="none" />}
                      {k === 'linii' && <path d="M-1 12 Q 8 8 13 12 T 23 11" stroke={design.palette.accent} strokeOpacity="0.45" strokeWidth="2.5" fill="none" />}
                      {k === 'zmeyki' && <path d="M3 -1 C 1 5 9 4 8 8 S 3 12 5 15 M14 -1 C 12 4 20 5 18 9 S 13 12 16 15" stroke={design.palette.accent} strokeOpacity="0.4" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
                      {k === 'kletka' && <path d="M5.5 0V14M11 0V14M16.5 0V14M0 3.5H22M0 7H22M0 10.5H22" stroke={design.palette.text} strokeOpacity="0.3" strokeWidth="0.5" />}
                      {k === 'dymka' && <circle cx="15" cy="6" r="6" fill={design.palette.text} fillOpacity="0.18" />}
                      {k === 'dymka' && <circle cx="6" cy="11" r="5" fill={design.palette.text} fillOpacity="0.12" />}
                    </svg>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* на компьютере «Выделение» стоит в правке слайда справа */}
          {!focusOn && accentChoice}

          {design.tunable && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="rubric" className="block text-sm font-semibold text-brand-text">Рубрика</label>
                <input id="rubric" value={rubric} onChange={e => setRubric(e.target.value.slice(0, 32))} onBlur={() => { if ((design.options.rubric || '') !== rubric.trim()) setOption({ rubric: rubric.trim() }) }}
                  placeholder="Разбор фразы" className={field} />
                <p className="text-xs text-brand-muted">Маленькая метка сверху на слайдах. Пусто, значит без нее</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {hasList && <button type="button" disabled={!!busy} aria-pressed={!!design.options.bigNumbers} onClick={() => setOption({ bigNumbers: !design.options.bigNumbers })} className={chip(!!design.options.bigNumbers)}>Крупные номера в списке</button>}
                {photos.length > 0 && <button type="button" disabled={!!busy} aria-pressed={!!design.options.coverPhoto} onClick={() => setOption({ coverPhoto: !design.options.coverPhoto })} className={chip(!!design.options.coverPhoto)}>Фото на обложку</button>}
              </div>
            </div>
          )}

          {(photoStyle || design.tunable) && photoStrip}
          {avatarRow('Добавить фото для последнего слайда')}

          <div className="space-y-1">
            <label htmlFor="handle" className="block text-sm font-semibold text-brand-text">Ник на слайдах</label>
            <input id="handle" value={handle} onChange={e => setHandle(e.target.value)} onBlur={saveHandle} placeholder="@anna.psy" autoCapitalize="none" autoCorrect="off" className={field} />
          </div>
        </div>
      )}
    </div>
  )

  const banners = (
    <>
      {error && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2" role="alert">
          <span>{error}</span>
          {!design && mine && <button type="button" onClick={() => { setError(null); autoMine.current = false; setMine(null) }} className="min-h-11 font-semibold text-brand-accent cursor-pointer">Выбрать стиль</button>}
        </div>
      )}
      {design && stale && (
        <div className="flex flex-wrap items-center gap-x-2 text-sm bg-brand-soft rounded-xl px-3 py-1">
          <span className="text-brand-text">Текст карусели поменялся.</span>
          <button type="button" disabled={!!busy} onClick={relayout} className="min-h-11 font-semibold text-brand-accent cursor-pointer">
            {busy === 'relayout' ? 'Слайды собираются' : 'Собрать слайды заново'}
          </button>
        </div>
      )}
      {design?.needsPhotos && <p className="text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2">Для этого стиля нужны 2-3 фото из жизни, без них слайды пустоваты. Добавить их можно в «Еще настройки».</p>}
    </>
  )

  const slideImg = (s: Slide, cls: string, eager: boolean) => (
    <>
      <img src={slideUrl(s.n)} alt={`Слайд ${s.n}`} loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setLoading(l => ({ ...l, [s.n]: false }))} onError={() => { setLoading(l => ({ ...l, [s.n]: false })); setBroken(b => ({ ...b, [s.n]: true })) }}
        className={cls} />
      {loading[s.n] && <span className="absolute inset-0 flex items-center justify-center bg-brand-bg/60"><Loader2 className="w-6 h-6 animate-spin text-brand-accent" /></span>}
      {broken[s.n] && (
        <span className="absolute inset-x-4 bottom-4 rounded-xl bg-white/95 px-3 py-2 text-sm text-brand-text">
          Слайд не перерисовался, так иногда бывает. <span role="button" tabIndex={0} className="font-semibold text-brand-accent" onClick={e => { e.stopPropagation(); setBust(b => b + 1) }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setBust(b => b + 1) } }}>Повторить</span>
        </span>
      )}
    </>
  )

  // Правка слайда: справа на компьютере, карточкой под листалкой на телефоне
  const editFields = editing && (
    <div className="space-y-3">
      {single ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-brand-text">{editing.role === 'dialog' ? 'Реплики' : 'Текст слайда'}</p>
          <VoiceTextarea value={editBig} onChange={setEditBig} minHeight={editing.role === 'dialog' ? 170 : 110} />
          <p className="text-xs text-brand-muted">{editing.role === 'dialog' ? 'Каждая реплика с новой строки. А: говорит клиентка, Б: ты' : 'Последняя фраза карусели. Твое имя, фото и ник встанут над ней сами'}</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <label htmlFor={`ed-big-${focusOn ? 'd' : 'm'}`} className="block text-sm font-medium text-brand-text">Заголовок слайда</label>
            <textarea id={`ed-big-${focusOn ? 'd' : 'm'}`} value={editBig} onChange={e => setEditBig(e.target.value)} rows={2} placeholder="Без заголовка" className={field + ' resize-y'} />
            <p className="text-xs text-brand-muted">Эту строку прочитают первой, пусть будет короткой</p>
          </div>
          <div className="space-y-1">
            <p className="block text-sm font-medium text-brand-text">Текст слайда</p>
            <VoiceTextarea value={editSmall} onChange={setEditSmall} minHeight={130} />
          </div>
        </>
      )}
    </div>
  )
  const splitBtn = (s: Slide, cls: string) => s.n !== 1 && s.n !== total && (
    <button type="button" disabled={!!busy} onClick={() => split(s.n)} className={cls}>
      {busy === 'split' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" aria-hidden="true" />} Разделить на два
    </button>
  )
  const readStatus = (s: Slide) => s.overflow ? (
    <p className="text-[14px] text-brand-text">Слайд длинноват: буквы мельче, чем на соседних. Сократи текст или раздели слайд на два</p>
  ) : (
    <p className="text-[14px] text-brand-muted inline-flex items-center gap-1.5"><Check className="w-4 h-4" aria-hidden="true" />Читается на телефоне</p>
  )

  // =====================================================================
  // Компьютер: режим фокуса
  // =====================================================================
  if (focusOn) {
    const back = () => { if (focus?.onBack) focus.onBack(); else setWantFocus(false) }
    return (
      <div className="fixed inset-y-0 right-0 left-[72px] z-30 flex flex-col bg-brand-bg" role="region" aria-label="Оформление карусели">
        {/* шапка */}
        <header className="h-16 shrink-0 flex items-center gap-4 px-6 bg-brand-card border-b border-brand-border">
          <button type="button" onClick={back} className="h-11 -ml-2 px-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-text rounded-xl hover:bg-brand-bg cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent">
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />Назад
          </button>
          <p className="min-w-0 flex-1 truncate text-[15px] text-brand-muted">{focus?.title || cover.split('\n')[0]}</p>
          {focus?.formats && focus.formats.length > 1 && (
            <div className="shrink-0 inline-flex rounded-full bg-brand-soft-2 p-1" role="tablist" aria-label="Форматы этой мысли">
              {focus.formats.map(f => {
                const on = f.id === (focus.activeFormat || 'carousel')
                return <button key={f.id} type="button" role="tab" aria-selected={on} onClick={() => !on && focus.onFormat?.(f.id)}
                  className={`h-9 px-4 rounded-full text-[15px] cursor-pointer ${on ? 'bg-brand-soft font-semibold text-brand-text' : 'text-brand-text hover:bg-brand-card'}`}>{f.label}</button>
              })}
            </div>
          )}
          {caption && (
            <button type="button" onClick={copyCaption} className={`${outlineBtn} h-11 px-4 text-[15px] shrink-0`}>
              {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}{copied ? 'Скопировано' : 'Скопировать описание'}
            </button>
          )}
          {design && (
            <a href={zipHref} onClick={() => exported('zip')} className={`${accentBtn} h-11 px-5 text-[15px] shrink-0`}>
              <Download className="w-4 h-4" aria-hidden="true" />Скачать все слайды
            </a>
          )}
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_328px]">
          {/* слева: оформление */}
          <aside className="min-h-0 overflow-y-auto overscroll-contain border-r border-brand-border px-5 py-6 space-y-5" aria-label="Оформление">
            <h2 className="text-[20px] leading-7 font-semibold text-brand-text">Оформление</h2>
            <div className="space-y-2">
              <p className="text-[14px] text-brand-muted">Подходят этому тексту</p>
              <div className="grid grid-cols-3 gap-2">{shownSuggested.map(styleThumb)}</div>
            </div>
            <div className="border-t border-brand-border pt-1">
              <button type="button" onClick={() => setAllStyles(v => !v)} aria-expanded={allStyles} className="w-full min-h-11 flex items-center justify-between text-[15px] text-brand-text cursor-pointer">
                Все стили ({TEMPLATE_STYLES.length}) <ChevronRight className={`w-4 h-4 transition ${allStyles ? 'rotate-90' : ''}`} aria-hidden="true" />
              </button>
              {allStylesGrid}
            </div>
            {choosing && <p className="text-sm text-brand-muted" role="status">Слайды собираются, это секунд десять</p>}
            {colorsRow}
            {design && settingsLink}
            {saveLook}
            {moreSettings}
          </aside>

          {/* центр: большой слайд и лента */}
          <section className="min-h-0 overflow-y-auto overscroll-contain px-6 py-6 flex flex-col items-center gap-4" aria-label="Слайды">
            <div className="w-full max-w-[640px] space-y-2">{banners}</div>
            {!design ? (
              <div className="flex-1 w-full flex flex-col items-center justify-center gap-3 text-center" role="status">
                <div className="h-[min(560px,calc(100dvh-260px))] aspect-[3/4] rounded-2xl bg-brand-card/70 border border-brand-border flex items-center justify-center px-8">
                  {opening || choosing
                    ? <span className="inline-flex items-center gap-2 text-brand-muted"><Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />Слайды собираются, это секунд десять</span>
                    : <span className="text-[16px] leading-6 text-brand-text">Выбери оформление слева, и слайды соберутся</span>}
                </div>
              </div>
            ) : grid ? (
              <div className="w-full max-w-[880px]">
                <div className="flex justify-end mb-3">
                  <button type="button" onClick={() => setGrid(false)} className={`${outlineBtn} h-11 px-4 text-[15px]`}>Листать слайды</button>
                </div>
                <ul className="grid grid-cols-4 gap-4">
                  {design.slides.map((s, i) => (
                    <li key={s.n}>
                      <button type="button" onClick={() => { go(i); setGrid(false) }} aria-label={`Открыть слайд ${s.n}`}
                        className="relative block w-full aspect-[3/4] rounded-xl overflow-hidden border-2 border-transparent hover:border-brand-muted cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent">
                        {slideImg(s, 'w-full h-full object-cover bg-white', i < 8)}
                      </button>
                      <p className="mt-1 text-center text-[13px] text-brand-muted tabular-nums">{s.n}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-5">
                  <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="Предыдущий слайд"
                    className="w-11 h-11 rounded-full bg-white border border-brand-border inline-flex items-center justify-center text-brand-text cursor-pointer disabled:opacity-30 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-brand-accent">
                    <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                  </button>
                  {curSlide && (
                    <button type="button" onClick={() => editRef.current?.querySelector('textarea')?.focus()} aria-label={`Слайд ${curSlide.n} из ${total}. Нажми, чтобы поправить текст справа`}
                      className="relative h-[min(560px,calc(100dvh-260px))] aspect-[3/4] rounded-2xl overflow-hidden bg-white shadow-[0_2px_14px_rgba(59,42,34,0.10)] cursor-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
                      {slideImg(curSlide, 'w-full h-full object-contain', true)}
                    </button>
                  )}
                  <button type="button" onClick={() => go(cur + 1)} disabled={cur >= total - 1} aria-label="Следующий слайд"
                    className="w-11 h-11 rounded-full bg-white border border-brand-border inline-flex items-center justify-center text-brand-text cursor-pointer disabled:opacity-30 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-brand-accent">
                    <ChevronRight className="w-5 h-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="w-full max-w-[760px] flex items-start gap-4">
                  <ol className="min-w-0 flex-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Все слайды">
                    {design.slides.map((s, i) => (
                      <li key={s.n} className="shrink-0">
                        <button type="button" onClick={() => go(i)} aria-label={`Слайд ${s.n}`} aria-current={i === cur ? 'true' : undefined}
                          className={`block w-[64px] aspect-[3/4] rounded-lg overflow-hidden border-2 bg-white cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-accent ${i === cur ? 'border-brand-lilac' : 'border-brand-border hover:border-brand-muted'}`}>
                          <img src={slideUrl(s.n)} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </button>
                        <span className={`mt-1 block text-center text-[13px] tabular-nums ${i === cur ? 'text-brand-text font-semibold' : 'text-brand-muted'}`}>{s.n}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="shrink-0 flex flex-col gap-1 pt-3">
                    <button type="button" onClick={() => setGrid(true)} className="min-h-11 px-2 inline-flex items-center gap-2 text-[15px] text-brand-text rounded-xl hover:bg-brand-card cursor-pointer">
                      <LayoutGrid className="w-4 h-4" aria-hidden="true" />Все слайды рядом
                    </button>
                    {curSlide && (
                      <a href={slideUrl(curSlide.n, true)} onClick={() => exported('single')} className="min-h-11 px-2 inline-flex items-center gap-2 text-[15px] text-brand-text rounded-xl hover:bg-brand-card">
                        <ImageDown className="w-4 h-4" aria-hidden="true" />Скачать этот слайд
                      </a>
                    )}
                  </div>
                </div>
                <p className="text-[13px] text-brand-muted text-center max-w-[520px]">В Instagram нажми «+», выбери «Публикация» и отметь слайды по порядку, начиная с первого</p>
              </>
            )}
          </section>

          {/* справа: правка открытого слайда */}
          <aside className="min-h-0 overflow-y-auto overscroll-contain bg-brand-card border-l border-brand-border px-5 py-6" aria-label="Правка слайда">
            {design && curSlide && editing ? (
              <div ref={editRef} className="space-y-4">
                <h2 className="text-[20px] leading-7 font-semibold text-brand-text tabular-nums">Слайд {curSlide.n} из {total}</h2>
                {editFields}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={saveEdit} disabled={busy === 'edit' || !dirty || (!editBig.trim() && !editSmall.trim())} className={`${accentBtn} h-11 px-3 text-[15px]`}>
                    {busy === 'edit' ? 'Сохраняется' : dirty ? 'Сохранить слайд' : 'Сохранено'}
                  </button>
                  {splitBtn(curSlide, `${outlineBtn} h-11 px-3 text-[15px]`)}
                </div>
                {accentChoice}
                {readStatus(curSlide)}
              </div>
            ) : (
              <p className="text-[15px] leading-6 text-brand-muted">Тут будет правка слайда: заголовок, текст и выделение</p>
            )}
          </aside>
        </div>
      </div>
    )
  }

  // =====================================================================
  // Телефон (и компьютер, если вышли из фокуса)
  // =====================================================================
  const primarySave = design && (share && !listMode ? (
    <button type="button" onClick={saveToPhotos} disabled={!files} className={`${accentBtn} flex-1 min-w-0 h-12 rounded-2xl text-[15px]`}>
      {files ? <ImageDown className="w-5 h-5 shrink-0" aria-hidden="true" /> : <Loader2 className="w-5 h-5 animate-spin shrink-0" aria-hidden="true" />}
      <span className="truncate">{files ? 'Сохранить в Фото' : 'Слайды готовятся'}</span>
    </button>
  ) : isTouch() && !listMode ? (
    <button type="button" onClick={() => { setListMode(true); exported('list') }} className={`${accentBtn} flex-1 min-w-0 h-12 rounded-2xl text-[15px]`}>
      <ImageDown className="w-5 h-5 shrink-0" aria-hidden="true" /><span className="truncate">Сохранить в Фото</span>
    </button>
  ) : (
    <a href={zipHref} onClick={() => exported('zip')} className={`${accentBtn} flex-1 min-w-0 h-12 rounded-2xl text-[15px]`}>
      <Download className="w-5 h-5 shrink-0" aria-hidden="true" /><span className="truncate">Скачать все слайды</span>
    </a>
  ))

  const actionBar = design && !listMode && editN == null && (
    <div className={mobileBar === 'fixed'
      ? 'fixed inset-x-0 z-30 bottom-[calc(56px+env(safe-area-inset-bottom))] lg:bottom-0 bg-brand-card border-t border-brand-border px-4 py-2'
      : ''}>
      <div className="flex items-center gap-2 max-w-[560px] mx-auto">
        {primarySave}
        {caption && (
          <button type="button" onClick={copyCaption} className={`${outlineBtn} h-12 px-4 rounded-2xl text-[15px] shrink-0`}>
            {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : null}{copied ? 'Скопировано' : 'Описание'}
          </button>
        )}
        <button type="button" onClick={() => setMoreOpen(true)} aria-label="Еще действия со слайдами" className={`${outlineBtn} w-12 h-12 rounded-2xl shrink-0`}>
          <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )

  return (
    <div className={`bg-white rounded-2xl border border-brand-border p-4 sm:p-6 space-y-4 mt-4 ${mobileBar === 'fixed' ? 'mb-20' : ''}`}>
      {desk && (
        <div className="flex justify-end">
          <button type="button" onClick={() => { setWantFocus(true); trackEvent('feature_open', { feature: 'carousel_design' }) }} className={`${outlineBtn} h-11 px-4 text-[15px]`}>
            <Maximize2 className="w-4 h-4" aria-hidden="true" />Оформить на весь экран
          </button>
        </div>
      )}

      {/* Открываем в сохраненном оформлении: тот же срок, что и сборка в стиль */}
      {opening && (
        <div className="space-y-2" role="status">
          <div className="aspect-[4/5] w-full max-w-sm mx-auto rounded-2xl bg-brand-bg animate-pulse" />
          <p className="text-sm text-brand-muted text-center">Слайды собираются, это секунд десять</p>
        </div>
      )}

      {banners}

      {design && (
        <>
          {/* Листалка как в ленте: рамка 4:5, слайд 3:4 внутри целиком. Тап по слайду открывает правку под ним */}
          <div className={`relative max-w-md mx-auto ${listMode ? 'hidden' : ''}`}>
            <div ref={track} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl bg-brand-bg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Слайды карусели">
              {design.slides.map(s => (
                <button key={s.n} type="button" onClick={() => startEdit(s)} aria-label={`Слайд ${s.n} из ${total}, нажми, чтобы поправить текст`}
                  className="relative snap-center shrink-0 w-full aspect-[4/5] flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:-outline-offset-2">
                  {slideImg(s, 'h-full w-auto max-w-full object-contain shadow-[0_2px_10px_rgba(59,42,34,0.12)]', s.n <= 2)}
                </button>
              ))}
            </div>
            {cur > 0 && <button type="button" onClick={() => go(cur - 1)} aria-label="Предыдущий слайд" className="hidden sm:flex absolute left-2 top-[45%] -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 border border-brand-border items-center justify-center text-brand-text cursor-pointer"><ChevronLeft className="w-5 h-5" /></button>}
            {cur < total - 1 && <button type="button" onClick={() => go(cur + 1)} aria-label="Следующий слайд" className="hidden sm:flex absolute right-2 top-[45%] -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 border border-brand-border items-center justify-center text-brand-text cursor-pointer"><ChevronRight className="w-5 h-5" /></button>}
            <div className="flex justify-center gap-1.5 mt-3" aria-hidden="true">
              {design.slides.map((s, i) => <span key={s.n} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all cursor-pointer ${i === cur ? 'w-5 bg-brand-text' : 'w-1.5 bg-brand-border'}`} />)}
            </div>
            <p className="mt-2 text-center text-[14px] text-brand-muted tabular-nums">Слайд {cur + 1} из {total}{editN == null ? ' · нажми на текст, чтобы поправить' : ''}</p>
          </div>

          {/* Длинный слайд: мельче соседей. Делим без модели, по границе фразы */}
          {curSlide?.overflow && editN == null && !listMode && (
            <div className="flex flex-wrap items-center gap-x-2 text-sm bg-brand-soft rounded-xl px-3 py-1">
              <span className="text-brand-text">Слайд длинноват, буквы вышли мельче, чем на соседних</span>
              {splitBtn(curSlide, 'min-h-11 inline-flex items-center gap-1 font-semibold text-brand-accent cursor-pointer')}
            </div>
          )}

          {editing && !listMode && (
            <div ref={editRef} className="rounded-2xl border border-brand-border bg-brand-bg/50 p-4 space-y-3 scroll-mb-4">
              <p className="font-semibold text-brand-text">Слайд {editing.n} из {total}</p>
              {editFields}
              {editing.overflow && splitBtn(editing, 'min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-brand-accent cursor-pointer')}
              <div className="flex items-center gap-3">
                <button type="button" disabled={busy === 'edit' || (!editBig.trim() && !editSmall.trim())} onClick={saveEdit} className={`${accentBtn} h-11 px-5 text-sm`}>
                  {busy === 'edit' ? 'Сохраняется' : 'Готово'}
                </button>
                <button type="button" onClick={() => setEditN(null)} className="px-2 h-11 text-sm text-brand-muted hover:text-brand-text cursor-pointer">Отмена</button>
              </div>
            </div>
          )}

          {/* Телефон без share: слайды списком, зажать и сохранить */}
          {listMode && (
            <div className="space-y-3">
              <div className="text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2">
                <p>Зажми слайд пальцем, и телефон предложит его сохранить. Сохраняй по порядку, с первого.</p>
                <button type="button" onClick={() => setListMode(false)} className="min-h-11 font-semibold text-brand-accent cursor-pointer">Листать слайды</button>
              </div>
              {design.slides.map(s => (
                <img key={s.n} src={slideUrl(s.n)} alt={`Слайд ${s.n}`} className="w-full rounded-xl border border-brand-border" />
              ))}
            </div>
          )}

          {mobileBar === 'inline' && actionBar}
        </>
      )}

      {/* Оформление: три стиля под текст, все стили, цвета */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[18px] font-semibold text-brand-text">Оформление</h3>
          <button type="button" onClick={() => setAllStyles(v => !v)} aria-expanded={allStyles} className="min-h-11 px-1 text-[15px] font-semibold text-brand-accent cursor-pointer">
            {allStyles ? 'Свернуть' : 'Все стили'}
          </button>
        </div>
        {!design && !opening && <p className="text-[14px] text-brand-muted -mt-2">Подходят этому тексту. Потом можно поменять</p>}
        <div className="grid grid-cols-3 gap-3 max-w-md">{shownSuggested.map(styleThumb)}</div>
        {allStylesGrid && <div className="max-w-md">{allStylesGrid}</div>}
        {choosing && <p className="text-sm text-brand-muted" role="status">Слайды собираются, это секунд десять</p>}
        {colorsRow}
        {design && settingsLink}
        {saveLook}
        {design && caption && <p className="text-xs text-brand-muted">В Instagram нажми «+», выбери «Публикация» и отметь слайды по порядку, начиная с первого</p>}
        {moreSettings}
      </div>

      {mobileBar === 'fixed' && actionBar}

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Еще">
        {design && (
          <div className="pt-1">
            {(share || isTouch()) && (
              <a href={zipHref} onClick={() => { exported('zip'); setMoreOpen(false) }} className="w-full h-[52px] flex items-center text-[16px] text-brand-text">Скачать все слайды архивом</a>
            )}
            {isTouch() && !listMode && (
              <button type="button" onClick={() => { setListMode(true); exported('list'); setMoreOpen(false) }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Сохранить слайды по одному</button>
            )}
            {curSlide && (
              <a href={slideUrl(curSlide.n, true)} onClick={() => { exported('single'); setMoreOpen(false) }} className="w-full h-[52px] flex items-center text-[16px] text-brand-text">Скачать этот слайд ({pad2(curSlide.n)}.png)</a>
            )}
            <button type="button" disabled={!!busy} onClick={() => { relayout(); setMoreOpen(false) }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-40">Собрать слайды заново</button>
            <button type="button" onClick={() => { setTune(true); setMoreOpen(false); setTimeout(() => tuneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Еще настройки</button>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
