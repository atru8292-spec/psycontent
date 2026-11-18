'use client'

// Экран «Написать» под флагом нового мозга (вариант А, макеты A1, A3, A4, A5, A6, A9; словарь 17.11):
// ввод → прогресс → результат с вкладками форматов. На компьютере «стол»: центр 704 px (Composer, «Еще не в блоге»)
// и правая колонка 360 px («Ритм месяца», «План тем»). Генерация набора идет через /api/generate-post/group потоком
// NDJSON: первый готовый формат открывается сразу, остальные догружаются во вкладках. Старые тексты открываются
// по ?post=<id> (из «Моих текстов»), вся мысль целиком, если у текста есть группа; &more=1 сразу открывает
// «Что написать еще?». Карусель на компьютере уходит в режим фокуса (CarouselDesigner сам зовет useShellFocus).

import { track } from '@/lib/track'
import { goalFirst } from '@/lib/metrika'
import { normFormat } from '@/lib/analytics/events'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMakeParams } from '@/lib/make-handoff'
import { ChevronLeft, Check, Loader2, X, Film, Layers, AlignLeft, Send, Smartphone, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDashboardMe } from '@/lib/dashboard-me'
import { dateRu } from '@/lib/billing/pay-texts'
import { RESUME, isMaterials, spendLine, type Materials } from '@/lib/limit-texts'
import Composer, { DRAFT_KEY, type ComposerSubmit, type PlanPick, type TopicPick } from './Composer'
import FormatPane, { AsideCard, type PaneItem } from './FormatPane'
import BottomSheet from './BottomSheet'
import RightColumn, { RhythmStrip } from './RightColumn'
import InWork from './InWork'
import { useDesk } from './useDesk'
import { MAKE_FORMATS, formatLabel, formatOne, toMakeFormat, pluralMaterial, makeButtonText, type MakeFormat } from './formats'

type Item = PaneItem & { status: 'pending' | 'ready' | 'failed'; error?: string; overlap?: string[] }
type View = 'compose' | 'progress' | 'result'

const joinRu = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`)
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
// процесс возвратным глаголом (словарь, строка 17): «Пост пишется», «Карусель собирается»
const GOING: Record<string, string> = { post: 'пишется', post_tg: 'пишется', reels: 'пишется', carousel: 'собирается', stories: 'пишутся' }
const FAILED: Record<string, string> = { post: 'не дописался', post_tg: 'не дописался', reels: 'не дописался', carousel: 'не собралась', stories: 'не дописались' }
const SBOY = 'из-за сбоя в PsyCont'
const failLine = (f: string) => `${cap(formatOne(f))} ${FAILED[f] || 'не дописался'} ${SBOY}. Остальное готово.`
// «Карусель не собралась из-за сбоя в PsyCont. Остальное готово.»
function partialLine(failed: string[]): string {
  if (failed.length === 1) return failLine(failed[0])
  return `${cap(joinRu(failed.map(formatOne)))} не дописались ${SBOY}. Остальное готово.`
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
// Идущий запуск (16.11): страница обновилась или вкладка перезагрузилась, а сервер дописывает и сохраняет сам.
// После загрузки показываем «Текст дописывается» и подтягиваем готовое из базы, чтобы человек не запускал второй раз.
const RUN_KEY = 'psycont_make_running'
const RUN_WAIT_MS = 4 * 60 * 1000
const RUN_POLL_MS = 4000
type RunMark = { t: number; formats: MakeFormat[]; thought: string }
function readRun(): RunMark | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(RUN_KEY) || 'null')
    if (!r || typeof r.t !== 'number' || !Array.isArray(r.formats) || !r.formats.length) return null
    if (Date.now() - r.t > RUN_WAIT_MS) { sessionStorage.removeItem(RUN_KEY); return null }
    const formats = r.formats.filter((f: string) => MAKE_FORMATS.some(m => m.id === f)) as MakeFormat[]
    return formats.length ? { t: r.t, formats, thought: String(r.thought || '').slice(0, 200) } : null
  } catch { return null }
}
// страница уходит (обновление, закрытие): оборванный поток не должен стереть отметку запуска в finally
let pageLeaving = false
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { pageLeaving = true })
  window.addEventListener('pageshow', () => { pageLeaving = false })
}
function markRun(r: RunMark | null) {
  if (!r && pageLeaving) return
  try { if (r) sessionStorage.setItem(RUN_KEY, JSON.stringify(r)); else sessionStorage.removeItem(RUN_KEY) } catch {}
}

// Строка generated_posts в карточку результата (открытие из «Моих текстов» и продолжение после обновления)
function rowToItem(r: any): Item {
  return {
    format: toMakeFormat(String(r.format || 'post')), code: String(r.format || 'post'), postId: r.id,
    text: String(r.content || ''), baseline: String(r.content || ''), publishedAt: r.published_at || null, status: 'ready',
    ...(typeof r.check_result?.zh4?.zh6?.formatName === 'string' ? { formatName: String(r.check_result.zh4.zh6.formatName).slice(0, 120) } : {}),
    ...(typeof r.check_result?.zh4?.zh6?.ustr === 'string' ? { vid: String(r.check_result.zh4.zh6.ustr).slice(0, 40) } : {}),
  }
}

// Ответ сервера человеческими словами: что случилось и что сохранилось (словарь 17.11, строки 60-61)
function friendly(code?: string, message?: string): string {
  // конец лимита: текст сервера (он знает тариф: пробные у бесплатного, месячные у платных, lib/energy.ts); запасной правдив для обоих
  if (code === 'text_limit') return message || 'Тексты закончились, поэтому этот не напишется. Голос, темы и все написанное на месте.'
  if (code === 'text_limit_partial' && message) return message
  if (code === 'sample_instagram') return 'Instagram не отдает текст по ссылке. Загрузи скриншоты или скопируй описание'
  if (code === 'sample_closed') return 'Канал закрытый. Скопируй текст поста и вставь сюда'
  if (code === 'sample_failed') return 'Не получилось открыть пост по ссылке. Пришли скриншот или вставь его текст'
  if (code === 'sample_empty') return 'Не получилось разобрать пост. Пришли скриншот или вставь его текст'
  if (code === 'sample_private') return 'Похоже, это переписка или личное. Сюда только публичные посты: переписки с клиентами не загружай'
  if (code === 'too_large') return 'Скриншотов слишком много или они тяжелые. Загрузи поменьше'
  if (code === 'network') return 'Пропала связь. Проверь интернет и нажми еще раз, мысль на месте.'
  return `Текст не дописался ${SBOY}. Мысль на месте, попробуй через минуту.`
}

const PAD = 'px-4 pt-3 lg:px-12 lg:pt-11 pb-8'

export default function MakeFlow() {
  const router = useRouter()
  const params = useMakeParams() // адрес + тексты из sessionStorage (lib/make-handoff.ts)
  const { me, refresh: refreshMe } = useDashboardMe()
  const materials: Materials | null = isMaterials(me?.materials) ? me.materials : null
  // платный тариф: до какого числа оплачен (оболочка кладет paidUntil в сводку), для «Останется 36 из 50 до 12 декабря»
  const until = useMemo(() => { try { return me?.paidUntil ? dateRu(me.paidUntil) : undefined } catch { return undefined } }, [me?.paidUntil])
  const desk = useDesk()
  const { firstTime } = desk
  const [view, setView] = useState<View>('compose')
  const [items, setItems] = useState<Item[]>([])
  const [active, setActive] = useState(0)
  const [thought, setThought] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [copiedTop, setCopiedTop] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addFormats, setAddFormats] = useState<MakeFormat[]>([])
  const lastSubmit = useRef<ComposerSubmit | null>(null)
  // после ошибки мысль возвращается в поле: «мысль на месте» должно быть правдой
  const [restoreText, setRestoreText] = useState('')
  const [composerKey, setComposerKey] = useState(0)
  const [askSampleText, setAskSampleText] = useState(false)
  // строка «Плана тем» справа: тема и формат дня уходят в поле
  const [take, setTake] = useState<{ pick: TopicPick; n: number } | null>(null)
  const [fieldText, setFieldText] = useState('')
  // образец: что взято (плашка под результатом)
  const [sampleInfo, setSampleInfo] = useState<{ label: string; clientStory: boolean } | null>(null)
  const initialTopic = params.get('topic') || ''
  // ?formats=post,carousel (финал знакомства) или ?format= из плана: выбраны в чипах заранее
  const planFormatParam = params.get('format')
  const formatsParam = params.get('formats')
  const initialFormats = useMemo<MakeFormat[] | undefined>(() => {
    if (formatsParam) {
      const fs = formatsParam.split(',').map(f => f.trim()).filter(f => MAKE_FORMATS.some(m => m.id === f)) as MakeFormat[]
      if (fs.length) return fs
    }
    return planFormatParam ? [toMakeFormat(planFormatParam)] : undefined
  }, [planFormatParam, formatsParam])
  // формат и задача дня из плана тем (?fkod=&rol=&reakciya=): уходят в zh6 один раз, с первым запуском этой темы.
  // Снимаем после первого готового формата, чтобы при сбое повтор ушел с тем же планом
  const [plan, setPlan] = useState<PlanPick | null>(null)
  useEffect(() => {
    const fkod = params.get('fkod') || ''
    const rol = params.get('rol') || ''
    const reakciya = params.get('reakciya') || ''
    const code = (v: string) => (/^[a-z0-9_]{1,40}$/.test(v) ? v : undefined)
    if (!initialTopic || !(code(fkod) || code(rol) || code(reakciya))) { setPlan(null); return }
    const sit = (params.get('sit') || '').trim().slice(0, 300)
    setPlan({ formatKod: code(fkod), forFormat: planFormatParam ? toMakeFormat(planFormatParam) : undefined, rol: code(rol), reakciya: code(reakciya), ...(sit ? { situaciya: sit } : {}) })
  }, [params, initialTopic, planFormatParam])
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

  // открыть готовую мысль из «Моих текстов»: ?post=<id>&f=<формат>, &more=1 сразу открывает «Что написать еще?»
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
      const list: Item[] = rows.map(rowToItem)
      setItems(list)
      setGroupId(one.data.group_id || null)
      setThought(String(one.data.core?.thought || one.data.topic || ''))
      const f = params.get('f')
      const idx = Math.max(0, list.findIndex(x => (f ? x.format === f : x.postId === postId)))
      setActive(idx)
      setView('result')
      if (params.get('more') === '1' && MAKE_FORMATS.some(m => !list.some(x => x.format === m.id))) { setAddFormats([]); setAddOpen(true) }
    })()
    return () => { on = false }
  }, [params])

  // Продолжение после обновления страницы: запуск еще идет на сервере. Ждем строки в базе не дольше RUN_WAIT_MS
  // от старта; готовое открываем как из «Моих текстов». Не трогаем, если открыт конкретный текст (?post=)
  const [resumed, setResumed] = useState(false)
  const resumeCancelled = useRef(false)
  useEffect(() => {
    if (params.get('post')) return
    const run = readRun()
    if (!run) return
    let on = true
    resumeCancelled.current = false
    setResumed(true)
    setThought(run.thought)
    setItems(run.formats.map(f => ({ format: f, code: f, postId: null, text: '', baseline: '', publishedAt: null, status: 'pending' as const })))
    setActive(0)
    setView('progress')
    track('feature_open', { feature: 'make_resume' })
    const since = new Date(run.t - 60000).toISOString() // запас на расхождение часов телефона и сервера
    // своя группа: самая свежая в окне, с той же темой (прошлый запуск минуту назад не подхватываем, ревью 16.11)
    const norm = (v: unknown) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40)
    const want = norm(run.thought)
    const pick = (all: any[]): any[] => {
      const mine = want ? all.filter(r => norm(r.topic) === want || (norm(r.topic) && want.startsWith(norm(r.topic)))) : all
      const latest = [...mine].reverse().find(r => r.group_id)?.group_id
      return latest ? mine.filter(r => r.group_id === latest) : mine.filter(r => !r.group_id).slice(-run.formats.length)
    }
    const load = async () => {
      const { data } = await supabase.from('generated_posts').select('*').gte('created_at', since)
        .not('format', 'eq', 'hooks').order('created_at', { ascending: true })
      return pick(Array.isArray(data) ? data : [])
    }
    const finish = (rows: any[]) => {
      markRun(null)
      if (!on) return
      setResumed(false)
      if (!rows.length) {
        setItems([]); setView('compose')
        setError(RESUME.timeout)
        return
      }
      setItems(rows.map(rowToItem)); setGroupId(rows[0].group_id || null); setActive(0); setView('result')
    }
    const tick = async () => {
      if (!on) return
      if (resumeCancelled.current) { setResumed(false); return } // «Назад»: больше не ждем
      // отметку снял поток прошлого экрана (ушла в «Мои тексты» и вернулась без перезагрузки): он закончил,
      // значит все уже в базе; последний раз читаем и открываем, иначе крутилки висели бы вечно (ревью 16.11)
      const stillRunning = !!readRun()
      const rows = await load()
      if (!on) return
      if (!stillRunning) { finish(rows); return }
      if (rows.length) setItems(prev => prev.map(x => {
        const r = rows.find(row => toMakeFormat(String(row.format || 'post')) === x.format)
        return r && x.status === 'pending' ? rowToItem(r) : x
      }))
      const late = Date.now() - run.t > RUN_WAIT_MS
      if (rows.length >= run.formats.length || late) { finish(rows); return }
      window.setTimeout(tick, RUN_POLL_MS)
    }
    tick()
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
    if (!append) void goalFirst('make') // цель Метрики: первое нажатие «Написать» (один раз на человека)
    const ac = new AbortController()
    abortRef.current = ac
    // запуск идет: если страница обновится, после загрузки покажем «Текст дописывается» (RUN_KEY). «Еще из мысли» не метим
    if (!append) markRun({ t: Date.now(), formats, thought: String(body.topic || '').slice(0, 200) })
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
                ? { ...x, status: 'ready', code: ev.code, postId: ev.postId || null, text: ev.text, baseline: ev.text, overlap: Array.isArray(ev.overlap) ? ev.overlap : [],
                    ...(typeof ev.formatName === 'string' && ev.formatName.trim() ? { formatName: ev.formatName.trim().slice(0, 120) } : {}),
                    ...(ev.vidZamenen === true ? { vidZamenen: true } : {}),
                    ...(typeof ev.vid === 'string' && /^[a-z0-9_]{1,40}$/.test(ev.vid) ? { vid: ev.vid } : {}) }
                : { ...x, status: 'failed', error: ev.error })
              : x))
            if (ev.ok && !opened) {
              opened = true
              void goalFirst('material') // цель Метрики: первый готовый текст
              setPlan(null) // формат и задача из плана ушли вместе с этой темой, второй раз не шлем
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
              if (!seen.includes(ev.groupId)) { showToast('Сохранено в «Моих текстах»'); localStorage.setItem(TOAST_KEY, JSON.stringify([...seen.slice(-50), ev.groupId])) }
            } catch { showToast('Сохранено в «Моих текстах»') }
          }
          if (ev.type === 'sample') setSampleInfo({ label: String(ev.label || ''), clientStory: !!ev.clientStory })
          if (ev.type === 'error') throw Object.assign(new Error('stream'), { code: ev.code || 'server' })
        }
      }
      if (!gotAny) throw Object.assign(new Error('empty'), { code: 'server' })
      // все форматы упали: экран прогресса не оставляем висеть, мысль возвращается в поле
      if (!opened) throw Object.assign(new Error('all_failed'), { code: 'server' })
      setItems(prev => prev.map(x => x.status === 'pending' ? { ...x, status: 'failed', error: failLine(x.format) } : x))
    } catch (e: any) {
      if (e?.name === 'AbortError') return // человек ушел «Назад»: сервер доделает и сохранит сам
      const msg = friendly(e?.code || (/fetch|network|load failed/i.test(String(e?.message)) ? 'network' : ''), e?.msg)
      // готовые форматы уже на экране и в базе: при сбое после них не уходим в поле, помечаем недописанные
      track('error_shown', { code: String(e?.code || 'server'), screen: 'make' })
      if (!append && !opened) {
        if (['sample_closed', 'sample_failed', 'sample_empty'].includes(String(e?.code || ''))) setAskSampleText(true)
        setView('compose'); setError(msg)
      }
      else setItems(prev => prev.map(x => x.status === 'pending' ? { ...x, status: 'failed', error: msg } : x))
    } finally {
      // поток закончился здесь же (готово, сбой или «Назад»): ждать после обновления нечего
      if (!append) markRun(null)
      refreshMe?.() // остаток текстов в меню и на «Написать»
      if (abortRef.current === ac) { abortRef.current = null; setBusy(false) }
    }
  }, [router, refreshMe])

  const submit = (s: ComposerSubmit) => {
    lastSubmit.current = s
    setError(null)
    if (s.sozhe) { submitSample(s); return }
    const topic = s.text.length > 120 ? s.text.slice(0, 120).replace(/\s+\S*$/, '') : s.text
    setThought(topic)
    // ситуация дня из плана (подсказка под темой) идет деталью, пока в поле тема этого дня
    const sit = s.situaciya || (plan?.situaciya && s.text.trim() === initialTopic.trim() ? plan.situaciya : '')
    runGroup({ topic, userDetail: sit ? `${s.text}\n${sit}` : s.text, goal: s.goal, mode: s.mode, voice: s.voice, ...(s.zh6 ? { zh6: s.zh6 } : {}) }, s.formats, false)
  }

  // «Написать по образцу»: скриншоты уменьшаем в браузере (до 1280 px, JPEG), оригинал на сервере только в памяти запроса
  const submitSample = async (s: ComposerSubmit) => {
    const sz = s.sozhe!
    let sample: Record<string, unknown>
    if (sz.kind === 'screens') {
      setBusy(true)
      try { sample = { kind: 'screens', images: await Promise.all(sz.files.slice(0, 10).map(f => shrinkImage(f))) } }
      catch { setBusy(false); setError('Не получилось прочитать скриншоты. Попробуй другие или вставь текст поста'); return }
    } else if (sz.kind === 'text') sample = { kind: 'text', text: sz.text }
    else sample = { kind: 'link', url: sz.url }
    // мысль из главного поля тоже годится как «О чем у тебя?», если отдельно не написана
    const about = (s.about || s.text || '').trim()
    setThought(about || 'По образцу')
    runGroup({ topic: about.length > 120 ? about.slice(0, 120).replace(/\s+\S*$/, '') : about, userDetail: about || undefined, goal: s.goal, sample }, s.formats, false)
  }

  const current = items[active]
  const readyIds = items.filter(x => x.status === 'ready' && x.postId)
  const anchor = current?.postId ? current : readyIds[0]

  // еще формат из этой мысли: ядро берет сервер по id, правленый текст пересоберет ядро
  const addMore = (formats: MakeFormat[]) => {
    if (!anchor?.postId || !formats.length) return
    setAddOpen(false); setAddFormats([])
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
    for (const x of items) if (x.status === 'ready') track('material_take', { how: 'copy', format: normFormat(x.code), ...(x.postId ? { post: x.postId } : {}) })
    navigator.clipboard.writeText(all).then(() => showToast('Все скопировано')).catch(() => {})
  }
  const removeCurrent = async () => {
    if (!current?.postId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { showToast('Не получилось удалить. Попробуй еще раз'); return }
    const { error: e } = await supabase.from('generated_posts').delete().eq('id', current.postId).eq('user_id', user.id)
    setConfirmDelete(false)
    if (e) { showToast('Не получилось удалить. Попробуй еще раз'); return }
    const rest = items.filter((_, i) => i !== active)
    setItems(rest)
    setActive(0)
    if (!rest.length) { setView('compose'); router.replace('/dashboard/make') }
  }

  const backToCompose = () => {
    markRun(null); setResumed(false); resumeCancelled.current = true
    abortRef.current?.abort(); abortRef.current = null; setBusy(false)
    setView('compose'); setItems([]); setThought(''); setGroupId(null); setSampleInfo(null); setAskSampleText(false); setRestoreText('')
    setComposerKey(k => k + 1); router.replace('/dashboard/make')
    desk.reload() // ритм и «Еще не в блоге» с новыми текстами
  }

  const onTextChange = useCallback((t: string) => setFieldText(t), [])
  const pickFromPlan = useCallback((p: TopicPick) => setTake(prev => ({ pick: p, n: (prev?.n || 0) + 1 })), [])
  const subline = firstTime ? 'Одной мысли хватит на пост и карусель. Можно сказать голосом'
    : desk.plan?.today ? `День ${desk.plan.today.day} из ${desk.plan.total} по плану тем` : undefined

  // ---------- вид ----------
  // Поле ввода не размонтируется на время генерации: при ошибке ссылка, скриншоты и мысль на месте.
  // «Назад» из результата начинает с чистого поля (новый key)
  const composeView = (
    <div hidden={view !== 'compose'} className={PAD}>
      <div className="xl:flex xl:items-start xl:gap-10">
        <div className="min-w-0 lg:max-w-[704px] xl:w-[704px] xl:shrink-0">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl bg-brand-card border border-brand-border px-4 py-3 text-[15px] text-brand-text" role="alert">
              <p className="min-w-0 flex-1">{error}</p>
              <button type="button" onClick={() => setError(null)} aria-label="Закрыть" className="w-11 h-11 -m-2 flex items-center justify-center text-brand-muted cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
            </div>
          )}
          <Composer key={composerKey} firstTime={firstTime} topics={desk.topics} busy={busy} onSubmit={submit} askSampleText={askSampleText} onSampleCleared={() => setAskSampleText(false)}
            initialText={initialTopic || restoreText || seed} initialFormats={initialFormats} plan={plan} materials={materials} until={until} paymentsOn={!!me?.paymentsOn}
            subline={subline} take={take} onTextChange={onTextChange}
            below={
              <div className="space-y-6">
                {firstTime === false && <div className="xl:hidden"><RhythmStrip rhythm={desk.rhythm} /></div>}
                <InWork items={desk.inWork} firstTime={firstTime === true} onChanged={desk.reload} />
              </div>
            } />
        </div>
        <RightColumn rhythm={desk.rhythm} plan={desk.plan} onPick={pickFromPlan} current={fieldText} />
      </div>
    </div>
  )

  if (view === 'compose') return composeView

  if (view === 'progress') {
    const pend = items.find(x => x.status === 'pending')
    const doneN = items.filter(x => x.status !== 'pending').length
    const head = resumed ? RESUME.title
      : items.length === 1 ? `${cap(formatOne(items[0].format))} ${GOING[items[0].format] || 'пишется'} · около минуты`
      : pend ? `${cap(formatOne(pend.format))} ${GOING[pend.format] || 'пишется'} · ${Math.min(doneN + 1, items.length)} из ${items.length}`
      : `${items.length} ${pluralMaterial(items.length)} почти готовы`
    return (
      <>{composeView}
      <div className={PAD}>
        <div className="max-w-[704px]">
          <button type="button" onClick={backToCompose} className="h-11 -ml-2 pl-1 pr-2 inline-flex items-center text-[15px] text-brand-text-secondary cursor-pointer">
            <ChevronLeft className="w-5 h-5" />Назад
          </button>
          {thought && <p className="mt-1 text-[15px] leading-[22px] text-brand-muted break-words">{thought}</p>}
          <h1 className="mt-1 text-[22px] leading-7 lg:text-[26px] lg:leading-8 font-semibold text-brand-text" aria-live="polite">{head}</h1>
          {resumed && <p className="mt-1 text-[15px] leading-[22px] text-brand-text-secondary">{RESUME.line}</p>}
          <ul aria-live="polite" className="mt-4 divide-y divide-brand-border rounded-[20px] bg-brand-card shadow-[0_1px_2px_rgba(59,42,34,.05),0_8px_24px_rgba(59,42,34,.06)]">
            {items.map(x => {
              const Icon = ICON[x.format] || AlignLeft
              return (
                <li key={x.format} className="min-h-[52px] flex items-center gap-3 px-4">
                  <Icon className="w-5 h-5 text-brand-muted shrink-0" />
                  <span className="min-w-0 flex-1 text-[16px] text-brand-text">{formatLabel(x.format)}</span>
                  {x.status === 'pending' && <Loader2 className="w-5 h-5 text-brand-muted animate-spin" aria-label={GOING[x.format] || 'пишется'} />}
                  {x.status === 'ready' && <Check className="w-5 h-5 text-brand-accent" aria-label="Готово" />}
                  {x.status === 'failed' && <span className="text-[14px] text-brand-muted">сбой</span>}
                </li>
              )
            })}
          </ul>
          {!resumed && <p className="mt-3 text-[14px] text-brand-muted">Можно закрыть вкладку, текст сохранится в «Моих текстах»</p>}
        </div>
      </div>
      </>
    )
  }

  const failed = items.filter(x => x.status === 'failed')
  const missing = MAKE_FORMATS.filter(f => !items.some(x => x.format === f.id))
  const addSpend = materials && addFormats.length ? spendLine(materials, addFormats.length, until) : ''

  // вкладки форматов мысли (и в шапке режима фокуса карусели)
  const tabs = items.map((x, i) => ({ id: `${x.format}-${i}`, label: formatLabel(x.format), i }))
  const focusOpts = {
    title: thought,
    formats: tabs.map(t => ({ id: t.id, label: t.label })),
    activeFormat: tabs[active]?.id,
    onFormat: (id: string) => { const t = tabs.find(x => x.id === id); if (t) setActive(t.i) },
  }

  // «Еще из этой мысли»: чипы, нажатие отмечает, кнопка пишет (тратит тексты, поэтому не с одного касания)
  const moreFromThought = missing.length > 0 && anchor?.postId ? (
    <AsideCard title="Еще из этой мысли">
      <div className="flex flex-wrap gap-2">
        {missing.map(f => {
          const on = addFormats.includes(f.id)
          return (
            <button key={f.id} type="button" aria-pressed={on} disabled={busy} onClick={() => setAddFormats(on ? addFormats.filter(x => x !== f.id) : MAKE_FORMATS.map(m => m.id).filter(id => id === f.id || addFormats.includes(id)))}
              className={`h-11 px-4 inline-flex items-center gap-1.5 rounded-full text-[15px] font-medium text-brand-text cursor-pointer disabled:opacity-50 ${on ? 'bg-brand-soft border border-brand-text' : 'bg-white border border-brand-border hover:border-brand-text/40'}`}>
              {on ? <Check className="w-4 h-4 text-brand-accent" /> : <Plus className="w-4 h-4" />}{f.label}
            </button>
          )
        })}
      </div>
      {addFormats.length > 0 && (
        <div className="mt-3">
          <button type="button" disabled={busy} onClick={() => addMore(addFormats)}
            className="w-full sm:w-auto h-12 px-5 rounded-2xl bg-brand-accent text-white text-[15px] font-semibold hover:bg-brand-accent-hover cursor-pointer disabled:opacity-50">{makeButtonText(addFormats)}</button>
          {addSpend && <p className="mt-1.5 text-[13px] text-brand-muted">{addSpend}</p>}
        </div>
      )}
    </AsideCard>
  ) : null

  return (
    <>{composeView}
    <div className={`${PAD} max-lg:pt-0`}>
      {/* шапка: «Назад» и подтверждения (сохранено, скопировано) */}
      <div className="h-14 lg:h-11 flex items-center gap-2 max-lg:-mx-4 max-lg:px-4 max-lg:mb-3 max-lg:bg-brand-card max-lg:border-b max-lg:border-brand-border xl:max-w-[704px]">
        <button type="button" onClick={backToCompose} className="h-11 -ml-2 pl-1 pr-2 inline-flex items-center gap-0.5 text-[15px] font-medium text-brand-text cursor-pointer shrink-0">
          <ChevronLeft className="w-5 h-5" /><span className="lg:hidden">Назад</span><span className="hidden lg:inline">Новая мысль</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-[14px] text-brand-muted lg:hidden">{copiedTop ? '' : thought}</p>
        <span className="hidden lg:block flex-1" />
        {copiedTop ? (
          <span role="status" className="shrink-0 h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-accent text-white text-[14px] font-semibold"><Check className="w-4 h-4" />Скопировано</span>
        ) : groupId ? (
          <span className="hidden lg:inline-flex shrink-0 items-center gap-1.5 text-[14px] text-brand-text-secondary"><Check className="w-4 h-4 text-brand-accent" />Сохранено в «Моих текстах»</span>
        ) : null}
      </div>

      {/* вкладки форматов */}
      <div role="tablist" aria-label="Форматы" className="max-w-full overflow-x-auto [scrollbar-width:none]">
        <div className="inline-flex gap-1 p-1 rounded-full bg-brand-soft-2">
          {items.map((x, i) => (
            <button key={`${x.format}-${i}`} type="button" role="tab" id={`fmt-tab-${i}`} aria-controls="fmt-panel" aria-selected={i === active} onClick={() => setActive(i)}
              className={`h-11 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-full text-[15px] font-medium text-brand-text cursor-pointer ${i === active ? 'bg-brand-soft font-semibold' : 'hover:bg-brand-soft/60'}`}>
              {x.status === 'pending' && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-muted" />}
              {x.publishedAt && <Check className="w-3.5 h-3.5 text-brand-accent" aria-label="Опубликовано" />}
              {formatLabel(x.format)}
            </button>
          ))}
        </div>
      </div>

      {failed.length > 0 && items.some(x => x.status === 'ready') && (
        <p className="mt-3 text-[14px] text-brand-text-secondary xl:max-w-[704px]">{partialLine(failed.map(x => x.format))}</p>
      )}

      {sampleInfo && (
        <p className="mt-3 rounded-xl border border-brand-border px-3 py-2 text-[14px] text-brand-text xl:max-w-[704px]">
          {sampleInfo.clientStory ? 'В образце была история клиента. Взята только форма, без клиента' : 'Из образца взято устройство: прием и порядок. Слова, тема и примеры свои.'}
        </p>
      )}
      {current?.status === 'ready' && current.overlap && current.overlap.length > 0 && (
        <div className="mt-3 rounded-xl border border-brand-border px-3 py-2 text-[14px] text-brand-text xl:max-w-[704px]">
          <p>Эти места слишком похожи на образец, поправь своими словами:</p>
          <ul className="mt-1 list-disc pl-5 text-brand-text-secondary">{current.overlap.slice(0, 5).map((c, i) => <li key={i} className="break-words">«{c}»</li>)}</ul>
        </div>
      )}

      <div className="mt-4" role="tabpanel" id="fmt-panel" aria-labelledby={`fmt-tab-${active}`}>
        {current?.status === 'ready' && (
          <FormatPane key={current.postId || active} item={current}
            onChange={patch => setItems(prev => prev.map((x, i) => i === active ? { ...x, ...patch } : x))}
            onPublished={at => { setItems(prev => prev.map((x, i) => i === active ? { ...x, publishedAt: at } : x)); desk.reload() }}
            onCopied={() => { setCopiedTop(true); setTimeout(() => setCopiedTop(false), 2500) }}
            aside={moreFromThought}
            carouselFocus={focusOpts}
            onMoreOpenChange={() => setConfirmDelete(false)}
            moreContent={close => (
              <>
                {missing.length > 0 && (
                  <button type="button" onClick={() => { close(); setAddFormats([]); setAddOpen(true) }} disabled={busy || !anchor?.postId}
                    className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-40">Еще из этой мысли</button>
                )}
                {items.filter(x => x.status === 'ready').length > 1 && (
                  <button type="button" onClick={() => { copyAll(); close() }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Скопировать все</button>
                )}
                {/* удаление внизу, отделено чертой и красным (решение Арины 18.11: единственное разрушительное действие) */}
                <div className="mt-1 pt-1 border-t border-brand-border">
                {!confirmDelete ? (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="w-full h-[52px] text-left text-[16px] font-medium text-brand-danger cursor-pointer">Удалить {current ? formatOne(current.format) : ''}</button>
                ) : (
                  <div className="py-2">
                    <p className="text-[16px] text-brand-text">Удалить {current ? formatOne(current.format) : ''} насовсем? Остальные форматы останутся.</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { close(); removeCurrent() }} className="h-12 rounded-2xl bg-brand-text text-brand-bg font-semibold cursor-pointer">Удалить</button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className="h-12 rounded-2xl border border-brand-border text-brand-text font-semibold cursor-pointer">Оставить</button>
                    </div>
                  </div>
                )}
                </div>
              </>
            )} />
        )}
        {current?.status === 'pending' && (
          <div className="rounded-[20px] bg-brand-card p-6 flex items-center gap-3 text-brand-text-secondary xl:max-w-[704px]">
            <Loader2 className="w-5 h-5 animate-spin" />{cap(formatOne(current.format))} {GOING[current.format] || 'пишется'}
          </div>
        )}
        {current?.status === 'failed' && (
          <div className="rounded-[20px] bg-brand-card p-5 xl:max-w-[704px]">
            <p className="text-[15px] text-brand-text">{current.error || failLine(current.format)}</p>
            <button type="button" disabled={busy} onClick={() => retryFailed(current.format as MakeFormat)} className="mt-3 h-11 px-5 rounded-xl bg-brand-accent text-white font-semibold cursor-pointer disabled:opacity-50">Попробовать еще раз</button>
          </div>
        )}
      </div>

      {/* «Что написать еще?»: из листа «Еще» и по ссылке из «Моих текстов» (&more=1) */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Что написать еще?"
        footer={
          <div>
            <button type="button" disabled={!addFormats.length || busy} onClick={() => addMore(addFormats)} className="w-full h-[52px] rounded-2xl bg-brand-accent text-white font-semibold cursor-pointer disabled:opacity-40">{addFormats.length ? makeButtonText(addFormats) : 'Выбери, что написать'}</button>
            {addSpend && <p className="mt-1.5 text-center text-[13px] text-brand-muted">{addSpend}</p>}
          </div>
        }>
        <div className="flex flex-wrap gap-2 pt-1">
          {missing.map(f => {
            const on = addFormats.includes(f.id)
            return (
              <button key={f.id} type="button" aria-pressed={on} onClick={() => setAddFormats(on ? addFormats.filter(x => x !== f.id) : MAKE_FORMATS.map(m => m.id).filter(id => id === f.id || addFormats.includes(id)))}
                className={`h-11 px-4 inline-flex items-center gap-1.5 rounded-full text-[15px] font-medium text-brand-text cursor-pointer ${on ? 'bg-brand-soft border border-brand-text' : 'bg-white border border-brand-border'}`}>
                {on && <Check className="w-4 h-4 text-brand-accent" />}{f.label}
              </button>
            )
          })}
        </div>
      </BottomSheet>

      {toast && (
        <div aria-live="polite" className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-[calc(56px+env(safe-area-inset-bottom)+84px)] lg:bottom-[96px] px-4 py-2.5 rounded-xl bg-brand-text text-brand-bg text-[15px] shadow-lg">
          {toast}
        </div>
      )}
    </div>
    </>
  )
}
