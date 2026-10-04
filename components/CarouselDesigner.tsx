'use client'

// «Как оформить» под текстом карусели на экране «Сделать» (07-KARUSELI-TZ.md, задача karuseli-dvizhok, разделы 3 и 6).
// Первая карусель: три стиля под тон текста на настоящей обложке, ниже все 14. Дальше карусель сразу открывается
// в «моем оформлении». Слайды листаются как в ленте (рамка 4:5), тап по слайду открывает правку под ним.
// Сохранение: на телефоне «Сохранить в Фото» (share с файлами), на компьютере архив и по одному.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Check, Copy, Download, X, Plus, Shuffle, ChevronDown, ChevronLeft, ChevronRight, Scissors, Type, ImageDown } from 'lucide-react'
import { parseCarouselText } from '@/lib/carousel/parse'
import { shrink } from '@/lib/image-shrink'
import VoiceTextarea from '@/components/VoiceTextarea'
import { STYLES, TEMPLATE_STYLES, PALETTES, VARIANTS, DECORS, type Decor, type TemplateStyle, type Palette } from '@/lib/carousel/styles'

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
  isMine: boolean       // вид совпадает с «моим оформлением»
  hasMine: boolean
  canSaveMine: boolean  // «мое оформление» можно сохранить (миграция применена)
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

const norm = (t: string) => t.replace(/\s+/g, ' ').trim()
const pad2 = (n: number) => String(n).padStart(2, '0')
const DISMISS_KEY = 'psycont_carousel_mine_later'

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

export default function CarouselDesigner({ postId, text, onTextChange }: { postId: string; text: string; onTextChange: (t: string) => void }) {
  const [design, setDesign] = useState<DesignView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // что сейчас делаем, для подписи на кнопке
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [handle, setHandle] = useState('')
  const [author, setAuthor] = useState<Author>({ name: '', about: '', nameSet: false, aboutSet: false })
  const [suggested, setSuggested] = useState<TemplateStyle[]>(['t_redakciya', 't_stikery', 't_zametki'])
  const [mine, setMine] = useState<{ style: TemplateStyle } | null>(null)
  const [canSaveMine, setCanSaveMine] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [avatar, setAvatar] = useState<Photo | null>(null)
  const [bust, setBust] = useState(0) // перерисовать картинки после смены фото или ника
  const [cur, setCur] = useState(0)   // какой слайд сейчас в рамке
  const [loading, setLoading] = useState<Record<number, boolean>>({}) // слайд перерисовывается
  const [broken, setBroken] = useState<Record<number, boolean>>({})
  const [editN, setEditN] = useState<number | null>(null)
  const [editBig, setEditBig] = useState('')
  const [editSmall, setEditSmall] = useState('')
  const [copied, setCopied] = useState(false)
  const [draftPal, setDraftPal] = useState<Palette | null>(null) // свои цвета, пока крутит пипетку
  const [picker, setPicker] = useState(false)   // выбор стиля открыт (у готовой карусели свернут)
  const [allStyles, setAllStyles] = useState(false)
  const [tune, setTune] = useState(false)       // «Настроить вид точнее»
  const [offer, setOffer] = useState<'line' | 'form' | 'done' | 'hidden'>('hidden')
  const [madeMine, setMadeMine] = useState(false)
  const [share, setShare] = useState(false)
  const [files, setFiles] = useState<File[] | null>(null) // слайды заранее, чтобы share сработал сразу по нажатию
  const [listMode, setListMode] = useState(false)
  const [rubric, setRubric] = useState('')
  const [brandV, setBrandV] = useState('') // версия ника, имени и фото: входит в адрес превью
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const autoMine = useRef(false)
  const editRef = useRef<HTMLDivElement>(null)

  const parsed = useMemo(() => parseCarouselText(text), [text])
  const cover = parsed.slides[0] || ''
  const stale = !!design && norm(design.sourceText) !== norm(text)
  const caption = design?.caption || parsed.caption

  const call = useCallback(async (label: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setBusy(label); setError(null); setNote(null)
    try {
      const r = await fetch('/api/carousel/design', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Не получилось сохранить, твои правки на месте. Нажми еще раз')
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

  // «Мое оформление» есть, а у этой карусели оформления еще нет: сразу открываем в нем, без выбора стиля
  useEffect(() => {
    if (!loaded || design || !mine || autoMine.current || parsed.slides.length < 2) return
    autoMine.current = true
    call('mine', 'POST', { postId, useMine: true, text })
  }, [loaded, design, mine, parsed.slides.length, call, postId, text])

  // предложение «Оставить этот вид?»: только пока своего оформления нет, и если не отложила
  useEffect(() => {
    if (!design || mine || !canSaveMine || offer !== 'hidden') return
    let later = false
    try { later = localStorage.getItem(DISMISS_KEY) === '1' } catch { /* без памяти покажем */ }
    if (!later) setOffer('line')
  }, [design, mine, canSaveMine, offer])

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

  const choose = async (style: TemplateStyle) => {
    const d = await call(style, 'POST', { postId, style, text })
    if (d) { setPicker(false); setAllStyles(false); setCur(0); track.current?.scrollTo({ left: 0 }) }
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
    if (d) setDraftPal(null)
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
  const setOption = (o: Options) => design && call('options', 'PATCH', { designId: design.id, options: o })

  const go = (i: number) => {
    const el = track.current
    if (!el || !total) return
    const k = Math.max(0, Math.min(total - 1, i))
    el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' })
  }
  const onScroll = () => {
    const el = track.current
    if (el) setCur(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
  }

  const startEdit = (s: Slide) => {
    if (editN === s.n) { setEditN(null); return }
    setEditN(s.n)
    // у диалога и финала одно поле: реплики построчно, финал одной фразой
    if (s.role === 'dialog' || s.role === 'final') { setEditBig([s.big, s.small].filter(Boolean).join('\n')); setEditSmall('') }
    else { setEditBig(s.big); setEditSmall(s.small) }
    // карточка правки под листалкой: подводим к ней экран
    setTimeout(() => editRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }
  const saveEdit = async () => {
    if (!design || editN == null) return
    const d = await call('edit', 'PATCH', { designId: design.id, edit: { n: editN, big: editBig, small: editSmall } })
    if (d) setEditN(null)
  }
  const split = async (n: number) => {
    if (!design) return
    const d = await call('split', 'PATCH', { designId: design.id, split: n })
    if (d) setEditN(null)
  }

  const upload = async (files: FileList | null, kind: 'photo' | 'avatar') => {
    if (!files || !files.length) return
    setBusy(kind); setError(null)
    try {
      for (const f of Array.from(files).slice(0, kind === 'avatar' ? 1 : 6)) {
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
      // закрыла меню: это не ошибка. Не вышло по-другому: показываем слайды списком
      if (e?.name !== 'AbortError') { setListMode(true); exported('list') }
    }
  }

  // Короткая форма «моего оформления»: ник, имя, строка о себе, фото. Все можно пропустить.
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
    if (d) { setOffer('done'); setBust(b => b + 1) }
  }
  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ок */ }
    setOffer('hidden'); setCanSaveMine(false)
  }
  const keepThis = async () => {
    if (!design) return
    const d = await call('keep', 'PATCH', { designId: design.id, makeMine: true })
    if (d) setMadeMine(true)
  }

  if (!loaded) return null
  if (parsed.slides.length < 2) return null

  const photoStyle = design && (design.style === 't_premium' || design.style === 't_skrapbuk')
  const opening = !design && (busy === 'mine' || (!!mine && !error))
  const curSlide = design?.slides[Math.min(cur, total - 1)]
  const editing = design?.slides.find(s => s.n === editN) || null
  const hasList = !!design?.slides.some(s => s.role === 'list')

  // карточка стиля с настоящей обложкой этой карусели
  const styleCard = (s: TemplateStyle, wide = false) => {
    const active = design?.style === s
    return (
      <button key={s} type="button" disabled={!!busy} onClick={() => (active ? setPicker(false) : choose(s))} aria-pressed={active}
        className={`${wide ? 'w-[46%] sm:w-auto shrink-0 snap-start' : ''} text-left rounded-2xl border-2 overflow-hidden transition cursor-pointer disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:outline-offset-2 ${active ? 'border-brand-accent' : 'border-transparent hover:border-brand-border'}`}>
        <div className="relative aspect-[3/4] bg-brand-bg">
          <img src={previewUrl(s)} alt={`Обложка в стиле ${STYLES[s].label}`} loading="lazy" className="w-full h-full object-cover" />
          {busy === s && <div className="absolute inset-0 bg-brand-bg/70 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-accent" /></div>}
        </div>
        <div className="px-2 py-2">
          <p className="text-sm font-semibold text-brand-text">{STYLES[s].label}</p>
          <p className="text-xs leading-snug text-brand-muted">{STYLES[s].hint}</p>
        </div>
      </button>
    )
  }

  const stylePicker = (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-brand-text">Под этот текст подойдут</p>
        <p className="text-sm text-brand-muted">Подобрала по настроению текста. Бери любой, потом можно поменять.</p>
      </div>
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-3 gap-3 overflow-x-auto snap-x snap-mandatory pb-1">
        {suggested.map(s => styleCard(s, true))}
      </div>
      <button type="button" onClick={() => setAllStyles(v => !v)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-accent hover:underline cursor-pointer">
        {allStyles ? 'Свернуть' : `Показать все ${TEMPLATE_STYLES.length}`} <ChevronDown className={`w-4 h-4 transition ${allStyles ? 'rotate-180' : ''}`} />
      </button>
      {allStyles && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TEMPLATE_STYLES.filter(s => !suggested.includes(s)).map(s => styleCard(s))}
        </div>
      )}
      {busy && TEMPLATE_STYLES.includes(busy as TemplateStyle) && <p className="text-sm text-brand-muted" role="status">Раскладываю текст по слайдам, это секунд десять</p>}
    </div>
  )

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
      <p className="text-xs text-brand-muted">Только твои фото, без клиентов. Видишь их только ты.</p>
    </div>
  )

  const avatarRow = (label = 'Твое фото') => (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-full overflow-hidden bg-brand-soft border border-brand-border shrink-0">
        {avatar ? <img src={avatar.url} alt="" className="w-full h-full object-cover" />
          : <span className="w-full h-full flex items-center justify-center text-sm font-bold text-brand-text">{initialsOf(author.name)}</span>}
      </div>
      <div className="min-w-0">
        <button type="button" onClick={() => avatarRef.current?.click()} disabled={!!busy} className="text-sm font-semibold text-brand-accent hover:underline cursor-pointer">
          {busy === 'avatar' ? 'Загружаю' : avatar ? 'Сменить фото' : label}
        </button>
        <p className="text-xs text-brand-muted">{avatar ? 'Оно на последнем слайде, рядом с именем' : 'Подойдет любое, где хорошо видно лицо. Пока вместо него инициалы'}</p>
      </div>
      <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files, 'avatar')} />
    </div>
  )

  const field = 'w-full px-3 py-2.5 rounded-xl border border-brand-border bg-white text-base sm:text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent'
  const chip = (on: boolean) => `inline-flex items-center gap-2 px-3 h-10 rounded-full text-sm border cursor-pointer disabled:opacity-50 ${on ? 'border-brand-text text-brand-text bg-white' : 'border-brand-border text-brand-text-secondary hover:border-brand-accent'}`

  return (
    <div className="bg-white rounded-2xl border border-brand-border p-4 sm:p-6 space-y-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="font-bold text-brand-text">Как оформить</h3>
        {design && (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-brand-muted truncate">{design.isMine ? 'Твое оформление' : STYLES[design.style].label}</span>
            <button type="button" onClick={() => setPicker(v => !v)} aria-expanded={picker}
              className="shrink-0 inline-flex items-center gap-0.5 h-9 font-semibold text-brand-accent hover:underline cursor-pointer">
              Другой стиль <ChevronDown className={`w-4 h-4 transition ${picker ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Открываем в «моем оформлении»: тот же срок, что и раскладка в стиль */}
      {opening && (
        <div className="space-y-2" role="status">
          <div className="aspect-[4/5] w-full max-w-sm mx-auto rounded-2xl bg-brand-bg animate-pulse" />
          <p className="text-sm text-brand-muted text-center">Раскладываю текст по слайдам, это секунд десять</p>
        </div>
      )}

      {((!design && !opening) || picker) && stylePicker}

      {error && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2" role="alert">
          <span>{error}</span>
          {!design && mine && <button type="button" onClick={() => { setError(null); autoMine.current = false; setMine(null) }} className="font-semibold text-brand-accent hover:underline cursor-pointer">Выбрать стиль</button>}
        </div>
      )}

      {design && (
        <div className="space-y-4">
          {stale && (
            <div className="flex flex-wrap items-center gap-2 text-sm bg-brand-soft rounded-xl px-3 py-2">
              <span className="text-brand-text">Текст карусели поменялся.</span>
              <button type="button" disabled={!!busy} onClick={relayout} className="font-semibold text-brand-accent hover:underline cursor-pointer">
                {busy === 'relayout' ? 'Раскладываю' : 'Разложить заново'}
              </button>
            </div>
          )}

          {design.needsPhotos && <p className="text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2">Для этого стиля загрузи 2-3 фото из жизни, без них слайды пустоваты.</p>}

          {/* Листалка как в ленте: рамка 4:5, слайд 3:4 внутри целиком. Тап по слайду открывает правку под ним */}
          <div className={`relative max-w-md mx-auto ${listMode ? 'hidden' : ''}`}>
            <div ref={track} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl bg-brand-bg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Слайды карусели">
              {design.slides.map(s => (
                <button key={s.n} type="button" onClick={() => startEdit(s)} aria-label={`Слайд ${s.n} из ${total}, нажми, чтобы поправить текст`}
                  className="relative snap-center shrink-0 w-full aspect-[4/5] flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:-outline-offset-2">
                  <img src={slideUrl(s.n)} alt={`Слайд ${s.n}`} loading={s.n <= 2 ? 'eager' : 'lazy'}
                    onLoad={() => setLoading(l => ({ ...l, [s.n]: false }))} onError={() => { setLoading(l => ({ ...l, [s.n]: false })); setBroken(b => ({ ...b, [s.n]: true })) }}
                    className="h-full w-auto max-w-full object-contain shadow-[0_2px_10px_rgba(59,42,34,0.12)]" />
                  {loading[s.n] && <span className="absolute inset-0 flex items-center justify-center bg-brand-bg/60"><Loader2 className="w-6 h-6 animate-spin text-brand-accent" /></span>}
                  {broken[s.n] && (
                    <span className="absolute inset-x-6 bottom-6 rounded-xl bg-white/95 px-3 py-2 text-sm text-brand-text">
                      Слайд не перерисовался, так иногда бывает. <span className="font-semibold text-brand-accent" onClick={e => { e.stopPropagation(); setBust(b => b + 1) }}>Повторить</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
            {cur > 0 && <button type="button" onClick={() => go(cur - 1)} aria-label="Предыдущий слайд" className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow items-center justify-center text-brand-text cursor-pointer"><ChevronLeft className="w-5 h-5" /></button>}
            {cur < total - 1 && <button type="button" onClick={() => go(cur + 1)} aria-label="Следующий слайд" className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow items-center justify-center text-brand-text cursor-pointer"><ChevronRight className="w-5 h-5" /></button>}
            <div className="flex items-center justify-between mt-2">
              <div className="flex gap-1.5" aria-hidden="true">
                {design.slides.map((s, i) => <span key={s.n} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all cursor-pointer ${i === cur ? 'w-4 bg-brand-accent' : 'w-1.5 bg-brand-border'}`} />)}
              </div>
              <span className="text-xs text-brand-muted tabular-nums">{cur + 1} из {total}</span>
            </div>
          </div>

          {/* Длинный слайд в рамке: мельче соседей. Делим без модели, по границе фразы */}
          {curSlide?.overflow && editN == null && !listMode && (
            <div className="flex flex-wrap items-center gap-2 text-sm bg-brand-soft rounded-xl px-3 py-2">
              <span className="text-brand-text">Текста много, буквы вышли мельче, чем на соседних слайдах</span>
              {curSlide.n !== 1 && curSlide.n !== total && (
                <button type="button" disabled={!!busy} onClick={() => split(curSlide.n)} className="inline-flex items-center gap-1 font-semibold text-brand-accent hover:underline cursor-pointer">
                  {busy === 'split' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />} Разделить на два
                </button>
              )}
            </div>
          )}
          {editN == null && !listMode && <p className="text-xs text-brand-muted text-center -mt-2">Нажми на слайд, чтобы поправить текст</p>}

          {editing && (
            <div ref={editRef} className="rounded-2xl border border-brand-border bg-brand-bg/50 p-4 space-y-3 scroll-mb-4">
              <p className="font-semibold text-brand-text">Слайд {editing.n}</p>
              {editing.role === 'dialog' || editing.role === 'final' ? (
                <div className="space-y-1">
                  <VoiceTextarea value={editBig} onChange={setEditBig} minHeight={editing.role === 'dialog' ? 170 : 110} />
                  <p className="text-xs text-brand-muted">{editing.role === 'dialog' ? 'Каждая реплика с новой строки. А: говорит клиентка, Б: ты' : 'Последняя фраза карусели. Твое имя, фото и ник встанут над ней сами'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label htmlFor="ed-big" className="block text-sm font-medium text-brand-text">Крупно</label>
                    <textarea id="ed-big" value={editBig} onChange={e => setEditBig(e.target.value)} rows={2} className={field + ' resize-y'} />
                    <p className="text-xs text-brand-muted">Эту строку прочитают первой, пусть будет короткой</p>
                  </div>
                  <div className="space-y-1">
                    <p className="block text-sm font-medium text-brand-text">Мелко</p>
                    <VoiceTextarea value={editSmall} onChange={setEditSmall} minHeight={130} />
                    <p className="text-xs text-brand-muted">Все остальное, что хочешь сказать на слайде</p>
                  </div>
                </>
              )}
              {editing.overflow && editing.n !== 1 && editing.n !== total && (
                <button type="button" disabled={!!busy} onClick={() => split(editing.n)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-accent hover:underline cursor-pointer">
                  <Scissors className="w-4 h-4" /> Разделить на два
                </button>
              )}
              <div className="flex items-center gap-3">
                <button type="button" disabled={busy === 'edit' || (!editBig.trim() && !editSmall.trim())} onClick={saveEdit} className="px-5 h-11 rounded-xl text-sm font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-50 cursor-pointer">
                  {busy === 'edit' ? 'Сохраняю' : 'Готово'}
                </button>
                <button type="button" onClick={() => setEditN(null)} className="px-2 h-11 text-sm text-brand-muted hover:text-brand-text cursor-pointer">Отмена</button>
              </div>
            </div>
          )}

          {/* Сохранить: главное действие. На телефоне липнет к низу, пока карусель на экране */}
          {/* пока идет правка, кнопку сохранения прячем: рядом «Готово», легко нажать не ту, а на мобилке она закрывает поле */}
          <div className={`sticky bottom-3 z-30 sm:static space-y-2 ${editN != null ? 'hidden' : ''}`}>
            {share && !listMode ? (
              <button type="button" onClick={saveToPhotos} disabled={!files}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-brand-accent text-white font-semibold text-base hover:bg-brand-accent-hover transition shadow-[0_6px_20px_rgba(51,71,43,0.3)] sm:shadow-none disabled:opacity-70 cursor-pointer">
                {files ? <ImageDown className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />} {files ? 'Сохранить в Фото' : 'Готовлю слайды'}
              </button>
            ) : isTouch() && !listMode ? (
              <button type="button" onClick={() => { setListMode(true); exported('list') }}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-brand-accent text-white font-semibold text-base hover:bg-brand-accent-hover transition shadow-[0_6px_20px_rgba(51,71,43,0.3)] cursor-pointer">
                <ImageDown className="w-5 h-5" /> Сохранить в Фото
              </button>
            ) : !listMode && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <a href={`/api/carousel/zip?designId=${design.id}`} onClick={() => exported('zip')}
                  className="sm:flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-brand-accent text-white font-semibold text-sm hover:bg-brand-accent-hover transition">
                  <Download className="w-4 h-4" /> Скачать все
                </a>
                {curSlide && (
                  <a href={slideUrl(curSlide.n, true)} onClick={() => exported('single')} className="text-sm text-center text-brand-accent font-semibold hover:underline">
                    Скачать только этот ({pad2(curSlide.n)}.png)
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Телефон без share: слайды списком, зажать и сохранить */}
          {listMode && (
            <div className="space-y-3">
              <div className="text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2 space-y-1">
                <p>Зажми слайд пальцем, и телефон предложит его сохранить. Сохраняй по порядку, с первого.</p>
                <button type="button" onClick={() => setListMode(false)} className="font-semibold text-brand-accent hover:underline cursor-pointer">Вернуть листалку</button>
              </div>
              {design.slides.map(s => (
                <img key={s.n} src={slideUrl(s.n)} alt={`Слайд ${s.n}`} className="w-full rounded-xl border border-brand-border" />
              ))}
            </div>
          )}

          <div className="space-y-1">
            {caption && (
              <button type="button" onClick={copyCaption} className="inline-flex items-center gap-1.5 h-10 text-sm font-semibold text-brand-text-secondary hover:text-brand-accent cursor-pointer">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Описание скопировано' : 'Скопировать описание'}
              </button>
            )}
            <p className="text-xs text-brand-muted">В Instagram нажми «+», выбери «Публикация» и отметь слайды по порядку, начиная с первого</p>
          </div>

          {/* «Оставить этот вид?»: одна строка на лаванде, форма раскрывается по нажатию, все можно пропустить */}
          {offer === 'line' && (
            <div className="rounded-2xl bg-brand-soft px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-brand-text">Оставить этот вид для всех каруселей?</p>
                <p className="text-xs text-brand-muted">Следующие карусели сразу откроются в нем, с твоим ником, именем и фото на обложке и на последнем слайде.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button type="button" onClick={() => setOffer('form')} className="px-4 h-10 rounded-xl text-sm font-semibold border border-brand-accent/40 text-brand-accent hover:bg-white cursor-pointer">Запомнить вид</button>
                <button type="button" onClick={later} className="text-sm text-brand-muted hover:text-brand-text cursor-pointer">Не сейчас</button>
              </div>
            </div>
          )}
          {offer === 'form' && (
            <div className="rounded-2xl bg-brand-soft p-4 space-y-3">
              <p className="text-sm font-semibold text-brand-text">Оставить этот вид для всех каруселей?</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="my-handle" className="block text-sm font-medium text-brand-text">Ник в Instagram</label>
                  <input id="my-handle" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@anna.psy" autoCapitalize="none" autoCorrect="off" className={field} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="my-name" className="block text-sm font-medium text-brand-text">Как тебя подписать</label>
                  <input id="my-name" value={author.name} onChange={e => setAuthor({ ...author, name: e.target.value })} placeholder="Анна Соколова" className={field} />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="my-about" className="block text-sm font-medium text-brand-text">Пара слов о себе</label>
                <textarea id="my-about" value={author.about} onChange={e => setAuthor({ ...author, about: e.target.value })} maxLength={90} rows={2} placeholder="Психолог, работаю с тревогой и отношениями" className={field + ' resize-none'} />
              </div>
              {avatarRow()}
              <div className="flex items-center gap-3">
                <button type="button" onClick={saveMine} disabled={busy === 'mine-save'} className="px-5 h-11 rounded-xl text-sm font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-60 cursor-pointer">
                  {busy === 'mine-save' ? 'Запоминаю' : 'Запомнить вид'}
                </button>
                <button type="button" onClick={later} className="px-2 h-11 text-sm text-brand-muted hover:text-brand-text cursor-pointer">Не сейчас</button>
              </div>
            </div>
          )}
          {offer === 'done' && <p className="text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2" role="status"><Check className="w-4 h-4 inline -mt-0.5 mr-1 text-brand-sage" />Запомнила, следующая карусель откроется уже в нем</p>}

          {/* У этой карусели вид поменяли, а свой уже есть: можно сделать новый основным */}
          {design.hasMine && !design.isMine && design.canSaveMine && !madeMine && (
            <button type="button" onClick={keepThis} disabled={!!busy} className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold border border-brand-accent/40 text-brand-accent hover:bg-brand-soft cursor-pointer disabled:opacity-50">
              {busy === 'keep' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Оставить этот вид
            </button>
          )}
          {madeMine && <p className="text-sm text-brand-text" role="status"><Check className="w-4 h-4 inline -mt-0.5 mr-1 text-brand-sage" />Готово, теперь он у тебя основной</p>}

          {/* Тонкие настройки: свернуты, каждая меняет все слайды сразу */}
          <div className="border-t border-brand-border pt-3">
            <button type="button" onClick={() => setTune(v => !v)} aria-expanded={tune} className="w-full flex items-center justify-between h-10 text-sm font-semibold text-brand-text cursor-pointer">
              Настроить вид точнее <ChevronDown className={`w-4 h-4 transition ${tune ? 'rotate-180' : ''}`} />
            </button>
            {tune && (
              <div className="space-y-5 pt-3">
                {/* Заметки это экран iPhone: вместо палитр светлая или темная тема */}
                {design.style === 't_zametki' && design.tunable && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-brand-text">Тема</p>
                    <div className="flex flex-wrap gap-2">
                      {([['light', 'Светлая'], ['dark', 'Темная']] as const).map(([k, label]) => {
                        const on = (design.options.theme || 'light') === k
                        return <button key={k} type="button" disabled={!!busy} aria-pressed={on} onClick={() => !on && setOption({ theme: k })} className={chip(on)}>{label}</button>
                      })}
                    </div>
                  </div>
                )}
                {/* Цвета: готовые палитры или свои */}
                {design.style !== 't_zametki' && <div className="space-y-3">
                  <p className="text-sm font-semibold text-brand-text">Цвета</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!!busy} onClick={() => saveColors(null)} className={chip(!design.custom)}>Как в стиле</button>
                    {PALETTES.map(p => {
                      const on = design.custom && p.p.bg.toLowerCase() === design.palette.bg.toLowerCase() && p.p.accent.toLowerCase() === design.palette.accent.toLowerCase()
                      return (
                        <button key={p.name} type="button" title={p.name} aria-label={`Палитра ${p.name}`} aria-pressed={on} disabled={!!busy} onClick={() => saveColors(p.p)}
                          className={`relative w-10 h-10 rounded-full border-2 cursor-pointer flex items-center justify-center text-[11px] font-bold ${on ? 'border-brand-text' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]'}`}
                          style={{ background: p.p.bg, color: p.p.text }}>
                          Aa
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: p.p.accent }} />
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {([['bg', 'Фон'], ['text', 'Текст'], ['accent', 'Акцент']] as const).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 text-sm text-brand-text-secondary cursor-pointer">
                        <input type="color" value={(draftPal || design.palette)[k]} onChange={e => pickColor(k, e.target.value)}
                          className="w-10 h-10 rounded-lg border border-brand-border bg-white p-0.5 cursor-pointer" />
                        {label}
                      </label>
                    ))}
                  </div>
                  {note && <p className="text-xs text-brand-muted">{note}</p>}
                </div>}

                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!!busy} onClick={() => call('variant', 'PATCH', { designId: design.id, variant: (design.variant + 1) % VARIANTS })} className={chip(false)}>
                    {busy === 'variant' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />} Другая компоновка
                  </button>
                  {design.tunable && (
                    <button type="button" disabled={!!busy} onClick={() => call('font', 'PATCH', { designId: design.id, fontPair: (design.fontPair + 1) % design.fontPairs.length })} className={chip(false)}>
                      {busy === 'font' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} Другой шрифт: {design.fontPairs[(design.fontPair + 1) % design.fontPairs.length]}
                    </button>
                  )}
                </div>

                {/* Узор на фоне: одна лента идет через все слайды, при листании картинка продолжается */}
                {design.decorAllowed && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-brand-text">Фон</p>
                    <div className="flex flex-wrap gap-2">
                      {DECORS.map(({ id: k, label }) => (
                        <button key={k} type="button" disabled={!!busy} aria-pressed={design.decor === k} onClick={() => { if (k !== design.decor) call('decor', 'PATCH', { designId: design.id, decor: k }) }} className={chip(design.decor === k)}>
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

                {/* Вид поверх стиля: только когда база это хранит */}
                {design.tunable && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-brand-text">Главное слово</p>
                    <div className="flex flex-wrap gap-2">
                      {([['color', 'Цветом'], ['marker', 'Маркером'], ['underline', 'Подчеркнуть']] as const).map(([k, label]) => {
                        const on = (design.options.accentKind || 'color') === k
                        return <button key={k} type="button" disabled={!!busy} aria-pressed={on} onClick={() => !on && setOption({ accentKind: k })} className={chip(on)}>{label}</button>
                      })}
                    </div>
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
        </div>
      )}
    </div>
  )
}
