'use client'

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
  FileText,
  AlignLeft,
  ChevronRight,
  Lightbulb,
  CheckCircle,
  CalendarDays,
  Mic,
} from 'lucide-react'
import Squiggle from '@/components/Squiggle'
import EmptyState from '@/components/EmptyState'

// ============ УБРАНА КАРУСЕЛЬ ============
const formats = [
  { id: 'post', label: 'Пост', icon: AlignLeft, desc: 'Текстовый пост для Instagram/Telegram', color: 'text-brand-accent', bg: 'bg-brand-soft', border: 'border-brand-accent' },
  { id: 'stories', label: 'Stories', icon: FileText, desc: 'Серия из 4,5 историй', color: 'text-brand-accent', bg: 'bg-brand-soft', border: 'border-brand-accent' },
]

const defaultPillars = [
  { id: 'edu', label: 'Психообразование', topics: ['Как тревога влияет на тело', 'Что такое психологические границы', 'Разница между депрессией и грустью', 'Почему мы саботируем успех', 'Как работает прокрастинация'] },
  { id: 'personal', label: 'Личное / Рефлексия', topics: ['Почему я выбрала эту профессию', 'Случай из практики (анонимно)', 'Что меня удивляет в клиентах', 'Мои ошибки как начинающего психолога', 'Что я думаю о ChatGPT в терапии'] },
  { id: 'practical', label: 'Практические советы', topics: ['3 техники при панической атаке', 'Как говорить о своих потребностях', 'Упражнение на заземление за 2 минуты', 'Как восстановиться после выгорания', 'Техника СТОП при сильных эмоциях'] },
  { id: 'stories_pillar', label: 'Истории клиентов', topics: ['До и после работы с тревогой', 'Как человек нашел себя после развода', 'История того, кто не верил в психологию', 'Как 3 сессии изменили взгляд на отношения', 'История преодоления выгорания'] },
  { id: 'positioning', label: 'Позиционирование', topics: ['Чем я отличаюсь от других психологов', 'С кем мне не по пути', 'Мой взгляд на быстрые результаты', 'Почему я против «гарантий» в психологии', 'Мои принципы работы'] },
]

// Первый пост: сырые мысли психолога из практики (от первого лица, сцена),
// не темы-рубрики и не клиентские жалобы. Затравки, если своей мысли еще нет.
const SEED_THOUGHTS = [
  'многие приходят с одним запросом, а работаем совсем про другое',
  'люди стыдятся, что им нужна помощь, будто это слабость',
  'клиент молчит, и это тоже работа',
]
const FIRST_PLACEHOLDER = 'клиенты часто стыдятся плакать у меня на сессии'

function PostGeneratorContent() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFormat, setSelectedFormat] = useState('post')
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [customTopic, setCustomTopic] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  
  const [fromPlan, setFromPlan] = useState(false)
  const [planPillar, setPlanPillar] = useState<string | null>(null)

  // Первый пост после онбординга: упрощенный композер, мысль из placeholder
  const [firstMode, setFirstMode] = useState(false)
  const [showRubrics, setShowRubrics] = useState(false)
  const [platform, setPlatform] = useState<'instagram' | 'telegram'>('instagram')
  // Мысль, с которой человек пришел из демо на лендинге (localStorage seed)
  const [fromSeed, setFromSeed] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

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

    // Карусели теперь идут на отдельную страницу, здесь только post/stories
    if (format && ['post', 'stories', 'reels'].includes(format)) {
      setSelectedFormat(format === 'reels' ? 'post' : format)
    }

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
    } catch { /* localStorage недоступен — тихий фолбэк на пример+чипы */ }
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      setUser(user)

      const { data } = await supabase
        .from('onboarding_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!data) { router.push('/onboarding'); return }
      setProfile(data)

      // Дефолт площадки из профиля: только телеграм в platforms -> телеграм, иначе инстаграм
      const plats = (Array.isArray(data.platforms) ? data.platforms : []).map((p: string) => String(p).toLowerCase())
      const hasInsta = plats.some((p: string) => p.includes('insta') || p.includes('инстаг'))
      const hasTg = plats.some((p: string) => p.includes('tele') || p.includes('телег'))
      setPlatform(hasTg && !hasInsta ? 'telegram' : 'instagram')

      setLoading(false)
    }
    init()
  }, [router])

  const currentPillar = defaultPillars.find(p => p.id === selectedPillar)
  const canGenerate = selectedFormat && (useCustom ? customTopic.trim() : selectedTopic)

  const handleGenerate = async () => {
    if (!user || !canGenerate) return
    setGenerating(true)
    setResult(null)
    setError(null)
    setSaved(false)

    const topic = useCustom ? customTopic : selectedTopic
    const pillarLabel = planPillar || currentPillar?.label || 'Своя тема'

    try {
      const response = await fetch('/api/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          topic: useCustom ? undefined : selectedTopic,
          customTopic: useCustom ? customTopic : undefined,
          format: selectedFormat,
          pillar: pillarLabel,
          platform,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка генерации')
      
      setResult(data.post)

      setSaved(true)

      // Мысль из демо использована, чистим seed (после успеха, не на чтении)
      if (fromSeed) {
        try { localStorage.removeItem('psycont_seed_thought') } catch {}
        setFromSeed(false)
      }

    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const clearFromPlan = () => {
    setFromPlan(false)
    setPlanPillar(null)
    setCustomTopic('')
    setUseCustom(false)
    router.replace('/dashboard/post-generator')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад в кабинет
          </button>
          <div className="flex items-center gap-2">
            <Image src="/logo/out_wordmark.svg" alt="PsyCont" width={110} height={28} className="h-6 w-auto" />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-10">
          <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <PenTool className="w-4 h-4" />
            Генератор постов
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-text mb-2">
            {firstMode ? 'Твоя первая мысль станет постом' : 'Создайте пост в вашем голосе'}
          </h1>
          <Squiggle variant={0} width="60%" />
          <p className="text-brand-text-secondary mt-3">
            {firstMode
              ? 'Напиши или скажи мысль из практики, и я соберу из нее пост в твоем голосе'
              : 'AI учитывает ваш подход, тон и нишу, контент будет звучать как вы'}
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
                {/* Поле мысли: пример в placeholder, не значение */}
                <div className="relative">
                  <textarea
                    value={customTopic}
                    onChange={e => setCustomTopic(e.target.value)}
                    placeholder={FIRST_PLACEHOLDER}
                    rows={3}
                    autoFocus
                    className="w-full px-4 py-3.5 rounded-3xl bg-brand-soft text-brand-text text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-accent resize-none placeholder:text-brand-muted/60"
                  />
                  <button type="button" title="голосовой ввод скоро" className="absolute bottom-3 right-3 p-1.5 rounded-full text-brand-muted hover:text-brand-accent hover:bg-brand-soft transition cursor-pointer">
                    <Mic className="w-4 h-4" />
                  </button>
                </div>

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

                {/* Площадка: тихая подпись-переключатель, дефолт из профиля */}
                <div className="flex items-center gap-2 text-sm pt-1">
                  <span className="text-brand-muted">Соберу под</span>
                  <button type="button" onClick={() => setPlatform('instagram')} className={`transition cursor-pointer ${platform === 'instagram' ? 'font-semibold text-brand-accent' : 'text-brand-muted hover:text-brand-text'}`}>инстаграм</button>
                  <span className="text-brand-border">·</span>
                  <button type="button" onClick={() => setPlatform('telegram')} className={`transition cursor-pointer ${platform === 'telegram' ? 'font-semibold text-brand-accent' : 'text-brand-muted hover:text-brand-text'}`}>телеграм</button>
                </div>
              </motion.div>
            ) : (
            <>
            {/* Формат */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-bold text-brand-text mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-accent text-white text-xs flex items-center justify-center font-bold">1</span>
                Формат контента
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {formats.map(fmt => {
                  const Icon = fmt.icon
                  const active = selectedFormat === fmt.id
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`p-4 rounded-xl border-2 text-left transition cursor-pointer ${active ? `${fmt.border} ${fmt.bg}` : 'border-brand-border hover:border-gray-300 bg-brand-bg'}`}
                    >
                      <Icon className={`w-5 h-5 mb-2 ${active ? fmt.color : 'text-brand-text-secondary'}`} />
                      <p className={`font-semibold text-sm ${active ? 'text-brand-text' : 'text-brand-text-secondary'}`}>{fmt.label}</p>
                      <p className="text-sm text-brand-text-secondary mt-0.5">{fmt.desc}</p>
                    </button>
                  )
                })}
              </div>
              
              {/* Ссылка на генератор каруселей */}
              <div className="mt-4 pt-4 border-t border-brand-border">
                <button
                  onClick={() => router.push('/dashboard/carousel-generator')}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-brand-soft border border-brand-border-soft text-brand-text hover:bg-brand-soft/80 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">🎠 Нужна карусель?</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>

            {/* Тема */}
            {!fromPlan && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl border border-brand-border p-6">
                <h2 className="font-bold text-brand-text mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand-accent text-white text-xs flex items-center justify-center font-bold">2</span>
                  Тема поста
                </h2>

                <div className="space-y-2 mb-4">
                  {defaultPillars.map(pillar => (
                    <div key={pillar.id}>
                      <button
                        onClick={() => {
                          setSelectedPillar(selectedPillar === pillar.id ? null : pillar.id)
                          setUseCustom(false)
                          setSelectedTopic(null)
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition cursor-pointer text-sm font-medium ${selectedPillar === pillar.id ? 'border-brand-accent bg-brand-highlight text-brand-text' : 'border-brand-border bg-brand-bg text-brand-text-secondary hover:border-brand-accent/50'}`}
                      >
                        {pillar.label}
                        <ChevronRight className={`w-4 h-4 transition-transform ${selectedPillar === pillar.id ? 'rotate-90' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {selectedPillar === pillar.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pl-3 pt-2 space-y-1">
                              {pillar.topics.map(topic => (
                                <button
                                  key={topic}
                                  onClick={() => { setSelectedTopic(topic); setUseCustom(false) }}
                                  className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition cursor-pointer ${selectedTopic === topic && !useCustom ? 'bg-brand-accent text-white font-medium' : 'text-brand-text-secondary hover:bg-brand-highlight hover:text-brand-text'}`}
                                >
                                  {topic}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>

                <div className="border-t border-brand-border pt-4">
                  <button
                    onClick={() => { setUseCustom(!useCustom); setSelectedTopic(null); setSelectedPillar(null) }}
                    className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition cursor-pointer ${useCustom ? 'border-brand-accent bg-brand-highlight text-brand-text' : 'border-brand-border bg-brand-bg text-brand-text-secondary hover:border-brand-accent/50'}`}
                  >
                    <Lightbulb className="w-4 h-4" />
                    Своя тема
                  </button>
                  {useCustom && (
                    <textarea
                      value={customTopic}
                      onChange={e => setCustomTopic(e.target.value)}
                      placeholder="Напишите тему или идею поста..."
                      rows={2}
                      className="w-full mt-2 px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent resize-none"
                      autoFocus
                    />
                  )}
                </div>
              </motion.div>
            )}

            </>
            )}

            {/* Кнопка генерации */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-base font-semibold transition cursor-pointer ${canGenerate && !generating ? 'bg-brand-accent text-white hover:bg-brand-accent-hover shadow-lg shadow-brand-accent/25' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              {generating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> {firstMode ? 'Собираю пост в твоем голосе' : 'Генерирую...'}</>
              ) : (
                <><Sparkles className="w-5 h-5" /> {firstMode ? 'Собрать пост' : 'Сгенерировать'}</>
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
            <AnimatePresence mode="wait">
              {!result && !generating && !error && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <EmptyState
                    variant={0}
                    title={firstMode ? 'Твой пост появится здесь' : fromPlan ? 'Готово к записи' : 'Пост появится здесь'}
                    subtitle={firstMode
                      ? 'Впиши мысль слева или возьми затравку, и я соберу пост в твоем голосе.'
                      : fromPlan
                      ? 'Тема из вашего плана уже выбрана. Нажмите кнопку ниже, чтобы написать пост.'
                      : 'Выберите формат и тему слева, и AI напишет пост в вашем голосе.'}
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
                  <p className="font-semibold text-brand-text">Собираю пост в твоем голосе</p>
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
                      <button
                        onClick={handleGenerate}
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

                  <div className="p-6 space-y-3">
                    {result.split(/\n{2,}/).map((para, i) => (
                      <motion.p
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className="text-brand-text text-sm leading-relaxed whitespace-pre-wrap"
                      >
                        {para}
                      </motion.p>
                    ))}
                  </div>

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
                        История постов →
                      </button>
                    </div>
                  </div>

                  {firstMode && (
                    <div className="px-4 sm:px-6 pb-4 pt-1 border-t border-brand-border">
                      <p className="text-sm text-brand-text-secondary">
                        Готово. Дальше можно{' '}
                        <button onClick={() => router.push('/dashboard/content-plan')} className="text-brand-accent hover:underline cursor-pointer">собрать контент-план</button>
                        {' '}или{' '}
                        <button onClick={() => { setResult(null); setError(null); setSaved(false); setCustomTopic('') }} className="text-brand-accent hover:underline cursor-pointer">написать еще пост</button>.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PostGeneratorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    }>
      <PostGeneratorContent />
    </Suspense>
  )
}
