'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Mic } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Squiggle from '@/components/Squiggle'
import AuthModal from '@/components/AuthModal'

// ── Демо-контент (вымышленный психолог, заготовлено) ──
const THOUGHT = 'клиенты часто стыдятся плакать у меня на сессии'
const POST_TITLE = 'Плакать тут не стыдно'
const POST_BODY =
  'Почти каждый, кто впервые плачет на сессии, потом извиняется. Будто слезы это что-то, что надо быстро убрать со стола.\n\n' +
  'Я смотрю иначе. Слезы приходят, когда внутри стало достаточно безопасно, чтобы перестать держать оборону хотя бы на минуту.\n\n' +
  'Если рядом со мной вам захотелось плакать, значит, доверие уже началось. И мы уже работаем.'

const CONTEXT_NOTE =
  'Сохраним твою мысль и заведем кабинет. Сначала короткое знакомство, потом соберем из нее твой первый пост.'

const EASE_SOFT = [0.22, 1, 0.36, 1] as const
const EASE_MOVE = [0.45, 0, 0.25, 1] as const

// тело поста в токенах для пословного появления
const BODY_TOKENS: { w: string; br: boolean }[] = POST_BODY.split('\n\n').flatMap((p, pi) => {
  const words = p.split(' ').map((w) => ({ w, br: false }))
  return pi > 0 ? [{ w: '', br: true }, ...words] : words
})

type Mode = 'auto' | 'intercepting' | 'live'

export default function LandingDemo() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('auto')
  const [reduced, setReduced] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [typed, setTyped] = useState('')
  const [showCursor, setShowCursor] = useState(false)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [clicking, setClicking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [showPost, setShowPost] = useState(false)
  const [showTitle, setShowTitle] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [showCTA, setShowCTA] = useState(false)
  const [frozen, setFrozen] = useState(false)

  const [liveText, setLiveText] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [dismissedOnce, setDismissedOnce] = useState(false)

  const timers = useRef<number[]>([])
  const cyclesRef = useRef(0)
  const startedRef = useRef(false)
  const phaseRef = useRef(0)
  const submittingRef = useRef(false)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const postRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const clearAll = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
  }, [])
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  // финальная статичная композиция (reduced-motion и заморозка)
  const setFinalStatic = useCallback(() => {
    setTyped(THOUGHT)
    setShowCursor(false)
    setThinking(false)
    setShowPost(true)
    setShowTitle(true)
    setRevealed(BODY_TOKENS.length)
    setShowCTA(true)
    setFrozen(true)
    phaseRef.current = 11
  }, [])

  // печать мысли с джиттером
  const startTyping = useCallback(() => {
    phaseRef.current = 1
    const typeNext = (i: number) => {
      if (i >= THOUGHT.length) return
      setTyped(THOUGHT.slice(0, i + 1))
      const ch = THOUGHT[i]
      const base = 52
      const jitter = 14 + (i % 5) * 5 // детерминированный «джиттер» без Math.random
      const pause = ch === ',' || ch === '.' ? base + 240 : base + jitter
      after(pause, () => typeNext(i + 1))
    }
    typeNext(0)
  }, [])

  // пословный разворот тела поста
  const revealBody = useCallback(() => {
    phaseRef.current = 9
    const step = (i: number) => {
      if (i > BODY_TOKENS.length) return
      setRevealed(i)
      const tok = BODY_TOKENS[i - 1]
      const pause = tok && tok.br ? 220 : 58
      after(pause, () => step(i + 1))
    }
    step(1)
  }, [])

  const moveCursorToButton = useCallback(() => {
    phaseRef.current = 3
    const surface = surfaceRef.current
    const btn = buttonRef.current
    const field = fieldRef.current
    if (!surface || !btn) return
    const s = surface.getBoundingClientRect()
    // старт у конца поля
    if (field) {
      const f = field.getBoundingClientRect()
      setCursorPos({ x: f.right - s.left - 36, y: f.bottom - s.top - 18 })
    }
    setShowCursor(true)
    // едем к центру кнопки (через кадр, чтобы initial успел встать)
    after(60, () => {
      const b = btn.getBoundingClientRect()
      setCursorPos({ x: b.left - s.left + b.width / 2, y: b.top - s.top + b.height / 2 })
    })
  }, [])

  const doClick = useCallback(() => {
    phaseRef.current = 5
    setClicking(true)
    after(360, () => setClicking(false))
  }, [])

  const expandPost = useCallback(() => {
    phaseRef.current = 7
    setThinking(false)
    setShowCursor(false)
    setShowPost(true)
    if (isMobile) {
      after(120, () => postRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
  }, [isMobile])

  const runTimeline = useCallback(() => {
    clearAll()
    // сброс кадра
    setTyped('')
    setShowCursor(false)
    setClicking(false)
    setThinking(false)
    setShowPost(false)
    setShowTitle(false)
    setRevealed(0)
    setShowCTA(false)
    setFrozen(false)
    phaseRef.current = 0

    after(400, startTyping)
    after(3600, () => { phaseRef.current = 2 }) // чтение
    after(4300, moveCursorToButton)
    after(5300, doClick)
    after(5700, () => setThinking(true))
    after(6300, expandPost)
    after(6800, () => setShowTitle(true))
    after(7300, revealBody)
    after(11200, () => setShowCTA(true))
    after(16500, () => {
      // мягкий сброс или заморозка
      cyclesRef.current += 1
      if (cyclesRef.current < 2) {
        setShowPost(false)
        setShowTitle(false)
        setShowCTA(false)
        setRevealed(0)
        setTyped('')
        after(700, runTimeline)
      } else {
        setFrozen(true)
        phaseRef.current = 11
      }
    })
  }, [clearAll, startTyping, moveCursorToButton, doClick, expandPost, revealBody])

  // reduced-motion + мобилка (один раз)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mob = window.matchMedia('(max-width: 1023px)')
    setReduced(rm.matches)
    setIsMobile(mob.matches)
    const onMob = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mob.addEventListener('change', onMob)
    return () => mob.removeEventListener('change', onMob)
  }, [])

  // вьюпорт: старт по доскроллу, пауза при уходе
  useEffect(() => {
    if (reduced) { setFinalStatic(); return }
    const el = surfaceRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && mode === 'auto' && !startedRef.current && cyclesRef.current < 2) {
          startedRef.current = true
          runTimeline()
        } else if (!entry.isIntersecting && mode === 'auto' && !frozen) {
          clearAll()
          startedRef.current = false // при возврате во вьюпорт таймлайн стартует заново, не зависает на обрубке
        }
      },
      { threshold: 0.5 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [reduced, mode, frozen, runTimeline, clearAll, setFinalStatic])

  useEffect(() => () => clearAll(), [clearAll])

  // ── перехват в живой ввод ──
  const startIntercept = () => {
    if (mode !== 'auto') return
    clearAll()
    setMode('intercepting')
    setShowCursor(false)
    setShowPost(false)
    setThinking(false)
    after(280, () => {
      setMode('live')
      after(40, () => textareaRef.current?.focus())
    })
  }

  const showAgain = () => {
    if (mode !== 'auto') return
    cyclesRef.current = 0
    runTimeline()
  }

  const handleMakePost = () => {
    const text = liveText.trim().slice(0, 600)
    if (!text || submittingRef.current) return
    submittingRef.current = true
    // сохраняем мысль ДО любой навигации
    try {
      localStorage.setItem('psycont_seed_thought', JSON.stringify({ text, ts: Date.now() }))
    } catch { /* localStorage может быть недоступен, тихо */ }
    // залогиненный -> не в модалку, а по месту (профиль решает дальше)
    supabase.auth.getUser()
      .then(async ({ data }) => {
        if (data?.user) {
          const { data: prof } = await supabase
            .from('onboarding_profiles').select('user_id').eq('user_id', data.user.id).single()
          router.push(prof ? '/dashboard/post-generator' : '/onboarding')
        } else {
          setShowAuth(true)
        }
      })
      .catch(() => setShowAuth(true))
      .finally(() => { submittingRef.current = false })
  }

  const closeAuth = () => {
    setShowAuth(false)
    if (!dismissedOnce) setDismissedOnce(true)
  }

  // ── РЕНДЕР ──
  const caret = mode === 'auto' && phaseRef.current <= 2 && !reduced && !frozen
  const showChrome = mode === 'auto' || mode === 'intercepting'

  return (
    <section className="px-4 sm:px-6 py-14 sm:py-20">
      <div className="max-w-[1040px] mx-auto">
        {/* Заголовок секции */}
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-sm font-semibold text-brand-accent mb-2">Как это работает</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-text">
            Одна мысль вслух. И готовый пост в твоем голосе.
          </h2>
          <p className="text-sm text-brand-muted mt-3 max-w-xl mx-auto">
            Пример на вымышленном психологе. Твой пост соберется на твоей мысли после входа.
          </p>
        </div>

        {/* Рабочая поверхность */}
        <div ref={surfaceRef} className="relative grid grid-cols-1 lg:grid-cols-[40%_1fr] gap-6 lg:gap-10 items-start">
          {/* ЛЕВО: мысль */}
          <div>
            <p className="text-[11px] font-bold text-brand-muted uppercase tracking-widest mb-2">твоя мысль</p>

            {mode === 'live' ? (
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={liveText}
                  onChange={(e) => setLiveText(e.target.value.slice(0, 600))}
                  placeholder={THOUGHT}
                  rows={3}
                  className="w-full px-4 py-3.5 rounded-3xl bg-brand-soft text-brand-text text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-accent resize-none placeholder:text-brand-muted/60"
                />
                <button type="button" title="голосовой ввод скоро" className="absolute bottom-3 right-3 p-1.5 rounded-full text-brand-muted hover:text-brand-accent hover:bg-brand-bg transition cursor-pointer">
                  <Mic className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                ref={fieldRef}
                onClick={!isMobile ? startIntercept : undefined}
                className={`px-4 py-3.5 rounded-3xl bg-brand-soft text-brand-text text-base leading-relaxed min-h-[88px] shadow-[inset_0_2px_8px_rgba(46,42,69,0.06)] ${!isMobile ? 'cursor-text hover:bg-[#F1EEF9] transition' : ''}`}
              >
                {typed || <span className="text-brand-muted/50">{THOUGHT}</span>}
                {caret && <span className="inline-block w-[2px] h-[1.1em] align-text-bottom bg-brand-accent ml-0.5 animate-pulse" />}
              </div>
            )}

            {mode === 'live' && (
              <p className="text-xs text-brand-muted mt-2">Это уже про тебя. Впиши мысль, дальше превратим в пост.</p>
            )}
            {mode !== 'live' && !isMobile && (
              <p className="text-xs text-brand-muted/70 mt-2">можно вписать свою мысль</p>
            )}

            {/* Кнопка «сделать пост» */}
            <button
              ref={buttonRef}
              type="button"
              onClick={mode === 'live' ? handleMakePost : startIntercept}
              disabled={mode === 'live' && !liveText.trim()}
              className={`mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-semibold text-sm transition ${
                mode === 'live' && !liveText.trim()
                  ? 'bg-brand-soft text-brand-muted cursor-not-allowed'
                  : 'bg-brand-accent text-white hover:bg-brand-accent-hover shadow-lg shadow-brand-accent/20 cursor-pointer'
              }`}
            >
              {thinking ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              ) : (
                <><Sparkles className="w-4 h-4 text-brand-sage" /> Сделать пост</>
              )}
            </button>

            {/* Мобильный перехват: отдельная кнопка */}
            {isMobile && mode === 'auto' && (
              <button type="button" onClick={startIntercept} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border border-brand-accent text-brand-accent font-semibold text-sm cursor-pointer">
                Вписать свою мысль
              </button>
            )}

            {frozen && mode === 'auto' && !reduced && (
              <button type="button" onClick={showAgain} className="mt-3 text-xs text-brand-muted hover:text-brand-text transition cursor-pointer">
                показать снова
              </button>
            )}
            {mode === 'live' && dismissedOnce && (
              <p className="mt-3 text-xs text-brand-accent">Твоя мысль на месте. Зарегистрируйся, и соберем из нее пост.</p>
            )}
          </div>

          {/* ПРАВО: пост (высота зарезервирована, чтобы не дергать лейаут) */}
          <div className="min-h-[280px] lg:min-h-[340px] flex items-start">
            <AnimatePresence>
              {showPost && (
                <motion.div
                  ref={postRef}
                  key="post"
                  initial={reduced ? false : { opacity: 0, scale: 0.98, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: EASE_SOFT }}
                  className="w-full bg-white rounded-3xl p-6 sm:p-7 shadow-[0_18px_40px_-12px_rgba(46,42,69,0.18)]"
                >
                  {showTitle && (
                    <>
                      <motion.h3
                        initial={reduced ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="text-xl sm:text-2xl font-bold text-brand-text"
                      >
                        {POST_TITLE}
                      </motion.h3>
                      <Squiggle variant={0} width="160px" staticDraw={reduced} />
                    </>
                  )}
                  <div className="mt-4 text-brand-muted text-[15px] leading-relaxed">
                    {BODY_TOKENS.slice(0, revealed).map((t, i) =>
                      t.br ? (
                        <span key={i} className="block h-3" />
                      ) : (
                        <motion.span
                          key={i}
                          initial={reduced ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                        >
                          {t.w}{' '}
                        </motion.span>
                      )
                    )}
                  </div>
                  {showCTA && (
                    <motion.button
                      type="button"
                      onClick={!isMobile ? startIntercept : undefined}
                      initial={reduced ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl border border-brand-accent text-brand-accent text-sm font-semibold cursor-pointer"
                    >
                      Попробовать со своей мыслью
                    </motion.button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Брендовый курсор (десктоп) */}
          {!isMobile && !reduced && (
            <AnimatePresence>
              {showCursor && (
                <motion.div
                  key="cursor"
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 z-20"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, x: cursorPos.x, y: cursorPos.y }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{
                    x: { duration: 0.85, ease: EASE_MOVE },
                    y: { duration: 0.85, ease: EASE_MOVE },
                    opacity: { duration: 0.18 },
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" className="drop-shadow-[0_4px_8px_rgba(46,42,69,0.22)]">
                    <path d="M5 3 C 5 14, 9 18, 12 21 C 13 16, 17 14, 20 13 C 14 11, 8 7, 5 3 Z" fill="#2E2A45" stroke="#F7F3EC" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                  {clicking && (
                    <motion.span
                      className="absolute -top-1 -left-1 block rounded-full border-2 border-brand-sage"
                      initial={{ width: 10, height: 10, opacity: 1 }}
                      animate={{ width: 40, height: 40, opacity: 0, x: -15, y: -15 }}
                      transition={{ duration: 0.35, ease: EASE_SOFT }}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Индикатор тапа (мобилка): кружок опускается на кнопку */}
          {isMobile && !reduced && (
            <AnimatePresence>
              {showCursor && (
                <motion.div
                  key="tap"
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 z-20 -ml-6 -mt-6 rounded-full bg-brand-soft/60 border-2 border-brand-accent"
                  initial={{ opacity: 0, width: 46, height: 46 }}
                  animate={{
                    opacity: 1,
                    x: cursorPos.x,
                    y: cursorPos.y,
                    width: clicking ? 36 : 46,
                    height: clicking ? 36 : 46,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ x: { duration: 0.55, ease: EASE_MOVE }, y: { duration: 0.55, ease: EASE_MOVE }, default: { duration: 0.18 } }}
                >
                  {clicking && (
                    <motion.span
                      className="absolute inset-0 block rounded-full border-2 border-brand-sage"
                      initial={{ scale: 0.6, opacity: 1 }}
                      animate={{ scale: 1.9, opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE_SOFT }}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      <AuthModal isOpen={showAuth} onClose={closeAuth} contextNote={CONTEXT_NOTE} />
    </section>
  )
}
