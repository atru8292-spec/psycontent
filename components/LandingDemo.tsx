'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Mic, Heart, MessageCircle, Bookmark } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Squiggle from '@/components/Squiggle'
import AuthModal from '@/components/AuthModal'

// ── Демо-контент (вымышленный психолог, заготовлено, из нашего ресерча) ──
const THOUGHT = 'клиенты на первой встрече извиняются, что занимают мое время'
const POST_AUTHOR = 'Анна Соколова'
const POST_TITLE = 'Извините, что отнимаю ваше время'
const POST_BODY =
  '«Извините, наверное, у других проблемы серьезнее.» Это я слышу на первой встрече чаще всего.\n\n' +
  'Человек только сел, еще ничего толком не рассказал, а уже проверяет, не слишком ли много места занял.\n\n' +
  'Так привыкли годами. Быть удобным, не мешать, заранее чувствовать, кому сейчас тяжелее, и тихо отойти в сторону. А однажды перестаешь понимать, где во всем этом ты сам.\n\n' +
  'Я в такие моменты ничего не делаю. Просто говорю: здесь вы можете занять столько места, сколько вам нужно. И смотрю, как человек впервые за долгое время выдыхает.\n\n' +
  'Если узнал тут себя, расскажи, перед кем ты чаще всего извиняешься за то, что просто есть.'

const CONTEXT_NOTE =
  'Сохраним твою мысль и заведем кабинет. Сначала короткое знакомство, потом соберем из нее твой первый пост.'

const EASE_SOFT = [0.22, 1, 0.36, 1] as const
const EASE_MOVE = [0.45, 0, 0.25, 1] as const

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
  const [showCaption, setShowCaption] = useState(false)
  const [frozen, setFrozen] = useState(false)

  const [liveText, setLiveText] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [dismissedOnce, setDismissedOnce] = useState(false)

  const timers = useRef<number[]>([])
  const cyclesRef = useRef(0)
  const startedRef = useRef(false)
  const phaseRef = useRef(0)
  const submittingRef = useRef(false)

  const surfaceRef = useRef<HTMLDivElement>(null) // сцена, для IntersectionObserver
  const stageRef = useRef<HTMLDivElement>(null)   // грид, контейнер позиционирования курсора/тапа
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

  const setFinalStatic = useCallback(() => {
    setTyped(THOUGHT)
    setShowCursor(false)
    setThinking(false)
    setShowPost(true)
    setShowTitle(true)
    setRevealed(BODY_TOKENS.length)
    setShowCaption(true)
    setFrozen(true)
    phaseRef.current = 11
  }, [])

  const startTyping = useCallback(() => {
    phaseRef.current = 1
    const typeNext = (i: number) => {
      if (i >= THOUGHT.length) return
      setTyped(THOUGHT.slice(0, i + 1))
      const ch = THOUGHT[i]
      const base = 50
      const jitter = 14 + (i % 5) * 5
      const pause = ch === ',' || ch === '.' ? base + 240 : base + jitter
      after(pause, () => typeNext(i + 1))
    }
    typeNext(0)
  }, [])

  const revealBody = useCallback(() => {
    phaseRef.current = 9
    const step = (i: number) => {
      if (i > BODY_TOKENS.length) return
      setRevealed(i)
      const tok = BODY_TOKENS[i - 1]
      const pause = tok && tok.br ? 220 : 52
      after(pause, () => step(i + 1))
    }
    step(1)
  }, [])

  const moveCursorToButton = useCallback(() => {
    phaseRef.current = 3
    const stage = stageRef.current
    const btn = buttonRef.current
    const field = fieldRef.current
    if (!stage || !btn) return
    const s = stage.getBoundingClientRect()
    if (field) {
      const f = field.getBoundingClientRect()
      setCursorPos({ x: f.right - s.left - 36, y: f.bottom - s.top - 18 })
    }
    setShowCursor(true)
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
    setTyped('')
    setShowCursor(false)
    setClicking(false)
    setThinking(false)
    setShowPost(false)
    setShowTitle(false)
    setRevealed(0)
    setShowCaption(false)
    setFrozen(false)
    phaseRef.current = 0

    after(400, startTyping)
    after(3600, () => { phaseRef.current = 2 })
    after(4300, moveCursorToButton)
    after(5300, doClick)
    after(5700, () => setThinking(true))
    after(6300, expandPost)
    after(6800, () => setShowTitle(true))
    after(7300, revealBody)
    after(11400, () => setShowCaption(true))
    after(16800, () => {
      cyclesRef.current += 1
      if (cyclesRef.current < 2) {
        setShowPost(false)
        setShowTitle(false)
        setShowCaption(false)
        setRevealed(0)
        setTyped('')
        after(700, runTimeline)
      } else {
        setFrozen(true)
        phaseRef.current = 11
      }
    })
  }, [clearAll, startTyping, moveCursorToButton, doClick, expandPost, revealBody])

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
          startedRef.current = false
        }
      },
      // порог почти 0: печать стартует как только темная секция выглядывает над сгибом (peek)
      { threshold: 0.01 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [reduced, mode, frozen, runTimeline, clearAll, setFinalStatic])

  useEffect(() => () => clearAll(), [clearAll])

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
    startedRef.current = true // ручной запуск, чтобы обсервер не дернул второй раз
    runTimeline()
  }

  const handleMakePost = () => {
    const text = liveText.trim().slice(0, 600)
    if (!text || submittingRef.current) return
    submittingRef.current = true
    try {
      localStorage.setItem('psycont_seed_thought', JSON.stringify({ text, ts: Date.now() }))
    } catch { /* localStorage недоступен, тихо */ }
    supabase.auth.getUser()
      .then(async ({ data }) => {
        if (data?.user) {
          const { data: prof } = await supabase
            .from('onboarding_profiles').select('user_id').eq('user_id', data.user.id).single()
          router.push(prof ? '/dashboard/post-generator' : '/onboarding/express')
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

  const caret = mode === 'auto' && phaseRef.current <= 2 && !reduced && !frozen

  return (
    <section
      id="demo"
      ref={surfaceRef}
      className="relative w-full overflow-hidden bg-brand-text pt-16 sm:pt-24 pb-20 sm:pb-28"
    >
      {/* Теплая зернистость на темном */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/paper-grain.png')] bg-repeat bg-[length:128px_128px] opacity-[0.05] mix-blend-soft-light"
      />
      <div className="relative z-10 max-w-[1040px] mx-auto px-4 sm:px-6">
        {/* Заголовок секции */}
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-sm font-semibold text-[#C9C2E8] mb-2">Как это работает</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-bg">
            Одна мысль вслух. И готовый пост в твоем голосе.
          </h2>
          <p className="text-sm text-[#A79CC9] mt-3 max-w-xl mx-auto">
            Пример на вымышленном психологе. Твой пост соберется на твоей мысли после входа.
          </p>
        </div>

          {/* Рабочая поверхность */}
          <div ref={stageRef} className="relative grid grid-cols-1 lg:grid-cols-[40%_1fr] gap-6 lg:gap-12 items-start">
            {/* ЛЕВО: мысль */}
            <div>
              <p className="text-[11px] font-bold text-[#A79CC9] uppercase tracking-widest mb-2">твоя мысль</p>

              {mode === 'live' ? (
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={liveText}
                    onChange={(e) => setLiveText(e.target.value.slice(0, 600))}
                    placeholder={THOUGHT}
                    rows={3}
                    className="w-full px-4 py-3.5 rounded-3xl bg-white/[0.04] border border-white/10 text-brand-bg text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-accent resize-none placeholder:text-brand-bg/40"
                  />
                  <button type="button" title="голосовой ввод скоро" className="absolute bottom-3 right-3 p-1.5 rounded-full text-brand-bg/50 hover:text-brand-sage hover:bg-white/5 transition cursor-pointer">
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  ref={fieldRef}
                  onClick={!isMobile ? startIntercept : undefined}
                  className={`px-4 py-3.5 rounded-3xl bg-white/[0.04] border border-white/10 text-brand-bg text-base leading-relaxed min-h-[88px] shadow-[inset_0_2px_10px_rgba(0,0,0,0.28)] ${!isMobile ? 'cursor-text hover:bg-white/[0.07] transition' : ''}`}
                >
                  {typed || <span className="text-brand-bg/40">{THOUGHT}</span>}
                  {caret && <span className="inline-block w-[2px] h-[1.1em] align-text-bottom bg-brand-soft ml-0.5 animate-pulse" />}
                </div>
              )}

              {mode === 'live' && (
                <p className="text-xs text-[#C2BAE0] mt-2">Это уже про тебя. Впиши мысль, дальше превратим в пост.</p>
              )}
              {mode !== 'live' && !isMobile && (
                <p className="text-xs text-[#C2BAE0] mt-2">можно вписать свою мысль</p>
              )}

              <button
                ref={buttonRef}
                type="button"
                onClick={mode === 'live' ? handleMakePost : startIntercept}
                disabled={mode === 'live' && !liveText.trim()}
                className={`mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-semibold text-sm transition ${
                  mode === 'live' && !liveText.trim()
                    ? 'bg-white/[0.06] text-brand-bg/40 cursor-not-allowed'
                    : 'bg-brand-accent text-white hover:bg-brand-accent-hover ring-1 ring-white/12 shadow-[0_10px_30px_-8px_rgba(91,79,160,0.6)] cursor-pointer'
                }`}
              >
                {thinking ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : (
                  <><Sparkles className="w-4 h-4 text-white" /> Сделать пост</>
                )}
              </button>

              {isMobile && mode === 'auto' && (
                <button type="button" onClick={startIntercept} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border border-white/20 text-brand-bg/80 hover:bg-white/[0.06] font-semibold text-sm cursor-pointer">
                  Вписать свою мысль
                </button>
              )}

              {frozen && mode === 'auto' && !reduced && (
                <button type="button" onClick={showAgain} className="mt-3 text-xs text-[#A79CC9] hover:text-brand-bg transition cursor-pointer">
                  показать снова
                </button>
              )}
              {mode === 'live' && dismissedOnce && (
                <p className="mt-3 text-xs text-[#C9C2E8]">Твоя мысль на месте. Зарегистрируйся, и соберем из нее пост.</p>
              )}
            </div>

            {/* ПРАВО: пост как в ленте (высота зарезервирована под полный пост) */}
            <div className="min-h-[420px] lg:min-h-[460px] flex flex-col">
              <AnimatePresence>
                {showPost && (
                  <motion.div
                    ref={postRef}
                    key="post"
                    initial={reduced ? false : { opacity: 0, scale: 0.98, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: EASE_SOFT }}
                    className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.5)]"
                  >
                    {/* Шапка поста */}
                    <div className="flex items-center gap-3 pb-3 border-b border-brand-border">
                      <div className="w-11 h-11 sm:w-11 sm:h-11 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-brand-soft to-brand-soft-2 ring-1 ring-brand-border-soft">
                        <span className="text-brand-accent font-bold text-lg">{POST_AUTHOR[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-brand-text leading-tight">{POST_AUTHOR}</p>
                        <p className="text-xs text-brand-muted">практикующий психолог</p>
                      </div>
                    </div>

                    {/* Заголовок: всегда в DOM, раскрытие через opacity/transform */}
                    <div
                      className="mt-4"
                      style={{
                        opacity: showTitle ? 1 : 0,
                        transform: showTitle ? 'none' : 'translateY(6px)',
                        transition: reduced ? 'none' : 'opacity .25s ease, transform .25s ease',
                      }}
                    >
                      <h3 className="text-lg sm:text-xl font-bold text-brand-text">{POST_TITLE}</h3>
                      <Squiggle variant={0} width="150px" staticDraw={reduced} />
                    </div>
                    {/* Тело: все слова в DOM сразу (высота зарезервирована), раскрытие по индексу */}
                    <div className="mt-3 text-brand-muted text-[15px] leading-relaxed">
                      {BODY_TOKENS.map((t, i) =>
                        t.br ? (
                          <span key={i} className="block h-3" />
                        ) : (
                          <span
                            key={i}
                            style={{
                              opacity: i < revealed ? 1 : 0,
                              transform: i < revealed ? 'none' : 'translateY(4px)',
                              transition: reduced ? 'none' : 'opacity .25s ease, transform .25s ease',
                            }}
                          >
                            {t.w}{' '}
                          </span>
                        )
                      )}
                    </div>

                    {/* Тихий футер, без цифр */}
                    <div aria-hidden className="flex items-center gap-4 mt-5 pt-3 border-t border-brand-border">
                      <Heart className="w-[18px] h-[18px] text-brand-muted/40" />
                      <MessageCircle className="w-[18px] h-[18px] text-brand-muted/40" />
                      <Bookmark className="w-[18px] h-[18px] text-brand-muted/40" />
                      <span className="ml-auto text-xs text-brand-muted/50">сегодня, 12:30</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Тихая подпись-связка под постом (одна CTA на экране, слева) */}
              {showCaption && (
                <motion.p
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm text-[#A79CC9] mt-4 text-center lg:text-left"
                >
                  Так выглядит готовый пост. Слева впиши свою мысль.
                </motion.p>
              )}
            </div>

            {/* Брендовый курсор (десктоп), вариант A на темном инвертирован в крем */}
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
                    <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]">
                      <path
                        d="M4 3 L4 18 L8.2 14.2 L11 20.4 L13.7 19.1 L10.9 13.1 L16.6 12.9 Z"
                        fill="#F7F3EC"
                        stroke="#2E2A45"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {/* Аметистовая фокус-точка на острие */}
                    <span className="absolute top-[2px] left-[3px] w-1.5 h-1.5 rounded-full bg-brand-accent blur-[1px] opacity-70" />
                    {clicking && (
                      <motion.span
                        className="absolute top-0 left-0 block rounded-full border-2 border-brand-sage"
                        initial={{ width: 10, height: 10, opacity: 1, x: -3, y: -3 }}
                        animate={{ width: 40, height: 40, opacity: 0, x: -18, y: -18 }}
                        transition={{ duration: 0.35, ease: EASE_SOFT }}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* Индикатор тапа (мобилка), перекрашен под темное */}
            {isMobile && !reduced && (
              <AnimatePresence>
                {showCursor && (
                  <motion.div
                    key="tap"
                    aria-hidden
                    className="pointer-events-none absolute top-0 left-0 z-20 -ml-6 -mt-6 rounded-full bg-white/10 border-2 border-brand-soft"
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
