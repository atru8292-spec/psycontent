'use client'

// «Сделать»: один экран создания вместо генераторов поста, карусели, Reels, сторис, хуков и рерайта
// (_знания/мозг-генератора/09-PUT-POLZOVATELYA.md, раздел 3). Старый адрес /dashboard/post-generator ведет сюда.

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  PenTool,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  CheckCircle,
  CalendarDays,
  ArrowRight,
  X,
} from 'lucide-react'
import Squiggle from '@/components/Squiggle'
import EmptyState from '@/components/EmptyState'
import { splitPostTitle } from '@/lib/post-format'
import { isArchetypeIncomplete } from '@/lib/profile-status'
import VoiceTextarea from '@/components/VoiceTextarea'
import CarouselDesigner from '@/components/CarouselDesigner'
import PostCover from '@/components/PostCover'
import ReelsScript from '@/components/ReelsScript'
import CaptionBlock, { splitCaption } from '@/components/CaptionBlock'
import { REELS_MODES } from '@/components/ReelsFormatPicker'
import { pickAsk, markShown, markDone, markDismissed, type AskKey } from '@/lib/voice-asks'
import MakeFlow from '@/components/make/MakeFlow'

// Форматы «Сделать». Текстовый пост бывает для Instagram и для Telegram, остальное под Instagram.
// Карусель и Reels пишет новый движок; без него ведем на старые страницы.
const FORMATS = [
  { id: 'post', label: 'Текстовый пост' },
  { id: 'carousel', label: 'Карусель' },
  { id: 'reels', label: 'Reels' },
  { id: 'stories', label: 'Сторис' },
]
const FORMAT_WORD: Record<string, string> = {
  post: 'пост', post_tg: 'пост для Telegram', carousel: 'карусель', stories: 'сторис',
  reels: 'сценарий Reels', reels_monolog: 'сценарий Reels', reels_spisok: 'сценарий Reels', reels_scenka: 'сценку для Reels',
  reels_rol: 'сценарий Reels', reels_doska: 'сценарий Reels', reels_bez_slov: 'сценарий Reels', reels_malysh: 'сценарий Reels',
  reels_otvet: 'сценарий Reels', reels_istoriya: 'сценарий Reels', reels_poslanie: 'сценарий Reels',
}
// Ошибки модели и сервера показываем человеческим текстом: что случилось и что сохранилось
function friendlyError(msg?: string): string {
  const m = String(msg || '')
  if (/^Достигнут предел генераций/.test(m)) return 'Пробные тексты закончились. Твой голос и темы я запомнила, они никуда не денутся. Скоро здесь можно будет выбрать тариф.'
  if (/^(Тема не указана|Не авторизован|Этот формат)/.test(m)) return m
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Пропала связь. Проверь интернет и нажми еще раз: тема и детали на месте.'
  return 'Текст не дописался. Сбой у нас, не у тебя: тема и детали на месте. Попробуй еще раз через минуту.'
}

const OLD_PAGES: Record<string, string> = { carousel: '/dashboard/carousel-generator', reels: '/dashboard/reels' }
// Подсказка к «твоей детали» под выбранное «что дать читателю»
const DETAIL_HINTS: Record<string, string> = {
  podderzhat: 'Что клиенты говорят тебе в такие моменты?',
  obyasnit: 'Как ты объясняешь это на сессии, своими словами?',
  razreshit: 'Что клиенты боятся себе разрешить?',
  kak_v_terapii: 'Как это обычно выглядит у тебя на сессии? Без имен и деталей клиента',
  skazat_chto_dumayu: 'Что тебя в этом бесит?',
  rassmeshit: 'Что в этой теме смешного, если по-честному?',
  pozvat: 'С чем к тебе стоит приходить и как попасть?',
}
const DETAIL_DEFAULT = 'Например: фантазии о цели дают ощущение, что ты уже что-то сделала, и делать дальше не хочется. Без имен клиентов'

const defaultPillars = [
  { id: 'edu', label: 'Психообразование', topics: ['Как тревога влияет на тело', 'Что такое психологические границы', 'Разница между депрессией и грустью', 'Почему мы саботируем успех', 'Как работает прокрастинация'] },
  { id: 'personal', label: 'Личное / Рефлексия', topics: ['Почему я выбрала эту профессию', 'Случай из практики (анонимно)', 'Что меня удивляет в клиентах', 'Мои ошибки как начинающего психолога', 'Что я думаю о ChatGPT в терапии'] },
  { id: 'practical', label: 'Практические советы', topics: ['3 техники при панической атаке', 'Как говорить о своих потребностях', 'Упражнение на заземление за 2 минуты', 'Как восстановиться после выгорания', 'Техника СТОП при сильных эмоциях'] },
  { id: 'stories_pillar', label: 'Истории клиентов', topics: ['До и после работы с тревогой', 'Как человек нашел себя после развода', 'История того, кто не верил в психологию', 'Как 3 сессии изменили взгляд на отношения', 'История преодоления выгорания'] },
  { id: 'positioning', label: 'Позиционирование', topics: ['Чем я отличаюсь от других психологов', 'С кем мне не по пути', 'Мой взгляд на быстрые результаты', 'Почему я против «гарантий» в психологии', 'Мои принципы работы'] },
]

// Новая генерация (мозг 3.4): что пост дает читателю. Коды совпадают с INTENT_BUTTONS в lib/generation/prompts.ts.
// Подпись под кнопкой объясняет, что получит читатель: без нее «разрешить» и «как в терапии» непонятны
const INTENT_CHIPS = [
  { id: 'podderzhat', label: 'Поддержать', hint: 'Чтобы стало легче: с тобой все нормально, так бывает у многих.' },
  { id: 'obyasnit', label: 'Объяснить, почему так', hint: 'Разобрать, откуда это берется, простыми словами и на примере из жизни.' },
  { id: 'razreshit', label: 'Снять вину', hint: 'Сказать, что можно отдыхать, злиться, не справляться, и это не делает человека плохим.' },
  { id: 'kak_v_terapii', label: 'Как это на консультации', hint: 'Что происходит у тебя на сессии с таким запросом. Без историй реальных клиентов.' },
  { id: 'skazat_chto_dumayu', label: 'Мое мнение', hint: 'С чем ты не согласна: популярный совет, миф, то, что бесит.' },
  { id: 'rassmeshit', label: 'С юмором', hint: 'Смешно и узнаваемо, чтобы захотелось переслать подруге.' },
  { id: 'pozvat', label: 'Позвать на консультацию', hint: 'С чем к тебе прийти, что будет на первой встрече и как записаться. Без давления.' },
]
const ADJUST_BUTTONS = ['теплее', 'короче', 'живее', 'без клише']
const PLACEHOLDER_RE = /\[добавь:[^\]]*\]/g
const NOT_LIKE_REASONS = ['слишком умно', 'слишком сладко', 'не мои слова', 'длинно', 'не та тема']

// Обучение голосу: помощники для правок и подсветки (08-GOLOS-I-OBUCHENIE.md)
const splitSentences = (t: string) => t.split(/(?<=[.!?…])\s+|\n+/u).map(x => x.trim()).filter(Boolean)
function changedSentences(before: string, after: string): Set<string> {
  const b = new Set(splitSentences(before))
  return new Set(splitSentences(after).filter(x => !b.has(x)))
}
// Замена первой строки материала (заход), служебную метку «Экран 1:» сохраняем
function replaceFirstLine(text: string, line: string): string {
  const lines = text.split('\n')
  const i = lines.findIndex(l => l.trim())
  if (i < 0) return text
  const m = lines[i].match(/^(\s*\[?(?:Слайд|Экран)\s*\d+\]?\s*:?\s*)/i)
  lines[i] = (m ? m[1] : '') + line
  return lines.join('\n')
}
function withMarks(para: string, marks: Set<string>) {
  if (!marks.size) return para
  return para.split(/(?<=[.!?…])(\s+)/u).map((part, i) =>
    marks.has(part.trim()) ? <mark key={i} className="bg-brand-soft text-brand-text rounded px-0.5">{part}</mark> : <span key={i}>{part}</span>
  )
}
const sendVoiceEvent = (payload: Record<string, unknown>) =>
  fetch('/api/voice-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})

// Первый пост: сырые мысли психолога из практики (от первого лица, сцена),
// не темы-рубрики и не клиентские жалобы. Затравки из нашего ресерча (Пары 2/3 демо).
const SEED_THOUGHTS = [
  'ко мне приходят со словами «со мной что-то не так»',
  'мамы винят себя за крик, хотя дело не в крике',
  'клиент молчит, и это тоже работа',
]
const FIRST_PLACEHOLDER = 'клиенты на первой встрече извиняются, что занимают мое время'

// Тема для авто-генерации первого поста после экспресса: мысль из демо (seed),
// иначе первая фраза боли клиента (узнавание-материал), иначе ниша.
function deriveFirstTopic(profile: any, seed: string): string {
  const s = (seed || '').trim()
  if (s) return s
  const pain = String(profile?.client_pain_phrases || '').split('\n').map((x: string) => x.trim()).filter(Boolean)[0]
  if (pain) return pain
  if (profile?.one_niche) return String(profile.one_niche).slice(0, 140)
  const n = Array.isArray(profile?.niches) ? profile.niches[0] : ''
  if (n) return String(n)
  // даже если нишу и боль пропустили, подход всегда есть и шейпит стиль через getApproachContext
  return 'что для меня важно в работе с клиентами'
}

function MakeContent() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  // Новый мозг включен или нет, решает сервер (тот же isNewPipeline, что в генерации)
  const [serverNewGen, setServerNewGen] = useState<boolean | null>(null)
  const [meDone, setMeDone] = useState(false)
  useEffect(() => {
    let on = true
    fetch('/api/me').then(r => (r.ok ? r.json() : null))
      .then(j => { if (on && j && typeof j.newPipeline === 'boolean') setServerNewGen(j.newPipeline) })
      .catch(() => {})
      .finally(() => { if (on) setMeDone(true) })
    return () => { on = false }
  }, [])
  const [loading, setLoading] = useState(true)
  const [selectedFormat, setSelectedFormat] = useState('post')
  // Reels: «Подберу сама» по умолчанию. Юмор и «как на консультации» лучше заходят сценкой, остальное рассказом в камеру
  // вид Reels выбирает план (решение 30.09), из адреса можно передать конкретный вид
  const [reelsMode, setReelsMode] = useState<string>('reels')
  // текстовый пост: куда. В Telegram пишем глубже и длиннее, в Instagram короче и с обложкой
  const [postPlace, setPostPlace] = useState<'instagram' | 'telegram'>('instagram')
  const [detail, setDetail] = useState('')
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [lastTopic, setLastTopic] = useState('')
  const [lastIntent, setLastIntent] = useState<string | null>(null)
  const [published, setPublished] = useState(false)
  const [draftResult, setDraftResult] = useState(false) // результат из черновика: у него нет плана, кнопки «Поправить» не работают
  const [showIdeas, setShowIdeas] = useState(false)
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [customTopic, setCustomTopic] = useState('')
  const [useCustom, setUseCustom] = useState(true)
  
  const [fromPlan, setFromPlan] = useState(false)
  const [planPillar, setPlanPillar] = useState<string | null>(null)

  // Первый пост после онбординга: упрощенный композер, мысль из placeholder
  const [firstMode, setFirstMode] = useState(false)
  const [showRubrics, setShowRubrics] = useState(false)
  const platform = selectedFormat === 'post' && postPlace === 'telegram' ? 'telegram' : 'instagram'
  // Мысль, с которой человек пришел из демо на лендинге (localStorage seed)
  const [fromSeed, setFromSeed] = useState(false)
  // Авто-генерация первого поста после экспресса (?auto=1), один раз
  const [autoFired, setAutoFired] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  // Формат, которым собран текущий result (а не живой селектор): заголовок парсим по нему
  const [generatedFormat, setGeneratedFormat] = useState('post')
  const [error, setError] = useState<string | null>(null)
  // Новая генерация: смысл, вопрос психологу, фоновая проверка, кнопки «Поправить»
  const [intentButton, setIntentButton] = useState<string | null>(null)
  const [postId, setPostId] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [needDetail, setNeedDetail] = useState<string | null>(null)
  const [pendingPlan, setPendingPlan] = useState<any>(null)
  const [detailAnswer, setDetailAnswer] = useState('')
  const [adjusting, setAdjusting] = useState<string | null>(null)
  // Обучение голосу
  const [baseline, setBaseline] = useState<string | null>(null) // последняя версия от сервиса
  const [editing, setEditing] = useState(false)
  const [improved, setImproved] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<Set<string>>(new Set())
  const [genericPhrase, setGenericPhrase] = useState<string | null>(null)
  const [reaction, setReaction] = useState<'mine' | 'not_like' | null>(null)
  const [notLikeOpen, setNotLikeOpen] = useState(false)
  const [notLikeReasons, setNotLikeReasons] = useState<string[]>([])
  const [notLikeNote, setNotLikeNote] = useState('')
  const [hooks, setHooks] = useState<{ hook_type: string; text: string; why: string }[] | null>(null)
  const [hooksLoading, setHooksLoading] = useState(false)
  const [askAnswer, setAskAnswer] = useState('')
  const [askSent, setAskSent] = useState<string | null>(null)
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({})
  const [lastReported, setLastReported] = useState<string | null>(null)
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  // Частота полосы-предложения: счетчик постов и точка последнего «Позже» (localStorage,
  // переживает перезагрузку). Показ после 1-го поста, затем пауза 3 поста после каждого
  // «Позже», и так пока профиль неполный (заполнил профиль -> полоса исчезает сама).
  const [postCount, setPostCount] = useState(0)
  const [voiceDismissAt, setVoiceDismissAt] = useState<number | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const topic = searchParams.get('topic')
    const format = searchParams.get('format')
    const pillar = searchParams.get('pillar')
    const isFromPlan = searchParams.get('fromPlan') === 'true' || !!(topic && format)

    if (topic) {
      setCustomTopic(topic)
      setUseCustom(true)
      setSelectedTopic(null)
      setSelectedPillar(null)
    }

    if (format && ['post', 'stories', 'carousel', 'reels'].includes(format)) setSelectedFormat(format)
    if (format && REELS_MODES.some(m => m.id === format) && format !== 'reels') { setSelectedFormat('reels'); setReelsMode(format) }
    if (format === 'post_tg') { setSelectedFormat('post'); setPostPlace('telegram') }

    if (pillar) {
      setPlanPillar(pillar)
    }

    if (isFromPlan) {
      setFromPlan(true)
    }

    // Первый пост после онбординга: упрощенный композер, поле пустое (мысль в placeholder)
    if (searchParams.get('first') === '1') {
      setFirstMode(true)
      setUseCustom(true)
      setSelectedFormat('post')
    }
  }, [searchParams])

  // Мысль из демо-перехвата на лендинге (localStorage, TTL 24ч). Удаляем только
  // после успешной генерации (см. handleGenerate), чтобы при server_error не потерять.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('psycont_seed_thought')
      if (!raw) return
      const { text, ts } = JSON.parse(raw)
      if (text && typeof ts === 'number' && Date.now() - ts < 24 * 3600 * 1000) {
        setCustomTopic(String(text))
        setUseCustom(true)
        setSelectedFormat('post')
        setFromSeed(true)
        setFirstMode(true) // показать упрощенный композер и ярлык даже если пришли не через ?first=1
      } else {
        localStorage.removeItem('psycont_seed_thought')
      }
    } catch { /* localStorage недоступен, тихий фолбэк на пример и чипы */ }
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      setUser(user)

      const { data, error: profErr } = await supabase
        .from('onboarding_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      // PGRST116 = нет профиля -> короткий онбординг. Иной сбой чтения НЕ выкидываем.
      if (profErr && profErr.code === 'PGRST116') { router.push('/onboarding/express'); return }
      if (data) {
        setProfile(data)
      }

      // Счетчики частоты полосы-предложения
      try {
        const pc = parseInt(localStorage.getItem('psycont_post_count') || '0', 10)
        if (!Number.isNaN(pc)) setPostCount(pc)
        const d = localStorage.getItem('psycont_voice_offer_dismiss')
        setVoiceDismissAt(d != null ? parseInt(d, 10) : null)
      } catch { /* localStorage недоступен, полоса покажется по дефолту */ }

      setLoading(false)
    }
    init()
  }, [router])

  const currentPillar = defaultPillars.find(p => p.id === selectedPillar)
  const hasDraft = draftOpen && draftText.trim().length >= 60
  const canGenerate = selectedFormat && ((useCustom ? customTopic.trim() : selectedTopic) || hasDraft)
  // Заголовок-вывеска отделяется от тела (как в демо). Для сторис и старых постов
  // без структуры title будет null, рендерим тело целиком.
  const parsedPost = result ? splitPostTitle(result, generatedFormat) : null
  const newGen = serverNewGen ?? (profile?.new_pipeline === true || process.env.NEXT_PUBLIC_NEW_GENERATION_PIPELINE === 'all')
  const reelsFormat = reelsMode
  const formatCode = selectedFormat === 'reels' ? reelsFormat : selectedFormat === 'post' && postPlace === 'telegram' && newGen ? 'post_tg' : selectedFormat
  const placeholders = result ? (result.match(PLACEHOLDER_RE) || []) : []
  // Прилипающая полоса-приглашение пройти тест-архетип. Показываем тому, кто еще не
  // прошел тест, после первого поста, гарантированно видна пока читаешь пост.
  // Показ полосы: архетип не пройден + после 1-го поста, после «Позже» пауза 3 поста.
  // Лестница просьб про голос (новый движок): одна просьба за день, только после готового поста.
  const ownSamples = Array.isArray(profile?.voice_samples)
    ? profile.voice_samples.filter((x: any) => x?.fit !== false && x?.source !== 'live_voice').length : 0
  const currentAsk: AskKey | null = newGen && !!result && !generating && !checking && !editing && askSent === null
    ? pickAsk({ postCount, hasGenericPhrase: !!genericPhrase && !!result?.includes(genericPhrase), archetypeIncomplete: isArchetypeIncomplete(profile), ownSamples })
    : null
  const showVoiceBar = newGen
    ? currentAsk === 'archetype'
    : !!result && !generating && isArchetypeIncomplete(profile) &&
      (voiceDismissAt == null ? postCount >= 1 : postCount - voiceDismissAt >= 3)
  const dismissVoiceOffer = () => {
    if (newGen) { markDismissed(postCount); setAskSent('dismissed'); return }
    setVoiceDismissAt(postCount)
    try { localStorage.setItem('psycont_voice_offer_dismiss', String(postCount)) } catch {}
  }
  useEffect(() => { if (currentAsk) markShown(currentAsk) }, [currentAsk])
  // «Обновила твой голос: ...» показываем один раз после каждой пересборки
  useEffect(() => {
    const line = profile?.voice_change_line
    if (!line) return
    try { if (localStorage.getItem('psycont_voice_change_seen') !== line) setVoiceNote(line) } catch {}
  }, [profile])
  const dismissVoiceNote = () => {
    try { if (voiceNote) localStorage.setItem('psycont_voice_change_seen', voiceNote) } catch {}
    setVoiceNote(null)
  }

  // Сбросить все, что относится к прошлому результату
  const resetResult = () => {
    setResult(null)
    setError(null)
    setSaved(false)
    setChecking(false)
    setPostId(null)
    setPublished(false)
    setDraftResult(false)
    setBaseline(null); setEditing(false); setImproved(null); setHighlight(new Set()); setGenericPhrase(null)
    setReaction(null); setNotLikeOpen(false); setNotLikeReasons([]); setNotLikeNote(''); setHooks(null)
    setAskAnswer(''); setAskSent(null); setPlaceholderValues({}); setLastReported(null)
  }

  const countPost = () => setPostCount((c) => {
    const n = c + 1
    try { localStorage.setItem('psycont_post_count', String(n)) } catch {}
    return n
  })

  // «Есть свой черновик»: бывший рерайт. Ее текст сервер сам кладет в память голоса.
  const handleDraft = async () => {
    if (!user || generating || !hasDraft) return
    setGenerating(true)
    resetResult()
    setNeedDetail(null); setPendingPlan(null)
    const rewriteFormat = formatCode.startsWith('reels') ? 'reels' : formatCode === 'post_tg' ? 'post' : formatCode
    try {
      const r = await fetch('/api/rewrite-post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText: draftText.trim(), format: rewriteFormat }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Не получилось доработать черновик')
      setResult(data.post)
      setBaseline(data.post)
      if (data.postId) setPostId(data.postId)
      setGeneratedFormat(formatCode)
      setDraftResult(true)
      setLastTopic(customTopic.trim())
      setLastIntent(null)
      setSaved(true)
      countPost()
    } catch (err: any) {
      setError(friendlyError(err.message))
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerate = async (topicOverride?: string, extra?: { userDetail?: string; skipDetail?: boolean; format?: string; intent?: string | null }) => {
    // topicOverride используется авто-генерацией после экспресса (без тайминга стейта).
    // onClick кнопок передает event, поэтому строкой считаем только реальный string.
    const useOverride = typeof topicOverride === 'string' && topicOverride.trim().length > 0
    const topicVal = useOverride ? topicOverride.trim() : (useCustom ? customTopic : selectedTopic)
    if (!user || generating) return
    if (!selectedFormat || !topicVal || !String(topicVal).trim()) return
    const fmt = extra?.format || formatCode
    // Без нового движка карусель и Reels пишут старые страницы
    if (!newGen && (fmt === 'carousel' || fmt.startsWith('reels'))) {
      router.push(`${OLD_PAGES[fmt === 'carousel' ? 'carousel' : 'reels']}?topic=${encodeURIComponent(String(topicVal).trim())}&from=make`)
      return
    }
    setGenerating(true)
    resetResult()
    if (!extra?.userDetail && !extra?.skipDetail) { setNeedDetail(null); setPendingPlan(null); setDetailAnswer('') }
    const userDetail = extra?.userDetail || (newGen && detail.trim() ? detail.trim() : undefined)

    const isCustom = useOverride || useCustom
    const pillarLabel = planPillar || currentPillar?.label || 'Своя тема'

    try {
      const response = await fetch('/api/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          topic: isCustom ? undefined : selectedTopic,
          customTopic: isCustom ? topicVal : undefined,
          format: fmt,
          pillar: pillarLabel,
          platform,
          intent: extra?.intent || undefined,
          intentButton: newGen && !extra?.intent ? intentButton : undefined,
          userDetail,
          skipDetail: extra?.skipDetail,
          pendingPlan: extra?.userDetail || extra?.skipDetail ? pendingPlan : undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка генерации')

      // План просит деталь, которую знает только психолог: спрашиваем, текст пока не пишем
      if (data.needDetail) {
        setNeedDetail(data.needDetail)
        setPendingPlan(data.pendingPlan || null)
        return
      }
      setNeedDetail(null)
      setPendingPlan(null)
      setDetailAnswer('')
      setResult(data.post)
      setBaseline(data.post)
      if (data.postId) setPostId(data.postId)
      if (data.checking && data.postId) {
        setChecking(true)
        pollStatus(data.postId)
      }
      setGeneratedFormat(data.format || fmt)
      setLastTopic(String(topicVal).trim())
      setLastIntent(data.intent || null)
      // Счетчик постов для частоты полосы-предложения
      countPost()

      setSaved(true)

      // Мысль из демо использована, чистим seed (после успеха, не на чтении)
      if (fromSeed) {
        try { localStorage.removeItem('psycont_seed_thought') } catch {}
        setFromSeed(false)
      }

    } catch (err: any) {
      setError(friendlyError(err.message))
    } finally {
      setGenerating(false)
    }
  }

  // Фоновая проверка нового движка: ждем до полутора минут, подменяем текст, если его поправили
  const pollStatus = async (id: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const r = await fetch(`/api/generate-post/status?id=${encodeURIComponent(id)}`)
        if (!r.ok) break
        const d = await r.json()
        if (d.status === 'checking') continue
        if (d.status === 'ready') {
          if (d.genericPhrase) setGenericPhrase(d.genericPhrase)
          // Текст сам не меняем: предлагаем показать улучшенную версию
          if (d.changed && typeof d.post === 'string') setImproved(d.post)
        }
        break
      } catch { break }
    }
    setChecking(false)
  }

  const handleAdjust = async (action: string) => {
    if (!postId || !result || adjusting) return
    setAdjusting(action)
    setError(null)
    try {
      const r = await fetch('/api/generate-post/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action, text: result }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Не получилось поправить')
      if (typeof d.post === 'string') { setResult(d.post); setBaseline(d.post); setImproved(null); setHighlight(new Set()) }
    } catch (e: any) {
      setError(friendlyError(e.message))
    } finally {
      setAdjusting(null)
    }
  }

  // Показать версию после проверки: подсвечиваем, что поменялось
  const acceptImproved = () => {
    if (!improved || !result) return
    setHighlight(changedSentences(result, improved))
    setResult(improved)
    setBaseline(improved)
    setImproved(null)
  }

  const loadHooks = async () => {
    if (!postId || !result || hooksLoading) return
    setHooksLoading(true)
    try {
      const r = await fetch('/api/generate-post/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action: 'hooks', text: result }),
      })
      const d = await r.json()
      if (r.ok && Array.isArray(d.hooks)) setHooks(d.hooks)
    } catch {} finally { setHooksLoading(false) }
  }

  const pickHook = (h: { hook_type: string; text: string }) => {
    if (!result) return
    const firstLine = result.split('\n').find(l => l.trim()) || ''
    sendVoiceEvent({ action: 'hook_pick', postId, before: firstLine, after: h.text, hookType: h.hook_type })
    setResult(replaceFirstLine(result, h.text))
    // заход выбрала она, но написал сервис: в «было» тоже новый заход, чтобы правкой считалось только ее
    if (baseline) setBaseline(replaceFirstLine(baseline, h.text))
    setHooks(null)
  }

  const sendReaction = (kind: 'mine' | 'not_like') => {
    if (!postId) return
    setReaction(kind)
    setNotLikeOpen(false)
    sendVoiceEvent({ action: kind, postId, reasons: kind === 'not_like' ? notLikeReasons : [], note: kind === 'not_like' ? notLikeNote : '' })
  }

  const submitAsk = (key: AskKey) => {
    const answer = askAnswer.trim()
    if (!answer) return
    if (key === 'rephrase' && genericPhrase && result) {
      const next = result.split(genericPhrase).join(answer)
      setResult(next)
      // замена уже записана как «скажи по-своему», при копировании второй раз не считаем
      if (baseline) setBaseline(baseline.split(genericPhrase).join(answer))
      sendVoiceEvent({ action: 'rephrase', postId, before: genericPhrase, after: answer })
    }
    if (key === 'repeat') sendVoiceEvent({ action: 'repeat_phrases', text: answer })
    markDone(key)
    setAskSent(key)
    setAskAnswer('')
  }

  const fillPlaceholder = async (ph: string) => {
    const value = (placeholderValues[ph] || '').trim()
    if (!value || !result) return
    setResult(result.split(ph).join(value))
    // «как записаться» запоминаем в профиль, чтобы второй раз не спрашивать
    if (/запис|попаст/i.test(ph) && user) {
      try { await supabase.from('onboarding_profiles').update({ booking_info: value }).eq('user_id', user.id) } catch {}
    }
  }

  const markPublished = async () => {
    if (!postId || published) return
    setPublished(true)
    try {
      const r = await fetch('/api/generate-post/published', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId }) })
      if (!r.ok) setPublished(false)
    } catch { setPublished(false) }
  }

  // Тот же смысл в другой форме: тема и «что дать читателю» переносятся
  const repack = (target: string) => {
    if (!lastTopic) return
    if (target === 'reels') setSelectedFormat('reels')
    else setSelectedFormat(target)
    if (target === 'post') setPostPlace('instagram')
    const fmt = target === 'reels' ? reelsFormat : target
    setCustomTopic(lastTopic); setUseCustom(true)
    handleGenerate(lastTopic, { format: fmt, intent: lastIntent })
  }

  const handleCopy = () => {
    if (result && postId && baseline && lastReported !== result) {
      setLastReported(result)
      sendVoiceEvent({ action: 'copy', postId, generated: baseline, copied: result })
    }
    if (result) {
      navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Авто-генерация первого поста после экспресса (?auto=1): запускаем один раз,
  // когда профиль загружен. Тема из seed (демо) или выведена из профиля.
  useEffect(() => {
    if (searchParams.get('auto') !== '1') return
    if (serverNewGen === true) return // новый экран сам ведет первый пост, старую авто-генерацию не запускаем
    if (autoFired || loading || !user || !profile || generating || result) return
    const topic = deriveFirstTopic(profile, customTopic)
    if (!topic) return
    setAutoFired(true)
    // убираем auto из URL, чтобы F5 не запускал генерацию повторно (не тратил пробу)
    router.replace('/dashboard/make?first=1')
    if (!customTopic.trim()) { setCustomTopic(topic); setUseCustom(true) }
    handleGenerate(topic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFired, loading, user, profile, customTopic, generating, result, searchParams])

  const clearFromPlan = () => {
    setFromPlan(false)
    setPlanPillar(null)
    setCustomTopic('')
    setUseCustom(true)
    router.replace('/dashboard/make')
  }

  if (loading || !meDone) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  // Новый мозг: новый экран «Сделать» (задача sdelat-i-brend, раздел 3). Старый ниже остается без флага
  if (serverNewGen === true) return <MakeFlow />

  return (
    <div className="min-h-screen bg-brand-bg">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          {newGen ? <span /> : (
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад в кабинет
          </button>
          )}
          <div className="flex items-center gap-2">
            <Image src="/logo/out_wordmark.svg" alt="PsyCont" width={104} height={28} className="h-6 w-auto" />
          </div>
        </div>
      </nav>

      <div className={`max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12 ${showVoiceBar ? 'pb-40 sm:pb-24' : ''}`}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-10">
          <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <PenTool className="w-4 h-4" />
            Сделать
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-text mb-2">
            {firstMode ? 'Твоя первая мысль станет постом' : 'Что делаем?'}
          </h1>
          <Squiggle variant={0} width="60%" />
          <p className="text-brand-text-secondary mt-3">
            {firstMode
              ? 'Напиши или скажи мысль из практики, и я соберу из нее пост в твоем голосе'
              : 'Тема и формат, остальное по желанию. Пишу в твоем голосе'}
          </p>
        </motion.div>

        {fromPlan && customTopic && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-brand-soft border border-brand-border-soft rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                  <CalendarDays className="w-5 h-5 text-brand-sage" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-brand-text mb-1">
                    Тема из контент-плана
                  </p>
                  <p className="text-sm text-brand-text">{customTopic}</p>
                  {planPillar && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-brand-soft text-brand-accent text-xs font-medium rounded-full">
                      {planPillar}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={clearFromPlan}
                className="text-sm text-brand-sage hover:text-brand-text transition cursor-pointer"
              >
                Изменить тему
              </button>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          <div className="space-y-6">
            {firstMode && !showRubrics ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-brand-border p-5 sm:p-6 space-y-4">
                {fromSeed && (
                  <div>
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1">мысль, с которой ты пришел</p>
                    <p className="text-xs text-brand-muted">Ты написал ее на главной. Соберем пост из нее или поменяй на другую.</p>
                  </div>
                )}
                {/* Поле мысли: пример в placeholder, не значение. Голос работает */}
                <VoiceTextarea value={customTopic} onChange={setCustomTopic} placeholder={FIRST_PLACEHOLDER} minHeight={96} />

                {/* Затравки: пока своей мысли нет, либо «или начни с другого» при seed */}
                {(!customTopic.trim() || SEED_THOUGHTS.includes(customTopic.trim()) || fromSeed) && (
                  <div>
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-2">{fromSeed ? 'или начни с другого' : 'или начни с этого'}</p>
                    <div className="space-y-2">
                      {SEED_THOUGHTS.map(t => (
                        <button type="button" key={t} onClick={() => setCustomTopic(t)}
                          className="w-full text-left px-4 py-2.5 rounded-2xl bg-brand-bg border border-brand-border text-sm text-brand-text-secondary hover:border-brand-accent/40 hover:bg-brand-highlight hover:text-brand-text transition cursor-pointer">
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </motion.div>
            ) : (
            <>
            {/* Тема */}
            {!fromPlan && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl border border-brand-border p-5 sm:p-6 space-y-3">
                <h2 className="font-bold text-brand-text">О чем</h2>
                <VoiceTextarea value={customTopic} onChange={v => { setCustomTopic(v); setUseCustom(true) }} placeholder="Тема или мысль из практики, можно голосом" minHeight={72} />
                <button type="button" onClick={() => setShowIdeas(!showIdeas)} className="inline-flex items-center gap-1 text-sm text-brand-accent hover:underline cursor-pointer">
                  {showIdeas ? 'Скрыть подсказки' : 'Нет темы? Подскажу'}
                  <ChevronRight className={`w-4 h-4 transition-transform ${showIdeas ? 'rotate-90' : ''}`} />
                </button>
                <AnimatePresence>
                  {showIdeas && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-2">
                      {defaultPillars.map(pillar => (
                        <div key={pillar.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedPillar(selectedPillar === pillar.id ? null : pillar.id)}
                            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition cursor-pointer text-sm font-medium ${selectedPillar === pillar.id ? 'border-brand-accent bg-brand-highlight text-brand-text' : 'border-brand-border bg-brand-bg text-brand-text-secondary hover:border-brand-accent/50'}`}
                          >
                            {pillar.label}
                            <ChevronRight className={`w-4 h-4 transition-transform ${selectedPillar === pillar.id ? 'rotate-90' : ''}`} />
                          </button>
                          {selectedPillar === pillar.id && (
                            <div className="pl-3 pt-1 space-y-1">
                              {pillar.topics.map(topic => (
                                <button
                                  type="button"
                                  key={topic}
                                  onClick={() => { setCustomTopic(topic); setUseCustom(true); setShowIdeas(false) }}
                                  className="w-full text-left px-4 py-2 rounded-lg text-sm text-brand-text-secondary hover:bg-brand-highlight hover:text-brand-text transition cursor-pointer"
                                >
                                  {topic}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Формат */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-2xl border border-brand-border p-5 sm:p-6 space-y-3">
              <h2 className="font-bold text-brand-text">Что делаем</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FORMATS.map(f => (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() => setSelectedFormat(f.id)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition cursor-pointer ${selectedFormat === f.id ? 'border-brand-accent bg-brand-soft text-brand-text' : 'border-brand-border bg-brand-bg text-brand-text-secondary hover:border-brand-accent/50'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {selectedFormat === 'post' && newGen && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    {([['instagram', 'Instagram'], ['telegram', 'Telegram']] as const).map(([id, label]) => (
                      <button type="button" key={id} onClick={() => setPostPlace(id)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition cursor-pointer ${postPlace === id ? 'bg-brand-accent text-white border-brand-accent' : 'bg-white text-brand-text-secondary border-brand-border hover:border-brand-accent'}`}
                      >{label}</button>
                    ))}
                  </div>
                  <p className="text-xs text-brand-muted">{postPlace === 'telegram' ? 'Длиннее и глубже: в канале тебя уже читают, можно подробно и лично.' : 'Короче, первая строка цепляет. После текста предложу картинку-обложку.'}</p>
                </div>
              )}
              {selectedFormat === 'reels' && newGen && (
                <div className="space-y-1.5">
                  <p className="text-xs text-brand-muted">Формат подберу сама, а как снимать, подскажу вместе с текстом.</p>
                </div>
              )}
              {!newGen && (selectedFormat === 'carousel' || selectedFormat === 'reels') && (
                <p className="text-xs text-brand-muted">{selectedFormat === 'carousel' ? 'Карусель' : 'Reels'} пока собирается на отдельной странице, кнопка ниже откроет ее.</p>
              )}
            </motion.div>
            </>
            )}

            {/* Что дать читателю (новый движок). До первого поста без настроек */}
            {newGen && !firstMode && (
              <div>
                <p className="text-sm font-semibold text-brand-text mb-2">Что дать читателю</p>
                <div className="flex flex-wrap gap-2">
                  {INTENT_CHIPS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setIntentButton(intentButton === c.id ? null : c.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition cursor-pointer ${intentButton === c.id ? 'bg-brand-accent text-white border-brand-accent' : 'bg-white text-brand-text-secondary border-brand-border hover:border-brand-accent'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-brand-muted mt-2">{(intentButton && INTENT_CHIPS.find(c => c.id === intentButton)?.hint) || 'Не выбрала, значит я решу сама по теме и по тому, что уже было в ленте.'}</p>
              </div>
            )}

            {/* Своя деталь: самый сильный рычаг против одинаковых текстов */}
            {newGen && !firstMode && (
              <div>
                <p className="text-sm font-semibold text-brand-text mb-1">Что ты хочешь сказать <span className="font-normal text-brand-muted">(по желанию)</span></p>
                <p className="text-xs text-brand-muted mb-1.5">Главная мысль своими словами или случай из практики. Если оставишь пустым, мысль придумаю сама.</p>
                <VoiceTextarea value={detail} onChange={setDetail} placeholder={(intentButton && DETAIL_HINTS[intentButton]) || DETAIL_DEFAULT} minHeight={64} />
              </div>
            )}

            {/* Свой черновик: бывший рерайт */}
            {!firstMode && (
              <div>
                <button type="button" onClick={() => setDraftOpen(!draftOpen)} className="text-sm text-brand-accent hover:underline cursor-pointer">
                  {draftOpen ? 'Без черновика' : 'Есть свой черновик? Доработаю его'}
                </button>
                {draftOpen && (
                  <div className="mt-2">
                    <VoiceTextarea value={draftText} onChange={setDraftText} placeholder="Вставь свой текст. Я сохраню твои слова и поправлю только то, что мешает" minHeight={140} />
                    {draftText.trim().length > 0 && draftText.trim().length < 60 && <p className="text-xs text-brand-muted mt-1">Нужно хотя бы пару предложений.</p>}
                  </div>
                )}
              </div>
            )}

            {/* Кнопка генерации */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={() => (hasDraft ? handleDraft() : handleGenerate())}
              disabled={!canGenerate || generating}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-base font-semibold transition cursor-pointer ${canGenerate && !generating ? 'bg-brand-accent text-white hover:bg-brand-accent-hover shadow-lg shadow-brand-accent/25' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              {generating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> {firstMode ? 'Собираю пост в твоем голосе' : 'Пишу'}</>
              ) : (
                <><Sparkles className="w-5 h-5" /> {firstMode ? 'Собрать пост' : hasDraft ? 'Доработать черновик' : !newGen && OLD_PAGES[selectedFormat] ? `Открыть ${selectedFormat === 'carousel' ? 'карусели' : 'Reels'}` : 'Сделать'}</>
              )}
            </motion.button>

            {firstMode && !showRubrics && (
              <button type="button" onClick={() => setShowRubrics(true)} className="w-full text-center text-sm text-brand-muted hover:text-brand-text transition cursor-pointer">
                Или выбрать тему по рубрикам
              </button>
            )}
            {firstMode && showRubrics && (
              <button type="button" onClick={() => setShowRubrics(false)} className="w-full text-center text-sm text-brand-muted hover:text-brand-text transition cursor-pointer">
                Вернуться к своей мысли
              </button>
            )}
          </div>

          {/* Результат */}
          <div>
            {voiceNote && !generating && (
              <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3">
                <p className="text-sm text-brand-text">{voiceNote}</p>
                <button type="button" aria-label="Понятно" onClick={dismissVoiceNote} className="p-1 rounded-full text-brand-muted hover:text-brand-text cursor-pointer shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <AnimatePresence mode="wait">
              {needDetail && !generating && (
                <motion.div
                  key="need-detail"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-white rounded-2xl border border-brand-border p-5 sm:p-6"
                >
                  <p className="text-sm font-semibold text-brand-text">Чтобы пост был твоим, нужна одна деталь</p>
                  <p className="text-[15px] text-brand-text-secondary mt-2 leading-relaxed">{needDetail}</p>
                  <textarea
                    value={detailAnswer}
                    onChange={e => setDetailAnswer(e.target.value)}
                    rows={3}
                    placeholder="Пара предложений, своими словами"
                    className="w-full mt-3 px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent resize-none"
                  />
                  <div className="flex flex-col sm:flex-row gap-2 mt-3">
                    <button
                      type="button"
                      disabled={!detailAnswer.trim()}
                      onClick={() => handleGenerate(useCustom ? customTopic : undefined, { userDetail: detailAnswer.trim() })}
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${detailAnswer.trim() ? 'bg-brand-accent text-white hover:bg-brand-accent-hover' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                    >
                      Ответить
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerate(useCustom ? customTopic : undefined, { skipDetail: true })}
                      className="px-5 py-2.5 rounded-xl text-sm text-brand-text-secondary hover:text-brand-text hover:bg-brand-soft transition cursor-pointer"
                    >
                      Пропустить, напиши без нее
                    </button>
                  </div>
                </motion.div>
              )}

              {!result && !generating && !error && !needDetail && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <EmptyState
                    variant={0}
                    title={firstMode ? 'Твой пост появится здесь' : fromPlan ? 'Готово к записи' : 'Текст появится здесь'}
                    subtitle={firstMode
                      ? 'Впиши мысль слева или возьми затравку, и я соберу пост в твоем голосе.'
                      : fromPlan
                      ? 'Тема из твоего плана уже выбрана. Нажми «Сделать».'
                      : 'Напиши тему, выбери формат, и я напишу в твоем голосе.'}
                  />
                </motion.div>
              )}

              {generating && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border border-brand-border"
                >
                  <div className="flex items-center gap-1.5 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-sage animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-sage animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-sage animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <p className="font-semibold text-brand-text">Пишу {FORMAT_WORD[formatCode] || 'пост'} в твоем голосе</p>
                  <p className="text-sm text-brand-text-secondary mt-1">Обычно 10-20 секунд</p>
                </motion.div>
              )}

              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-6 bg-brand-soft border border-brand-border-soft rounded-2xl text-brand-text text-sm"
                >
                  {error}
                </motion.div>
              )}

              {result && !generating && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-brand-border overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-brand-border bg-brand-bg">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-sage" />
                      <span className="text-sm font-semibold text-brand-text">Готово!</span>
                      {saved && (
                        <span className="flex items-center gap-1 text-xs text-brand-accent bg-brand-soft px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Сохранено
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {postId && (
                        <button
                          onClick={() => { setEditing(!editing); setHighlight(new Set()) }}
                          className="flex items-center gap-1.5 text-xs text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-1.5 rounded-lg hover:bg-white"
                        >
                          {editing ? <><Check className="w-3.5 h-3.5" /> Готово</> : <><PenTool className="w-3.5 h-3.5" /> Править</>}
                        </button>
                      )}
                      <button
                        onClick={() => (hasDraft ? handleDraft() : handleGenerate())}
                        className="flex items-center gap-1.5 text-xs text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-1.5 rounded-lg hover:bg-white"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Переписать
                      </button>
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-accent hover:bg-brand-accent-hover transition cursor-pointer px-3 py-1.5 rounded-lg"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Скопировано!' : 'Копировать'}
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    {editing ? (
                      <textarea
                        value={result}
                        onChange={e => setResult(e.target.value)}
                        rows={Math.min(24, Math.max(8, result.split('\n').length + 2))}
                        className="w-full px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-accent resize-y"
                        autoFocus
                      />
                    ) : (<>
                    {parsedPost?.title && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ease: [0.22, 1, 0.36, 1] }}
                        className="mb-4"
                      >
                        <h3 className="text-lg sm:text-xl font-bold text-brand-text leading-snug">{parsedPost.title}</h3>
                        <Squiggle variant={0} width="140px" />
                      </motion.div>
                    )}
                    {generatedFormat.startsWith('reels') ? (
                      <ReelsScript text={result} format={generatedFormat} mark={t => withMarks(t, highlight)} />
                    ) : (
                    <div className="space-y-3">
                      {splitCaption(parsedPost?.body ?? result).body.split(/\n{2,}/).map((para, i) => (
                        <motion.p
                          key={i}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.08 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                          className="text-brand-text-secondary text-[15px] leading-relaxed whitespace-pre-wrap"
                        >
                          {withMarks(para, highlight)}
                        </motion.p>
                      ))}
                      <CaptionBlock caption={splitCaption(parsedPost?.body ?? result).caption} title={generatedFormat === 'carousel' ? 'Описание под каруселью' : 'Описание к публикации'} mark={t => withMarks(t, highlight)} />
                    </div>
                    )}
                    </>)}
                  </div>

                  {(checking || placeholders.length > 0 || postId) && (
                    <div className="px-4 sm:px-6 pb-3 space-y-3">
                      {checking && (
                        <p className="flex items-center gap-2 text-xs text-brand-muted">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Перечитываю текст, могу найти пару мест получше
                        </p>
                      )}

                      {improved && !checking && !editing && result === baseline && (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2">
                          <span>Нашла пару мест получше. Показать?</span>
                          <button type="button" onClick={acceptImproved} className="font-semibold text-brand-accent hover:underline cursor-pointer">Показать</button>
                          <button type="button" onClick={() => setImproved(null)} className="text-brand-muted hover:text-brand-text cursor-pointer">Оставить как есть</button>
                        </div>
                      )}

                      {placeholders.length > 0 && (
                        <div className="rounded-xl bg-brand-soft px-3 py-3 space-y-2">
                          <p className="text-xs text-brand-text">Тут нужно твое, я не стала выдумывать. Впиши, и я вставлю в текст:</p>
                          {Array.from(new Set(placeholders)).map(ph => (
                            <div key={ph} className="flex flex-col sm:flex-row gap-2">
                              <input
                                value={placeholderValues[ph] || ''}
                                onChange={e => setPlaceholderValues({ ...placeholderValues, [ph]: e.target.value })}
                                placeholder={ph.replace(/^\[добавь:\s*/, '').replace(/\]$/, '')}
                                className="flex-1 px-3 py-2 rounded-lg border border-brand-border bg-white text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent"
                              />
                              <button type="button" onClick={() => fillPlaceholder(ph)} className="px-3 py-2 rounded-lg text-sm font-semibold text-brand-accent border border-brand-accent/40 hover:bg-white cursor-pointer">Вставить</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Одна просьба про голос (лестница из 08-GOLOS-I-OBUCHENIE.md) */}
                      {(currentAsk === 'rephrase' || currentAsk === 'repeat') && (
                        <div className="rounded-xl border border-brand-border-soft bg-brand-bg px-3 py-3 space-y-2">
                          {currentAsk === 'rephrase' ? (
                            <p className="text-sm text-brand-text">Эта фраза звучит не как ты: <span className="font-semibold">«{genericPhrase}»</span>. Скажи ее по-своему, голосом или текстом, и я заменю.</p>
                          ) : (
                            <p className="text-sm text-brand-text">Что ты чаще всего повторяешь клиентам? Одна-две фразы, и я буду иногда вставлять их в посты.</p>
                          )}
                          <VoiceTextarea value={askAnswer} onChange={setAskAnswer} minHeight={80} placeholder={currentAsk === 'rephrase' ? 'Как бы ты сказала это клиенту' : 'Например: «ну вот правда»'} />
                          <div className="flex items-center gap-3">
                            <button type="button" disabled={!askAnswer.trim()} onClick={() => submitAsk(currentAsk)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${askAnswer.trim() ? 'bg-brand-accent text-white hover:bg-brand-accent-hover' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                              {currentAsk === 'rephrase' ? 'Заменить' : 'Сохранить'}
                            </button>
                            <button type="button" onClick={dismissVoiceOffer} className="text-sm text-brand-muted hover:text-brand-text cursor-pointer">Позже</button>
                          </div>
                        </div>
                      )}
                      {currentAsk === 'blog' && (
                        <div className="rounded-xl border border-brand-border-soft bg-brand-bg px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                          <p className="text-sm text-brand-text">Дай ссылку на свой канал или пару постов, и я услышу тебя точнее.</p>
                          <div className="flex items-center gap-3 shrink-0">
                            <button type="button" onClick={() => { markDone('blog'); router.push('/dashboard/voice') }} className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover cursor-pointer">Показать</button>
                            <button type="button" onClick={dismissVoiceOffer} className="text-sm text-brand-muted hover:text-brand-text cursor-pointer">Позже</button>
                          </div>
                        </div>
                      )}
                      {(askSent === 'rephrase' || askSent === 'repeat') && (
                        <p className="text-xs text-brand-muted">Запомнила. Дальше буду писать ближе к этому.</p>
                      )}

                      {newGen && postId && !checking && !draftResult && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {ADJUST_BUTTONS.map(b => (
                            <button
                              key={b}
                              type="button"
                              disabled={!!adjusting}
                              onClick={() => handleAdjust(b)}
                              className="px-3 py-1.5 rounded-full text-xs border border-brand-border text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent transition cursor-pointer disabled:opacity-50"
                            >
                              {adjusting === b ? 'Правлю…' : b.charAt(0).toUpperCase() + b.slice(1)}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={hooksLoading}
                            onClick={loadHooks}
                            className="px-3 py-1.5 rounded-full text-xs border border-brand-border text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent transition cursor-pointer disabled:opacity-50"
                          >
                            {hooksLoading ? 'Ищу…' : 'Другой заход'}
                          </button>
                        </div>
                      )}

                      {hooks && hooks.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-brand-muted">Выбери первую строку, я поставлю ее вместо текущей:</p>
                          {hooks.map((h, i) => (
                            <button key={i} type="button" onClick={() => pickHook(h)} className="w-full text-left px-3 py-2 rounded-xl border border-brand-border bg-white hover:border-brand-accent transition cursor-pointer">
                              <span className="block text-sm text-brand-text">{h.text}</span>
                              {h.why && <span className="block text-xs text-brand-muted mt-0.5">{h.why}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {postId && !checking && (
                        reaction ? (
                          <p className="text-xs text-brand-muted">{reaction === 'mine' ? 'Отлично, беру такие за образец.' : 'Поняла, учту в следующих постах.'}</p>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 text-xs">
                              <button type="button" onClick={() => sendReaction('mine')} className="text-brand-text-secondary hover:text-brand-accent cursor-pointer">Это мое</button>
                              <span className="text-brand-border">|</span>
                              <button type="button" onClick={() => setNotLikeOpen(!notLikeOpen)} className="text-brand-text-secondary hover:text-brand-accent cursor-pointer">Не похоже на меня</button>
                              <span className="text-brand-border">|</span>
                              <a href="/dashboard/voice" className="text-brand-text-secondary hover:text-brand-accent">Мат, эмоции, мой голос</a>
                            </div>
                            {notLikeOpen && (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  {NOT_LIKE_REASONS.map(r => (
                                    <button key={r} type="button"
                                      onClick={() => setNotLikeReasons(notLikeReasons.includes(r) ? notLikeReasons.filter(x => x !== r) : [...notLikeReasons, r])}
                                      className={`px-3 py-1 rounded-full text-xs border transition cursor-pointer ${notLikeReasons.includes(r) ? 'bg-brand-accent text-white border-brand-accent' : 'bg-white text-brand-text-secondary border-brand-border hover:border-brand-accent'}`}
                                    >{r}</button>
                                  ))}
                                </div>
                                <input value={notLikeNote} onChange={e => setNotLikeNote(e.target.value)} placeholder="Или своими словами, что не так" className="w-full px-3 py-2 rounded-lg border border-brand-border bg-white text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent" />
                                <button type="button" disabled={!notLikeReasons.length && !notLikeNote.trim()} onClick={() => sendReaction('not_like')} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-40 cursor-pointer">Отправить</button>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {postId && !checking && (
                    <div className="px-4 sm:px-6 pb-3 space-y-3">
                      {newGen && lastTopic && !draftResult && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-brand-muted">Сделать из этого:</span>
                          {FORMATS.filter(f => f.id !== (generatedFormat.startsWith('reels') ? 'reels' : generatedFormat === 'post_tg' ? '' : generatedFormat)).map(f => (
                            <button key={f.id} type="button" disabled={generating} onClick={() => repack(f.id)}
                              className="px-3 py-1.5 rounded-full text-xs border border-brand-border text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent transition cursor-pointer disabled:opacity-50"
                            >{f.id === 'post' ? (generatedFormat === 'post_tg' ? 'пост в instagram' : 'пост') : f.label.toLowerCase()}</button>
                          ))}
                        </div>
                      )}
                      <button type="button" onClick={markPublished} disabled={published}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${published ? 'border-brand-sage text-brand-text bg-brand-soft cursor-default' : 'border-brand-border text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent'}`}
                      >
                        {published ? <><Check className="w-3.5 h-3.5" /> Опубликовано</> : 'Опубликовала'}
                      </button>
                    </div>
                  )}

                  <div className="px-4 sm:px-6 pb-3 sm:pb-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-brand-text-secondary">{result.length} символов</p>
                    <div className="flex items-center gap-4">
                      {fromPlan && (
                        <button
                          onClick={() => router.push('/dashboard/content-plan')}
                          className="text-xs text-brand-accent hover:underline cursor-pointer"
                        >
                          ← К контент-плану
                        </button>
                      )}
                      <button
                        onClick={() => router.push('/dashboard/post-history')}
                        className="text-xs text-brand-accent hover:underline cursor-pointer"
                      >
                        Все материалы →
                      </button>
                    </div>
                  </div>

                  {firstMode && (
                    <div className="px-4 sm:px-6 pb-4 pt-1 border-t border-brand-border">
                      <p className="text-sm text-brand-text-secondary">
                        Готово. Дальше можно{' '}
                        <button onClick={() => router.push('/dashboard/content-plan')} className="text-brand-accent hover:underline cursor-pointer">собрать контент-план</button>
                        {' '}или{' '}
                        <button onClick={() => { resetResult(); setResult(null); setError(null); setSaved(false); setCustomTopic('') }} className="text-brand-accent hover:underline cursor-pointer">написать еще пост</button>.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Оформление карусели: стиль, слайды картинками, скачать */}
            {result && postId && !generating && !checking && !editing && generatedFormat === 'carousel' && (
              <CarouselDesigner postId={postId} text={result} onTextChange={setResult} />
            )}

            {/* Обложка к посту в Instagram: по картинке решают, читать ли. key: новый пост, новая обложка */}
            {result && postId && !generating && !checking && !editing && generatedFormat === 'post' && (
              <PostCover key={postId} postId={postId} text={result} />
            )}
          </div>
        </div>
      </div>

      {/* Прилипающая полоса-приглашение пройти тест-архетип (момент вау, гарантированно видна) */}
      <AnimatePresence>
        {showVoiceBar && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0, transition: { delay: 0, duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
            transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] lg:bottom-0 z-50 lg:pb-[env(safe-area-inset-bottom)] pointer-events-none"
          >
            <div className="max-w-6xl mx-auto px-0 sm:px-6 pointer-events-auto">
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6 bg-brand-soft border-t border-brand-border-soft sm:rounded-t-3xl sm:border sm:border-b-0 shadow-[0_-10px_30px_-12px_rgba(51,71,43,0.30)] px-4 sm:px-6 py-3 sm:py-4">
                <div className="min-w-0">
                  <p className="text-sm sm:text-[15px] font-semibold text-brand-text leading-snug">Хочешь, чтобы твои посты звучали еще ближе к тебе?</p>
                  <p className="hidden sm:block text-xs text-brand-muted mt-0.5">Короткий тест на семь минут покажет, какой ты автор. После него посты попадают прямо в твою манеру</p>
                </div>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 shrink-0">
                  <button
                    onClick={() => { if (newGen) markDone('archetype'); router.push('/onboarding/archetype') }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-accent text-white font-semibold text-sm hover:bg-brand-accent-hover active:scale-[0.98] transition cursor-pointer"
                  >
                    Пройти тест <ArrowRight className="w-4 h-4 hidden sm:inline" />
                  </button>
                  <button
                    onClick={dismissVoiceOffer}
                    aria-label="Позже"
                    title="Позже"
                    className="hidden sm:flex p-2 rounded-full text-brand-muted hover:text-brand-text hover:bg-white/60 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={dismissVoiceOffer}
                    className="sm:hidden text-sm text-brand-muted hover:text-brand-text transition cursor-pointer"
                  >
                    Позже
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function MakePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    }>
      <MakeContent />
    </Suspense>
  )
}
