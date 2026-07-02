'use client'

// Тест-распаковка «Какой ты автор» (этап 5). Определяет архетип автора по 10 ситуациям
// (тап-выбор) + собирает живой голос 3 открытыми. Итог кормит промпт генерации.
// Вовлечение: живой прогресс двумя группами, один вопрос на экран, мягкая микрореакция
// на выбор, автопереход с уважением, передышка с проблеском результата, момент сборки
// почерка в финале. Мобилка: h-[100dvh], вопрос и кнопка видны без прокрутки.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Mic, Check, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Squiggle from '@/components/Squiggle'
import { SITUATIONS, OPEN_QUESTIONS } from '@/lib/archetype-quiz'
import { computeArchetypes, type ArchetypeWeights } from '@/lib/archetype-score'
import { ARCHETYPES, ARCHETYPE_ACCENT, ARCHETYPE_CHANGES, archetypeLabel } from '@/lib/archetypes'
import { ArchetypeGlyph } from '@/lib/archetype-glyphs'

const EASE = [0.22, 1, 0.36, 1] as const
const SHADOW_REST = 'shadow-[0_1px_2px_rgba(46,42,69,0.04),0_8px_24px_rgba(46,42,69,0.05)]'
const SHADOW_HOVER = 'shadow-[0_4px_10px_-4px_rgba(46,42,69,0.12),0_20px_44px_-18px_rgba(46,42,69,0.22)]'

// Тексты около-экранные (микрокопи через copywriter-psycont). Вопросы в lib/archetype-quiz.
const T = {
  introTitle: 'Узнай свой архетип',
  introSub: 'У Мудреца одна и та же мысль выходит спокойным разбором «почему мы так устроены», у Шута она же звучит легко, через смех о тяжелом. Пройди тест, поймем твой, и посты будут собираться в этом голосе.',
  promise: 'Минут семь, любой вопрос можно пропустить, все по пути сохранится.',
  start: 'Начать',
  exit: 'Пока пропустить',
  breakTitle: 'Почти собрали. Осталось услышать тебя живьем',
  breakBody: 'Дальше три вопроса своими словами, выбирать ничего не надо. Отвечай как думаешь, ошибиться тут нельзя.',
  breakTeaser: 'Почерк уже почти сложился, осталось чуть-чуть',
  voicePlate: 'Можно наговорить голосом, печатать не обязательно',
  next: 'Дальше',
  skipPart: 'Пропустить эту часть',
  skipOne: 'Пропустить этот',
  toResult: 'К результату',
  micSoon: 'Наговорить голосом можно будет скоро. А пока просто напиши, как сказал бы вслух.',
  finishing: ['Собираем твой почерк', 'Смотрим, как ты думаешь и говоришь', 'Еще пара секунд, уже почти'],
  errorTitle: 'Тут запнулось на сборке. Твои ответы никуда не делись, попробуем собрать еще раз.',
  errorBtn: 'Собрать еще раз',
}

const LS_KEY = 'psycont_archetype_progress'
const SITU_COUNT = SITUATIONS.length // 10
const OPEN_COUNT = OPEN_QUESTIONS.length // 3

type Phase = 'intro' | 'situation' | 'break' | 'open' | 'finishing' | 'result'

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Кнопка «Назад»: контурная тихая, заметна как объект, но не спорит с аметистовой «Дальше».
function BackBtn({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`group inline-flex items-center gap-1.5 rounded-full border border-brand-border-soft/70 pl-2.5 pr-3.5 h-9 text-[13px] font-medium text-brand-muted bg-[#FDFBF7]/70 lg:bg-transparent hover:bg-brand-soft hover:text-brand-text hover:border-brand-soft active:scale-[0.97] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg ${className}`}
    >
      <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
      <span className="hidden min-[360px]:inline">Назад</span>
    </button>
  )
}

export default function ArchetypeTest() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('intro')
  const [sIdx, setSIdx] = useState(0)
  const [oIdx, setOIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({}) // situationId -> optionIndex
  const [openAnswers, setOpenAnswers] = useState<Record<string, string>>({})
  const [selecting, setSelecting] = useState<number | null>(null) // индекс варианта в момент микрореакции
  const [dir, setDir] = useState(1)
  const [micOpen, setMicOpen] = useState(false)
  const [finishLine, setFinishLine] = useState(0)
  const [saveError, setSaveError] = useState(false)
  const [finalResult, setFinalResult] = useState<ReturnType<typeof computeArchetypes> | null>(null)
  const [story, setStory] = useState('')
  const [storyState, setStoryState] = useState<'loading' | 'ok' | 'error'>('loading')
  const reduced = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Загрузка сохраненного прогресса + guard
  useEffect(() => {
    reduced.current = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/'); return }
    })
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s.answers) setAnswers(s.answers)
        if (s.openAnswers) setOpenAnswers(s.openAnswers)
      }
    } catch {}
  }, [router])

  const persist = useCallback((a: Record<string, number>, o: Record<string, string>) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ answers: a, openAnswers: o })) } catch {}
  }, [])

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    finishTimers.current.forEach(clearTimeout)
  }, [])

  // Частичный/полный подсчет архетипа
  const computeSelection = useCallback((upto?: number) => {
    const weights: ArchetypeWeights[] = []
    SITUATIONS.forEach((sit, i) => {
      if (upto != null && i >= upto) return
      const opt = answers[sit.id]
      if (opt != null) weights.push(sit.options[opt].weights)
    })
    return computeArchetypes(weights)
  }, [answers])

  const goNextFrom = (nextPhase: Phase) => { setDir(1); setPhase(nextPhase) }

  // Выбор варианта ситуации: микрореакция -> автопереход (или кнопка при reduced-motion)
  const selectOption = (optIdx: number) => {
    const sit = SITUATIONS[sIdx]
    const nextAnswers = { ...answers, [sit.id]: optIdx }
    setAnswers(nextAnswers)
    persist(nextAnswers, openAnswers)
    setSelecting(optIdx)
    if (reduced.current) return // покажем кнопку «Дальше», без авто
    advanceTimer.current = setTimeout(() => advanceSituation(), 520)
  }

  const advanceSituation = () => {
    setSelecting(null)
    if (sIdx < SITU_COUNT - 1) { setDir(1); setSIdx(sIdx + 1) }
    else goNextFrom('break')
  }

  const skipSituation = () => {
    setSelecting(null)
    if (sIdx < SITU_COUNT - 1) { setDir(1); setSIdx(sIdx + 1) }
    else goNextFrom('break')
  }

  const backSituation = () => {
    setSelecting(null)
    if (sIdx > 0) { setDir(-1); setSIdx(sIdx - 1) }
    else setPhase('intro')
  }

  const nextOpen = () => {
    setMicOpen(false)
    if (oIdx < OPEN_COUNT - 1) { setDir(1); setOIdx(oIdx + 1) }
    else finish()
  }

  const backOpen = () => {
    setMicOpen(false)
    if (oIdx > 0) { setDir(-1); setOIdx(oIdx - 1) }
    else setPhase('break')
  }

  const clearFinishTimers = () => { finishTimers.current.forEach(clearTimeout); finishTimers.current = [] }

  const finish = async () => {
    setSaveError(false)
    clearFinishTimers()
    goNextFrom('finishing')
    setFinishLine(0)
    finishTimers.current.push(setTimeout(() => setFinishLine(1), 800))
    finishTimers.current.push(setTimeout(() => setFinishLine(2), 1700))
    try {
      const result = computeSelection()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      // Различаем сбой чтения от «нет строки»: при СБОЕ чтения live_voice не трогаем,
      // чтобы разовый сбой не затер живой голос экспресс-юзера.
      const { data: prof, error: readErr } = await supabase
        .from('onboarding_profiles').select('live_voice').eq('user_id', user.id).maybeSingle()
      const payload: Record<string, unknown> = {
        // answers = сырые выборы (включая болевые в2/в6), храним рядом, чтобы не потерять данные
        archetype_scores: { selection: result.selection, top3: result.top3, percents: result.percents, answers },
        archetype_primary: result.selection.primary,
      }
      if (!readErr) {
        const openText = OPEN_QUESTIONS.map((q) => (openAnswers[q.id] || '').trim()).filter(Boolean)
        const appended = [prof?.live_voice, ...openText].filter(Boolean).join('\n\n')
        if (appended) payload.live_voice = appended
      }
      const { data: updated, error } = await supabase
        .from('onboarding_profiles').update(payload).eq('user_id', user.id).select('user_id')
      if (error) throw error
      if (!updated || updated.length === 0) throw new Error('no_profile_row') // нет строки -> не увозим молча
      try { localStorage.removeItem(LS_KEY) } catch {}
      setFinalResult(result)
      // История стартует СРАЗУ (пока идет сцена сборки ~1.4с), чтобы к показу карточки
      // текст уже был готов или почти готов, без ощущения паузы.
      fetchStory()
      finishTimers.current.push(setTimeout(() => { setPhase('result') }, 1400))
    } catch {
      clearFinishTimers()
      setSaveError(true)
    }
  }

  const fetchStory = async () => {
    setStoryState('loading')
    try {
      const res = await fetch('/api/archetype-story', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.story) throw new Error()
      setStory(data.story)
      setStoryState('ok')
    } catch { setStoryState('error') }
  }

  const restart = () => {
    setAnswers({}); setOpenAnswers({}); setSIdx(0); setOIdx(0)
    setFinalResult(null); setStory(''); setStoryState('loading'); setSelecting(null)
    try { localStorage.removeItem(LS_KEY) } catch {}
    setDir(1); setPhase('intro')
  }

  // ---- прогресс ----
  const situAnswered = SITUATIONS.filter((s) => answers[s.id] != null).length
  const openAnswered = OPEN_QUESTIONS.filter((q) => (openAnswers[q.id] || '').trim()).length

  function Progress() {
    const inOpen = phase === 'open' || phase === 'finishing'
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-[3px]">
          {SITUATIONS.map((_, i) => {
            const done = i < situAnswered || phase === 'break' || inOpen
            const now = phase === 'situation' && i === sIdx
            return <span key={`a${i}`} className={`h-[3px] rounded-full transition-all duration-300 ${now ? 'w-5 bg-brand-accent' : done ? 'w-3 bg-brand-accent' : 'w-3 bg-brand-text/15'}`} />
          })}
          <span className="w-2" />
          {OPEN_QUESTIONS.map((_, i) => {
            const done = inOpen && i < openAnswered
            const now = phase === 'open' && i === oIdx
            return <span key={`b${i}`} className={`h-[3px] rounded-full transition-all duration-300 ${now ? 'w-5 bg-brand-accent' : done ? 'w-3 bg-brand-accent' : 'w-3 bg-brand-text/15'}`} />
          })}
        </div>
        {phase === 'situation' && <span className="text-xs text-brand-muted">Ситуация {sIdx + 1} из {SITU_COUNT}</span>}
        {phase === 'open' && <span className="text-xs text-brand-muted">Своими словами, {oIdx + 1} из {OPEN_COUNT}</span>}
      </div>
    )
  }

  const stepVariants = {
    enter: (d: number) => ({ opacity: 0, x: reduced.current ? 0 : d * 16 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduced.current ? 0 : d * -16 }),
  }

  // ключ анимации шага
  const stepKey = phase === 'situation' ? `s${sIdx}` : phase === 'open' ? `o${oIdx}` : phase

  return (
    <div className="relative h-[100dvh] flex flex-col bg-brand-bg overflow-hidden">
      {/* Фон. Мобилка: два угловых пятна (как было). Десктоп (lg): глубина через свет,
          карточка парит в мягком лавандово-шалфейном свете, без росчерков на фоне. */}
      <div aria-hidden className="lg:hidden pointer-events-none absolute -top-32 -left-24 w-[380px] h-[380px] rounded-full bg-brand-soft/50 blur-[120px]" />
      <div aria-hidden className="lg:hidden pointer-events-none absolute -bottom-40 -right-28 w-[420px] h-[420px] rounded-full bg-brand-soft-2/60 blur-[130px]" />
      <div aria-hidden className="hidden lg:block pointer-events-none absolute top-[-6%] left-[-4%] w-[720px] h-[720px] rounded-full bg-brand-soft opacity-[0.60] blur-[150px]" />
      <div aria-hidden className="hidden lg:block pointer-events-none absolute bottom-[-10%] right-[-6%] w-[640px] h-[640px] rounded-full bg-brand-sage opacity-[0.10] blur-[160px]" />
      <div aria-hidden className="hidden lg:block pointer-events-none absolute top-[8%] right-[-2%] w-[420px] h-[420px] rounded-full bg-brand-soft-2 opacity-[0.45] blur-[150px]" />

      {/* ШАПКА */}
      {phase !== 'finishing' && phase !== 'result' && (
        <header className="relative z-10 shrink-0 h-14 flex items-center justify-between px-5 sm:px-6">
          <div className="w-24 lg:w-28 flex items-center">
            {(phase === 'situation' || phase === 'open') && (
              <BackBtn onClick={phase === 'situation' ? backSituation : backOpen} />
            )}
          </div>
          {(phase === 'situation' || phase === 'open') ? <Progress /> : <span />}
          <div className="w-24 lg:w-28 flex justify-end">
            {phase === 'situation' && (
              <button onClick={skipSituation} className="text-sm text-brand-muted hover:text-brand-text transition-colors cursor-pointer">Пропустить</button>
            )}
          </div>
        </header>
      )}

      {/* ТЕЛО */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
        <div className={`w-full max-w-[560px] mx-auto px-6 my-auto py-6 ${phase === 'result' ? 'lg:max-w-[920px]' : 'lg:max-w-[660px]'}`}>
          <div className={`lg:bg-[#FDFBF7] lg:rounded-[32px] lg:border lg:border-brand-border-soft/70 lg:py-11 lg:shadow-[0_2px_4px_rgba(46,42,69,0.03),0_24px_60px_-24px_rgba(46,42,69,0.16),0_8px_20px_-12px_rgba(91,79,160,0.10)] ${phase === 'result' ? 'lg:px-14' : 'lg:px-12'}`}>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={stepKey} custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.26, ease: EASE }}>

              {/* ИНТРО */}
              {phase === 'intro' && (
                <div className="text-center">
                  <div className="flex justify-center mb-5"><Squiggle variant={1} width="96px" /></div>
                  <h1 className="text-3xl sm:text-4xl lg:text-[44px] lg:leading-[1.08] font-bold text-brand-text tracking-[-0.02em] leading-[1.1]">{T.introTitle}</h1>
                  <div className="flex justify-center mt-2 mb-5"><Squiggle variant={2} width="150px" /></div>
                  <p className="text-[15px] sm:text-base lg:text-[17px] text-brand-muted leading-relaxed max-w-[420px] mx-auto">{T.introSub}</p>
                  <div className="mt-6 rounded-2xl bg-brand-soft border border-brand-border-soft px-5 py-4 text-sm text-brand-text/80 leading-relaxed">{T.promise}</div>
                </div>
              )}

              {/* СИТУАЦИЯ */}
              {phase === 'situation' && (() => {
                const sit = SITUATIONS[sIdx]
                const chosen = answers[sit.id]
                return (
                  <div>
                    <p className="text-xs lg:text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-sage mb-3">Ситуация</p>
                    <h2 className="text-xl sm:text-2xl lg:text-[28px] lg:leading-[1.25] font-semibold text-brand-text leading-snug mb-6 lg:mb-8">{sit.scene}</h2>
                    <div className="flex flex-col gap-3">
                      {sit.options.map((opt, i) => {
                        const isSel = selecting === i || (selecting === null && chosen === i)
                        const dimmed = selecting !== null && selecting !== i
                        return (
                          <button
                            key={i}
                            onClick={() => selectOption(i)}
                            className={`group relative text-left rounded-2xl border px-5 py-4 pl-6 lg:px-6 lg:py-[18px] lg:pl-7 transition-all duration-200 cursor-pointer ${SHADOW_REST} ${isSel ? 'bg-brand-soft border-brand-accent' : 'bg-[#FDFBF7] border-brand-border/70 hover:-translate-y-0.5 hover:border-brand-sage/50'} ${!isSel ? 'hover:' + SHADOW_HOVER : ''} ${dimmed ? 'opacity-55' : 'opacity-100'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg`}
                          >
                            <span className={`absolute left-2 top-4 bottom-4 w-[3px] rounded-full origin-center transition-all duration-200 ${isSel ? 'bg-brand-accent scale-y-100' : 'bg-brand-soft-2 scale-y-75'}`} />
                            <span className="block text-[15px] sm:text-[17px] lg:text-[18px] text-brand-text/90 leading-snug pr-6">{opt.text}</span>
                            {isSel && (
                              <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.22, ease: EASE }} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-sage">
                                <Check className="w-4 h-4" strokeWidth={2.4} />
                              </motion.span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    {reduced.current && chosen != null && (
                      <button onClick={advanceSituation} className="mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-brand-accent text-white font-semibold text-sm hover:bg-brand-accent-hover transition cursor-pointer">{T.next} <ArrowRight className="w-4 h-4" /></button>
                    )}
                  </div>
                )
              })()}

              {/* ПЕРЕДЫШКА */}
              {phase === 'break' && (
                <div className="text-center">
                  <div className="flex justify-center mb-5"><Squiggle variant={0} width="180px" /></div>
                  <h2 className="text-2xl lg:text-[30px] font-bold text-brand-text leading-snug mb-3">{T.breakTitle}</h2>
                  <p className="text-sm text-brand-accent font-medium mb-3">{T.breakTeaser}</p>
                  <p className="text-[15px] text-brand-muted leading-relaxed max-w-[440px] mx-auto mb-5">{T.breakBody}</p>
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-brand-soft border border-brand-border-soft px-4 py-2.5 text-sm text-brand-text/80">
                    <Mic className="w-4 h-4 text-brand-accent shrink-0" /> {T.voicePlate}
                  </div>
                </div>
              )}

              {/* ОТКРЫТЫЙ */}
              {phase === 'open' && (() => {
                const q = OPEN_QUESTIONS[oIdx]
                return (
                  <div>
                    <p className="text-xs lg:text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-sage mb-3">Своими словами</p>
                    <h2 className="text-xl sm:text-2xl lg:text-[28px] lg:leading-[1.25] font-semibold text-brand-text leading-snug mb-5">{q.prompt}</h2>
                    <div className="relative">
                      <textarea
                        value={openAnswers[q.id] || ''}
                        onChange={(e) => { const o = { ...openAnswers, [q.id]: e.target.value }; setOpenAnswers(o); persist(answers, o) }}
                        placeholder={q.placeholder}
                        className="w-full min-h-[140px] rounded-2xl bg-[#FDFBF7] border border-brand-border-soft p-4 pb-12 text-base text-brand-text leading-relaxed resize-none placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 transition"
                      />
                      <div className="absolute right-3 bottom-3">
                        <button onClick={() => setMicOpen((v) => !v)} aria-label="Голосовой ввод" className="w-9 h-9 rounded-full border border-brand-border-soft bg-white flex items-center justify-center text-brand-accent hover:bg-brand-soft transition cursor-pointer">
                          <Mic className="w-4 h-4" />
                        </button>
                        <AnimatePresence>
                          {micOpen && (
                            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }} className="absolute right-0 bottom-11 w-56 rounded-xl bg-brand-soft border border-brand-border-soft p-3 text-xs text-brand-text/80 leading-relaxed shadow-[0_10px_30px_-12px_rgba(91,79,160,0.35)]">
                              {T.micSoon}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* ФИНАЛ */}
              {phase === 'finishing' && (
                <div className="text-center py-10">
                  {!saveError ? (
                    <>
                      <div className="flex justify-center mb-6">
                        <motion.div animate={reduced.current ? {} : { rotate: [0, 4, -3, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
                          <Squiggle variant={1} width="140px" />
                        </motion.div>
                      </div>
                      <AnimatePresence mode="wait">
                        <motion.p key={finishLine} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }} className="text-lg text-brand-text font-medium">
                          {T.finishing[finishLine]}
                        </motion.p>
                      </AnimatePresence>
                      <Loader2 className="w-5 h-5 text-brand-accent/50 animate-spin mx-auto mt-5" />
                    </>
                  ) : (
                    <div className="max-w-[400px] mx-auto">
                      <p className="text-base text-brand-text leading-relaxed mb-5">{T.errorTitle}</p>
                      <button onClick={finish} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-brand-accent text-white font-semibold text-sm hover:bg-brand-accent-hover transition cursor-pointer">{T.errorBtn}</button>
                    </div>
                  )}
                </div>
              )}

              {/* КАРТОЧКА-РЕЗУЛЬТАТ (кульминация) */}
              {phase === 'result' && finalResult && finalResult.selection.primary && (() => {
                const sel = finalResult.selection
                const pk = sel.primary as keyof typeof ARCHETYPES
                const accent = ARCHETYPE_ACCENT[pk]
                const changes = ARCHETYPE_CHANGES[pk]
                // Абзац истории: выделяем ОДНУ ключевую фразу **...** аметистом
                const renderPara = (text: string) =>
                  text.split(/\*\*(.+?)\*\*/g).map((seg, i) =>
                    i % 2 === 1 ? <span key={i} className="font-semibold text-brand-accent">{seg}</span> : seg
                  )
                const paras = story.split('\n').map((p) => p.trim()).filter(Boolean)
                const glyph = (
                  <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }} className="relative mx-auto mb-5 w-[104px] h-[104px] lg:w-[120px] lg:h-[120px]">
                    <motion.div aria-hidden animate={reduced.current ? {} : { opacity: [0.5, 0.7, 0.5] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="absolute inset-[-14px] rounded-full blur-[22px]" style={{ backgroundColor: accent + '33' }} />
                    <div className="relative w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: accent + '14', boxShadow: `inset 0 0 0 1px ${accent}33, 0 8px 20px -8px ${accent}55` }}>
                      <div className="absolute inset-[10px] rounded-full" style={{ backgroundColor: '#FDFBF7', boxShadow: `inset 0 0 0 1px ${accent}22` }} />
                      <div className="absolute inset-[22px] rounded-full" style={{ background: `radial-gradient(120% 120% at 30% 25%, ${accent}26, ${accent}12)`, boxShadow: `inset 0 1px 2px ${accent}22` }} />
                      <div className="relative flex items-center justify-center" style={{ color: accent }}>
                        <ArchetypeGlyph k={pk} size={50} />
                      </div>
                    </div>
                  </motion.div>
                )
                return (
                  <div className="text-center">
                    <p className="text-xs lg:text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-sage mb-5">Твой авторский почерк</p>
                    <div className="lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-x-12 lg:items-start">
                      {/* ЛЕВАЯ КОЛОНКА: паспорт архетипа */}
                      <div className="lg:text-center">
                        {glyph}
                        <h1 className="text-3xl lg:text-[34px] font-bold text-brand-text tracking-[-0.02em] leading-[1.1]">{archetypeLabel(sel)}</h1>
                        <div className="flex justify-center mt-2 mb-3"><Squiggle variant={2} width="140px" /></div>
                        {!sel.flexible && <p className="text-[15px] lg:text-base text-brand-muted leading-relaxed max-w-[400px] mx-auto lg:mx-0 mb-7 lg:mb-6">{cap(ARCHETYPES[pk].gift)}</p>}
                        <div className="text-left max-w-[380px] lg:max-w-none mx-auto lg:mx-0 space-y-3 mb-8 lg:mb-0">
                          {finalResult.top3.map((t, i) => (
                            <div key={t.key}>
                              <div className="flex items-baseline justify-between mb-1.5">
                                <span className={i === 0 ? 'text-[15px] font-semibold text-brand-text' : 'text-sm text-brand-muted'}>{ARCHETYPES[t.key].name}</span>
                                <span className="text-xs text-brand-muted tabular-nums">{t.percent}</span>
                              </div>
                              <div className="h-2 rounded-full bg-brand-soft overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${t.percent}%` }} transition={{ duration: 0.6, delay: 0.2 + i * 0.1, ease: EASE }} className="h-full rounded-full" style={{ backgroundColor: ARCHETYPE_ACCENT[t.key] }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ПРАВАЯ КОЛОНКА: разбор */}
                      <div className="text-left lg:mt-1 mt-8">
                        <div className="mb-6">
                          {storyState === 'loading' && (
                            <div className="space-y-2.5">
                              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-3.5 rounded-full bg-brand-soft/70 animate-pulse" style={{ width: i === 4 ? '55%' : '100%' }} />)}
                            </div>
                          )}
                          {storyState === 'ok' && paras.map((p, i) => (
                            <p key={i} className={`${i === 0 ? 'text-[15px] lg:text-[17px] text-brand-text/90' : 'text-[15px] lg:text-[16px] text-brand-text/80'} leading-[1.7] ${i < paras.length - 1 ? 'mb-4' : ''}`}>{renderPara(p)}</p>
                          ))}
                          {storyState === 'error' && (
                            <div className="rounded-2xl bg-brand-soft border border-brand-border-soft p-4 text-center">
                              <p className="text-sm text-brand-muted mb-3">Разбор соберу через минуту, почерк уже сохранен.</p>
                              <button onClick={fetchStory} className="text-sm font-semibold text-brand-accent hover:text-brand-accent-hover transition cursor-pointer">Собрать разбор</button>
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl bg-brand-soft/60 border border-brand-border-soft p-5">
                          <p className="text-sm font-semibold text-brand-text mb-3">Что изменится в твоих постах</p>
                          <ul className="space-y-2">
                            {changes.map((c, i) => (
                              <li key={i} className="flex gap-2.5 text-[14px] text-brand-text/85 leading-snug">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-sage shrink-0" />
                                <span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </main>

      {/* ПАНЕЛЬ ДЕЙСТВИЙ */}
      {phase !== 'finishing' && (
        <footer className="relative z-10 shrink-0 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          <div className={`max-w-[560px] mx-auto flex flex-col items-center gap-2.5 ${phase === 'result' ? 'lg:max-w-[920px]' : 'lg:max-w-[660px]'}`}>
            {phase === 'intro' && (
              <>
                <button onClick={() => goNextFrom('situation')} className="w-full sm:w-auto sm:min-w-[220px] inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-brand-accent text-white font-semibold text-[15px] hover:bg-brand-accent-hover active:scale-[0.98] transition cursor-pointer">{T.start}</button>
                <button onClick={() => router.replace('/dashboard')} className="text-sm text-brand-muted/70 hover:text-brand-text transition-colors cursor-pointer">{T.exit}</button>
              </>
            )}
            {phase === 'break' && (
              <>
                <button onClick={() => goNextFrom('open')} className="w-full sm:w-auto sm:min-w-[220px] inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-brand-accent text-white font-semibold text-[15px] hover:bg-brand-accent-hover active:scale-[0.98] transition cursor-pointer">{T.next} <ArrowRight className="w-4 h-4" /></button>
                <button onClick={finish} className="text-sm text-brand-muted/70 hover:text-brand-text transition-colors cursor-pointer">{T.skipPart}</button>
              </>
            )}
            {phase === 'open' && (
              <>
                <button onClick={nextOpen} className="w-full sm:w-auto sm:min-w-[220px] inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-brand-accent text-white font-semibold text-[15px] hover:bg-brand-accent-hover active:scale-[0.98] transition cursor-pointer">{oIdx < OPEN_COUNT - 1 ? T.next : T.toResult} <ArrowRight className="w-4 h-4" /></button>
                <button onClick={nextOpen} className="text-sm text-brand-muted/70 hover:text-brand-text transition-colors cursor-pointer">{T.skipOne}</button>
              </>
            )}
            {phase === 'result' && (
              <>
                <button onClick={() => router.replace('/dashboard')} className="w-full sm:w-auto sm:min-w-[220px] inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-brand-accent text-white font-semibold text-[15px] hover:bg-brand-accent-hover active:scale-[0.98] transition cursor-pointer">Перейти к темам <ArrowRight className="w-4 h-4" /></button>
                <button onClick={restart} className="text-sm text-brand-muted/70 hover:text-brand-text transition-colors cursor-pointer">Пройти заново</button>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  )
}
