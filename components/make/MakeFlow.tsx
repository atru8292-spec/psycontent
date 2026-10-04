'use client'

// Экран «Сделать» под флагом нового мозга: ввод → прогресс → результат с вкладками форматов
// (задача sdelat-i-brend, разделы 3 и 4). Генерация набора идет через /api/generate-post/group потоком NDJSON:
// первый готовый формат открывается сразу, остальные догружаются во вкладках. Старые материалы
// открываются по ?post=<id> (из «Моих текстов»), вся мысль целиком, если у материала есть группа.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Check, Loader2, X, Film, Layers, AlignLeft, Send, Smartphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { topicsFor } from '@/lib/first-topic'
import Composer, { DRAFT_KEY, type ComposerSubmit } from './Composer'
import FormatPane, { type PaneItem } from './FormatPane'
import BottomSheet from './BottomSheet'
import { MAKE_FORMATS, formatLabel, toMakeFormat, pluralMaterial, type MakeFormat } from './formats'

type Item = PaneItem & { status: 'pending' | 'ready' | 'failed'; error?: string; overlap?: string[] }
type View = 'compose' | 'progress' | 'result'

const oneOf = (f: string) => MAKE_FORMATS.find(x => x.id === f)?.one || f
const joinRu = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`)
const READY_WORD: Record<string, string> = { reels: 'готов', post: 'готов', post_tg: 'готов', carousel: 'готова', stories: 'готовы' }
// «Не получилось сделать карусель. Пост и рилс готовы.»
function partialLine(failed: string[], ready: string[]): string {
  const r = ready.map(oneOf)
  const done = r.length === 1 ? `${r[0].charAt(0).toUpperCase()}${r[0].slice(1)} ${READY_WORD[ready[0]] || 'готов'}.` : `${joinRu(r).charAt(0).toUpperCase()}${joinRu(r).slice(1)} готовы.`
  return `Не получилось сделать ${joinRu(failed.map(oneOf))}. ${done}`
}

function shrinkImage(file: File, max = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')) }
    img.src = url
  })
}

const ICON: Record<string, any> = { reels: Film, carousel: Layers, post: AlignLeft, post_tg: Send, stories: Smartphone }
const TOAST_KEY = 'psycont_saved_toast_groups'

// Ответ сервера человеческими словами: что случилось и что сохранилось
function friendly(code?: string, message?: string): string {
  if (code === 'text_limit') return 'На этот месяц тексты закончились, новые появятся в начале следующего. Твой голос и темы я запомнила, они никуда не денутся.'
  if (code === 'text_limit_partial' && message) return message
  if (code === 'sample_instagram') return 'Инстаграм не отдает текст по ссылке. Загрузи скрины или скопируй подпись'
  if (code === 'sample_closed') return 'Канал закрытый. Скопируй текст и вставь сюда'
  if (code === 'sample_failed') return 'Не получилось открыть пост по ссылке. Пришли скрин или вставь его текст'
  if (code === 'sample_empty') return 'Не получилось разобрать пост. Пришли скрин или вставь его текст'
  if (code === 'sample_private') return 'Похоже, это переписка или личное. Сюда только публичные посты: переписки с клиентами не загружай'
  if (code === 'too_large') return 'Скринов слишком много или они тяжелые. Загрузи поменьше'
  if (code === 'network') return 'Пропала связь. Проверь интернет и нажми еще раз: мысль на месте.'
  return 'Текст не дописался, у меня что-то сломалось. Мысль на месте, попробуй еще раз через минуту.'
}


export default function MakeFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const [topics, setTopics] = useState<string[]>([])
  const [firstTime, setFirstTime] = useState(false)
  const [view, setView] = useState<View>('compose')
  const [items, setItems] = useState<Item[]>([])
  const [active, setActive] = useState(0)
  const [thought, setThought] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addFormats, setAddFormats] = useState<MakeFormat[]>([])
  const lastSubmit = useRef<ComposerSubmit | null>(null)
  // после ошибки мысль возвращается в поле: «мысль на месте» должно быть правдой
  const [restoreText, setRestoreText] = useState('')
  const [composerKey, setComposerKey] = useState(0)
  const [askSampleText, setAskSampleText] = useState(false)
  // «Сделать так же»: что взяли из образца (плашка под результатом)
  const [sampleInfo, setSampleInfo] = useState<{ label: string; clientStory: boolean } | null>(null)
  const initialTopic = params.get('topic') || ''
  // формат из плана (?format=post|carousel|reels|stories|post_tg) выбран в чипах заранее
  // ?formats=post,carousel (финал онбординга) или ?format= из плана: выбраны в чипах заранее
  const planFormat = params.get('format')
  const formatsParam = params.get('formats')
  const initialFormats = useMemo<MakeFormat[] | undefined>(() => {
    if (formatsParam) {
      const fs = formatsParam.split(',').map(f => f.trim()).filter(f => MAKE_FORMATS.some(m => m.id === f)) as MakeFormat[]
      if (fs.length) return fs
    }
    return planFormat ? [toMakeFormat(planFormat)] : undefined
  }, [planFormat, formatsParam])
  // мысль из демо на лендинге (как на старом экране: localStorage, 24 часа), стираем после первого готового формата
  const [seed, setSeed] = useState('')
  useEffect(() => {
    try {
      const raw = localStorage.getItem('psycont_seed_thought')
      if (!raw) return
      const { text, ts } = JSON.parse(raw)
      if (text && typeof ts === 'number' && Date.now() - ts < 24 * 3600 * 1000) setSeed(String(text))
      else localStorage.removeItem('psycont_seed_thought')
    } catch {}
  }, [])
  const abortRef = useRef<AbortController | null>(null)

  // профиль, темы для карточки «Не знаю, о чем писать», первый ли раз
  useEffect(() => {
    let on = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !on) return
      const [prof, plan, count] = await Promise.all([
        supabase.from('onboarding_profiles').select('client_pain_phrases, one_niche, niches').eq('user_id', user.id).maybeSingle(),
        supabase.from('content_plans').select('plan').eq('user_id', user.id).maybeSingle(),
        supabase.from('generated_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('format', 'eq', 'hooks'),
      ])
      if (!on) return
      setFirstTime((count.count || 0) === 0)
      // план это «день 1..30» без дат (generated_at переписывается при каждой отметке), поэтому берем
      // ближайшие несделанные дни по порядку; дальше темы ниши (тема дня первой) и фразы клиентов
      const p: any[] = Array.isArray(plan.data?.plan) ? plan.data!.plan : []
      const planTopics = p.filter((x: any) => !x.done && typeof x.topic === 'string').sort((a: any, b: any) => (a.day ?? 0) - (b.day ?? 0)).map((x: any) => String(x.topic))
      const niche = prof.data?.one_niche || (Array.isArray(prof.data?.niches) ? prof.data.niches[0] : '')
      const list = topicsFor({ plan: planTopics, niche, pain: prof.data?.client_pain_phrases })
      setTopics(list.slice(0, 12))
    })()
    return () => { on = false }
  }, [])

  // открыть готовую мысль из «Моих текстов»: ?post=<id>&f=<формат>
  useEffect(() => {
    const postId = params.get('post')
    if (!postId) return
    let on = true
    ;(async () => {
      const one = await supabase.from('generated_posts').select('*').eq('id', postId).maybeSingle()
      if (!on || !one.data) return
      let rows: any[] = [one.data]
      if (one.data.group_id) {
        const g = await supabase.from('generated_posts').select('*').eq('group_id', one.data.group_id).order('created_at', { ascending: true })
        if (g.data?.length) rows = g.data
      }
      if (!on) return
      const list: Item[] = rows.map(r => ({
        format: toMakeFormat(String(r.format || 'post')), code: String(r.format || 'post'), postId: r.id,
        text: String(r.content || ''), baseline: String(r.content || ''), publishedAt: r.published_at || null, status: 'ready',
      }))
      setItems(list)
      setGroupId(one.data.group_id || null)
      setThought(String(one.data.core?.thought || one.data.topic || ''))
      const f = params.get('f')
      const idx = Math.max(0, list.findIndex(x => (f ? x.format === f : x.postId === postId)))
      setActive(idx)
      setView('result')
    })()
    return () => { on = false }
  }, [params])

  const showToast = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3000) }

  // Набор форматов потоком: по строке JSON на событие
  const runGroup = useCallback(async (body: Record<string, unknown>, formats: MakeFormat[], append: boolean) => {
    setBusy(true); setError(null)
    if (!append) {
      setItems(formats.map(f => ({ format: f, code: f, postId: null, text: '', baseline: '', publishedAt: null, status: 'pending' })))
      setActive(0)
      setView('progress')
    } else {
      setItems(prev => [...prev.filter(x => !(formats.includes(x.format as MakeFormat) && x.status === 'failed')),
        ...formats.map(f => ({ format: f, code: f, postId: null, text: '', baseline: '', publishedAt: null, status: 'pending' as const }))])
    }
    let opened = append
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const res = await fetch('/api/generate-post/group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, formats }), signal: ac.signal })
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}))
        if (d?.error === 'need_onboarding') { router.push('/onboarding/express'); return }
        if (res.status === 413) throw Object.assign(new Error('bad'), { code: 'too_large' })
        throw Object.assign(new Error('bad'), { code: d?.error, msg: d?.message })
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let gotAny = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let ev: any
          try { ev = JSON.parse(line) } catch { continue }
          if (ev.type === 'core' && ev.thought && !append) setThought(ev.thought)
          if (ev.type === 'format') {
            gotAny = true
            setItems(prev => prev.map(x => x.format === ev.format && x.status === 'pending'
              ? (ev.ok
                ? { ...x, status: 'ready', code: ev.code, postId: ev.postId || null, text: ev.text, baseline: ev.text, overlap: Array.isArray(ev.overlap) ? ev.overlap : [] }
                : { ...x, status: 'failed', error: ev.error })
              : x))
            if (ev.ok && !opened) {
              opened = true
              // мысль превратилась в текст: черновик и мысль из демо больше не нужны
              try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem('psycont_seed_thought') } catch {}
              setSeed('')
              setActive(Math.max(0, formats.indexOf(ev.format)))
              setView('result')
            }
          }
          if (ev.type === 'done' && ev.groupId) {
            setGroupId(ev.groupId)
            try {
              const seen: string[] = JSON.parse(localStorage.getItem(TOAST_KEY) || '[]')
              if (!seen.includes(ev.groupId)) { showToast('Сохранено в Мои тексты'); localStorage.setItem(TOAST_KEY, JSON.stringify([...seen.slice(-50), ev.groupId])) }
            } catch { showToast('Сохранено в Мои тексты') }
          }
          if (ev.type === 'sample') setSampleInfo({ label: String(ev.label || ''), clientStory: !!ev.clientStory })
          if (ev.type === 'error') throw Object.assign(new Error('stream'), { code: ev.code || 'server' })
        }
      }
      if (!gotAny) throw Object.assign(new Error('empty'), { code: 'server' })
      // все форматы упали: экран прогресса не оставляем висеть, мысль возвращается в поле
      if (!opened) throw Object.assign(new Error('all_failed'), { code: 'server' })
      setItems(prev => prev.map(x => x.status === 'pending' ? { ...x, status: 'failed', error: 'Этот не получился, сбой у меня. Остальные на месте.' } : x))
    } catch (e: any) {
      if (e?.name === 'AbortError') return // человек ушел «Назад»: сервер доделает и сохранит сам
      const msg = friendly(e?.code || (/fetch|network|load failed/i.test(String(e?.message)) ? 'network' : ''), e?.msg)
      // готовые форматы уже на экране и в базе: при сбое после них не уходим в поле, помечаем недописанные
      if (!append && !opened) {
        if (['sample_closed', 'sample_failed', 'sample_empty'].includes(String(e?.code || ''))) setAskSampleText(true)
        setView('compose'); setError(msg)
      }
      else if (!append) { setItems(prev => prev.map(x => x.status === 'pending' ? { ...x, status: 'failed', error: msg } : x)) }
      else { setItems(prev => prev.map(x => x.status === 'pending' ? { ...x, status: 'failed', error: msg } : x)) }
    } finally {
      if (abortRef.current === ac) { abortRef.current = null; setBusy(false) }
    }
  }, [router])

  const submit = (s: ComposerSubmit) => {
    lastSubmit.current = s
    setError(null)
    if (s.sozhe) { submitSample(s); return }
    const topic = s.text.length > 120 ? s.text.slice(0, 120).replace(/\s+\S*$/, '') : s.text
    setThought(topic)
    runGroup({ topic, userDetail: s.text, goal: s.goal }, s.formats, false)
  }

  // «Сделать так же»: скрины уменьшаем в браузере (до 1280 px, JPEG), оригинал на сервере только в памяти запроса
  const submitSample = async (s: ComposerSubmit) => {
    const sz = s.sozhe!
    let sample: Record<string, unknown>
    if (sz.kind === 'screens') {
      setBusy(true)
      try { sample = { kind: 'screens', images: await Promise.all(sz.files.slice(0, 10).map(f => shrinkImage(f))) } }
      catch { setBusy(false); setError('Не получилось прочитать скрины. Попробуй другие или вставь текст поста'); return }
    } else if (sz.kind === 'text') sample = { kind: 'text', text: sz.text }
    else sample = { kind: 'link', url: sz.url }
    // мысль из главного поля тоже годится как «О чем у тебя?», если отдельно не написала
    const about = (s.about || s.text || '').trim()
    setThought(about || 'Так же, про твое')
    runGroup({ topic: about.length > 120 ? about.slice(0, 120).replace(/\s+\S*$/, '') : about, userDetail: about || undefined, goal: s.goal, sample }, s.formats, false)
  }

  const current = items[active]
  const readyIds = items.filter(x => x.status === 'ready' && x.postId)
  const anchor = current?.postId ? current : readyIds[0]

  // еще формат из этой мысли: ядро берет сервер по id, правленый текст пересоберет ядро
  const addMore = (formats: MakeFormat[]) => {
    if (!anchor?.postId || !formats.length) return
    setAddOpen(false); setMoreOpen(false)
    runGroup({ fromPostId: anchor.postId, editedText: anchor.text !== anchor.baseline ? anchor.text : undefined }, formats, true)
  }
  const retryFailed = (f: MakeFormat) => {
    if (anchor?.postId) runGroup({ fromPostId: anchor.postId }, [f], true)
    else if (lastSubmit.current) {
      const t = (lastSubmit.current.about || lastSubmit.current.text || '').trim()
      runGroup({ topic: t.slice(0, 120), userDetail: t || undefined, goal: lastSubmit.current.goal }, [f], true)
    }
  }

  const copyAll = () => {
    const all = items.filter(x => x.status === 'ready').map(x => `${formatLabel(x.format)}\n\n${x.text}`).join('\n\n* * *\n\n')
    navigator.clipboard.writeText(all).then(() => showToast('Скопировала все форматы')).catch(() => {})
    setMoreOpen(false)
  }
  const removeCurrent = async () => {
    if (!current?.postId) return
    const { error: e } = await supabase.from('generated_posts').delete().eq('id', current.postId)
    setConfirmDelete(false); setMoreOpen(false)
    if (e) { showToast('Не получилось удалить. Попробуй еще раз'); return }
    const rest = items.filter((_, i) => i !== active)
    setItems(rest)
    setActive(0)
    if (!rest.length) { setView('compose'); router.replace('/dashboard/make') }
  }


  const backToCompose = () => {
    abortRef.current?.abort(); abortRef.current = null; setBusy(false)
    setView('compose'); setItems([]); setThought(''); setGroupId(null); setSampleInfo(null); setAskSampleText(false); setRestoreText('')
    setComposerKey(k => k + 1); router.replace('/dashboard/make')
  }

  // ---------- вид ----------
  // Поле ввода не размонтируется на время генерации: при ошибке ссылка, скрины и мысль на месте.
  // «Назад» из результата начинает с чистого поля (новый key)
  const composeView = (
      <div hidden={view !== 'compose'}>
        {error && (
          <div className="max-w-[560px] mx-auto px-4 pt-4">
            <div className="flex items-start gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-text" role="alert">
              <p className="min-w-0 flex-1">{error}</p>
              <button type="button" onClick={() => setError(null)} aria-label="Закрыть" className="w-11 h-11 -m-2 flex items-center justify-center text-brand-muted cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}
        <Composer key={composerKey} firstTime={firstTime} topics={topics} busy={busy} onSubmit={submit} askSampleText={askSampleText} onSampleCleared={() => setAskSampleText(false)}
          initialText={restoreText || initialTopic || seed} initialFormats={initialFormats} />
      </div>
  )

  if (view === 'compose') return composeView

  if (view === 'progress') {
    return (
      <>{composeView}
      <div className="max-w-[560px] mx-auto px-4 pt-2 pb-8">
        <button type="button" onClick={backToCompose} className="h-11 -ml-2 pl-1 pr-2 inline-flex items-center text-[15px] text-brand-text-secondary cursor-pointer">
          <ChevronLeft className="w-5 h-5" />Назад
        </button>
        <h1 className="text-[22px] leading-7 font-semibold text-brand-text">Делаю {items.length} {pluralMaterial(items.length)}</h1>
        <ul aria-live="polite" className="mt-4 divide-y divide-brand-border rounded-2xl bg-brand-card border border-brand-border">
          {items.map(x => {
            const Icon = ICON[x.format] || AlignLeft
            return (
              <li key={x.format} className="h-[52px] flex items-center gap-3 px-4">
                <Icon className="w-5 h-5 text-brand-muted shrink-0" />
                <span className="min-w-0 flex-1 text-[16px] text-brand-text">{formatLabel(x.format)}</span>
                {x.status === 'pending' && <Loader2 className="w-5 h-5 text-brand-muted animate-spin" aria-label="Делаю" />}
                {x.status === 'ready' && <Check className="w-5 h-5 text-brand-accent" aria-label="Готово" />}
                {x.status === 'failed' && <span className="text-[14px] text-brand-muted">не вышло</span>}
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-[13px] text-brand-muted">Можно выйти, все сохранится в «Моих текстах»</p>
      </div>
      </>
    )
  }

  const failed = items.filter(x => x.status === 'failed')
  const missing = MAKE_FORMATS.filter(f => !items.some(x => x.format === f.id))

  return (
    <>{composeView}
    <div className="max-w-[560px] mx-auto px-4 pb-[calc(72px+16px)] lg:pb-8">
      <div className="h-[52px] flex items-center gap-1 -ml-2">
        <button type="button" onClick={backToCompose} className="h-11 pl-1 pr-2 inline-flex items-center text-[15px] text-brand-text-secondary cursor-pointer shrink-0">
          <ChevronLeft className="w-5 h-5" />Назад
        </button>
        <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-brand-text">{thought}</p>
      </div>

      {/* вкладки форматов */}
      <div role="tablist" aria-label="Форматы" className="-mx-4 px-4 flex gap-2 overflow-x-auto snap-x pb-1 [scrollbar-width:none]">
        {items.map((x, i) => (
          <button key={`${x.format}-${i}`} type="button" role="tab" id={`fmt-tab-${i}`} aria-controls="fmt-panel" aria-selected={i === active} onClick={() => setActive(i)}
            className={`snap-start h-11 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-full text-[15px] cursor-pointer ${i === active ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text'}`}>
            {x.status === 'pending' && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-muted" />}
            {x.publishedAt && <Check className="w-3 h-3 text-brand-accent" />}
            {formatLabel(x.format)}
          </button>
        ))}
      </div>

      {failed.length > 0 && items.some(x => x.status === 'ready') && (
        <p className="mt-3 text-[14px] text-brand-text-secondary">{partialLine(failed.map(x => x.format), items.filter(x => x.status === 'ready').map(x => x.format))}</p>
      )}

      {sampleInfo && (
        <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-[14px] text-brand-text">
          {sampleInfo.clientStory ? 'Здесь была история клиента. Взяли форму, но без клиента' : 'Взяли: прием, порядок. Не взяли: слова, тему, примеры.'}
        </p>
      )}
      {current?.status === 'ready' && current.overlap && current.overlap.length > 0 && (
        <div className="mt-3 rounded-xl border border-brand-border px-3 py-2 text-[14px] text-brand-text">
          <p>Тут слишком похоже на тот пост, поправь своими словами:</p>
          <ul className="mt-1 list-disc pl-5 text-brand-text-secondary">{current.overlap.slice(0, 5).map((c, i) => <li key={i} className="break-words">«{c}»</li>)}</ul>
        </div>
      )}

      <div className="mt-4" role="tabpanel" id="fmt-panel" aria-labelledby={`fmt-tab-${active}`}>
        {current?.status === 'ready' && (
          <FormatPane key={current.postId || active} item={current}
            onChange={patch => setItems(prev => prev.map((x, i) => i === active ? { ...x, ...patch } : x))}
            onPublished={at => setItems(prev => prev.map((x, i) => i === active ? { ...x, publishedAt: at } : x))}
            onMore={() => setMoreOpen(true)} />
        )}
        {current?.status === 'pending' && (
          <div className="rounded-2xl bg-brand-card border border-brand-border p-6 flex items-center gap-3 text-brand-text-secondary">
            <Loader2 className="w-5 h-5 animate-spin" />Делаю {oneOf(current.format)}
          </div>
        )}
        {current?.status === 'failed' && (
          <div className="rounded-2xl bg-brand-card border border-brand-border p-5">
            <p className="text-[15px] text-brand-text">{current.error || 'Этот не получился, сбой у меня. Остальные на месте.'}</p>
            <button type="button" disabled={busy} onClick={() => retryFailed(current.format as MakeFormat)} className="mt-3 h-11 px-5 rounded-xl bg-brand-accent text-white font-semibold cursor-pointer disabled:opacity-50">Попробовать еще раз</button>
          </div>
        )}
      </div>


      <BottomSheet open={moreOpen} onClose={() => { setMoreOpen(false); setConfirmDelete(false) }} title="Еще">
        <div className="pt-1">
          {missing.length > 0 && (
            <button type="button" onClick={() => { setAddFormats([]); setAddOpen(true); setMoreOpen(false) }} disabled={busy || !anchor?.postId}
              className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-40">Сделать еще формат из этой мысли</button>
          )}
          <button type="button" onClick={copyAll} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Скопировать все</button>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Удалить {current ? oneOf(current.format) : ''}</button>
          ) : (
            <div className="py-2">
              <p className="text-[16px] text-brand-text">Удалить {current ? oneOf(current.format) : ''} насовсем? Остальные форматы останутся.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={removeCurrent} className="h-12 rounded-2xl bg-brand-text text-brand-bg font-semibold cursor-pointer">Удалить</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="h-12 rounded-2xl border border-brand-border text-brand-text font-semibold cursor-pointer">Оставить</button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* еще формат */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Что еще сделать из этой мысли"
        footer={<button type="button" disabled={!addFormats.length} onClick={() => addMore(addFormats)} className="w-full h-[52px] rounded-2xl bg-brand-accent text-white font-semibold cursor-pointer disabled:opacity-40">{addFormats.length ? `Сделать ${addFormats.length === 1 ? MAKE_FORMATS.find(f => f.id === addFormats[0])?.one : `${addFormats.length} ${pluralMaterial(addFormats.length)}`}` : 'Выбери формат'}</button>}>
        <div className="flex flex-wrap gap-2 pt-1">
          {missing.map(f => {
            const on = addFormats.includes(f.id)
            return (
              <button key={f.id} type="button" aria-pressed={on} onClick={() => setAddFormats(on ? addFormats.filter(x => x !== f.id) : [...addFormats, f.id])}
                className={`h-11 px-4 rounded-full text-[15px] cursor-pointer ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text'}`}>{f.label}</button>
            )
          })}
        </div>
      </BottomSheet>


      {toast && (
        <div aria-live="polite" className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-[calc(56px+env(safe-area-inset-bottom)+74px)] lg:bottom-[96px] lg:left-[calc(50%+120px)] px-4 py-2.5 rounded-xl bg-brand-text text-brand-bg text-[15px] shadow-lg">
          {toast}
        </div>
      )}
    </div>
    </>
  )
}
