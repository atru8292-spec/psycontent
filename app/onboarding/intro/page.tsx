'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, ArrowDown, Sparkles, Check, Heart, MessageCircle, Bookmark, Mic, Layers, Play, Type, CalendarCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Squiggle from '@/components/Squiggle'

const EASE = [0.22, 1, 0.36, 1] as const

// Листалка-знакомство после регистрации, перед экспрессом. Показываем только
// холодному входу (без мысли из демо): у кого мысль уже ждет, ведем сразу к посту.
// Ручное листание, без авто-таймера (без давления). Последний слайд + Пропустить -> express.
type Motif = 'silence' | 'language' | 'notmarketer' | 'selling' | 'formats' | 'start'
const SLIDES: { motif: Motif; title: string; subtitle: string }[] = [
  {
    motif: 'silence',
    title: 'Пишешь, а клиентов нет',
    subtitle: 'Вкладываешь время, пишешь по делу, а в ответ тишина. Ни откликов, ни записей. Так бывает, когда пост написан правильно, но мимо человека.',
  },
  {
    motif: 'language',
    title: 'Словами клиента, а не диагнозом',
    subtitle: 'Кажется, надо написать умно и по науке. А человек откликается, когда читает про себя простыми словами: снова выбираешь тех, кто не выбирает тебя. Тут пост так и пишется, на языке клиента.',
  },
  {
    motif: 'notmarketer',
    title: 'Ты психолог, а не маркетолог',
    subtitle: 'Тебя учили помогать людям, а не писать продающие тексты, снимать рилсы и разбираться в алгоритмах. И не нужно. Маркетинг берем на себя, ты остаешься психологом.',
  },
  {
    motif: 'selling',
    title: 'Продавать себя неловко',
    subtitle: 'Говорить приходите ко мне и называть цену тяжело, кажется навязчивым. Хороший пост продает за тебя сам: человек читает, узнает себя и пишет первым. Без купите и давления.',
  },
  {
    motif: 'formats',
    title: 'Посты, которые дочитывают',
    subtitle: 'Мы изучили, какие форматы у психологов заходят. Тут собираются посты, карусели, рилсы и хуки в тех форматах, что цепляют. А контент-план подсказывает, о чем писать, чтобы блог не заглох.',
  },
  {
    motif: 'start',
    title: 'Соберем твой первый пост',
    subtitle: 'Пара коротких вопросов о тебе и работе, и сразу сделаем пост в твоем голосе. Без анкеты на полчаса.',
  },
]

export default function IntroPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState(1)
  const [reduced, setReduced] = useState(false)
  const touchX = useRef<number | null>(null)
  const last = SLIDES.length - 1

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }
    let active = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return
      if (!user) { router.replace('/'); return }
      // Уже есть профиль -> в кабинет (анти-цикл, не показываем интро повторно)
      const { data: prof } = await supabase
        .from('onboarding_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
      if (!active) return
      if (prof) { router.replace('/dashboard'); return }
      // Пришел через демо (мысль уже ждет) -> сразу к посту, слайды не показываем
      try {
        const raw = localStorage.getItem('psycont_seed_thought')
        if (raw) {
          const { text, ts } = JSON.parse(raw)
          if (text && typeof ts === 'number' && Date.now() - ts < 24 * 3600 * 1000) {
            router.replace('/onboarding/express'); return
          }
        }
      } catch { /* localStorage недоступен, показываем слайды как обычно */ }
      setReady(true)
    })
    return () => { active = false }
  }, [router])

  const toExpress = useCallback(() => router.push('/onboarding/express'), [router])
  const next = useCallback(() => {
    setDir(1)
    setIndex((i) => (i >= last ? (toExpress(), i) : i + 1))
  }, [last, toExpress])
  const prev = useCallback(() => {
    setDir(-1)
    setIndex((i) => (i > 0 ? i - 1 : i))
  }, [])
  const goto = (target: number) => { setDir(target > index ? 1 : -1); setIndex(target) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Enter, когда фокус на кнопке, уже сработает как клик, иначе проскочим 2 слайда
      const t = e.target as HTMLElement | null
      const onControl = !!t && (t.tagName === 'BUTTON' || t.tagName === 'A')
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'Enter' && !onControl) next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') toExpress()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, toExpress])

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (dx < -40 && index < last) next()
    else if (dx > 40) prev()
  }

  if (!ready) {
    return (
      <div className="min-h-[100dvh] bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  const slide = SLIDES[index]
  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduced ? 0 : d > 0 ? 24 : -24 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduced ? 0 : d > 0 ? -24 : 24 }),
  }

  return (
    <div className="relative min-h-[100dvh] bg-brand-bg flex items-center justify-center overflow-hidden px-5">
      {/* Зернистость на креме */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[url('/paper-grain.png')] bg-repeat bg-[length:128px_128px] opacity-[0.05]" />

      <div
        className="relative z-10 w-full max-w-[440px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Верх: точки прогресса + Пропустить */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goto(i)}
                aria-label={`Слайд ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 ${i === index ? 'w-6 bg-brand-accent' : 'w-2 bg-brand-border-soft hover:bg-brand-border'}`}
              />
            ))}
          </div>
          <button type="button" onClick={toExpress} className="text-sm text-brand-muted hover:text-brand-text transition cursor-pointer">
            Пропустить
          </button>
        </div>

        {/* Центр: визуал + текст со сменой слайда */}
        <div className="relative">
          {/* Лавандовый блоб глубины (один, общий) */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-4 w-[360px] h-[300px] rounded-full bg-brand-soft opacity-60 blur-3xl" />

          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={index}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: EASE }}
              className="relative"
            >
              {/* Визуал-зона с зарезервированной высотой (заголовок не прыгает) */}
              <div className="h-[180px] sm:h-[230px] flex items-center justify-center">
                <Motif motif={slide.motif} reduced={reduced} />
              </div>

              <div className="text-center mt-2">
                <motion.h2
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.08 }}
                  className="text-2xl sm:text-3xl font-bold text-brand-text leading-tight"
                >
                  {slide.title}
                </motion.h2>
                <div className="flex justify-center"><Squiggle variant={index % 3 as 0 | 1 | 2} width="120px" staticDraw={reduced} /></div>
                <motion.p
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.16 }}
                  className="text-sm sm:text-base text-brand-muted leading-relaxed max-w-[340px] mx-auto mt-3"
                >
                  {slide.subtitle}
                </motion.p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Низ: Назад + Дальше/Начнем */}
        <div className="flex items-center justify-between gap-3 mt-8">
          {index > 0 ? (
            <button type="button" onClick={prev} className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-text transition cursor-pointer">
              <ArrowLeft className="w-4 h-4" /> Назад
            </button>
          ) : <span />}

          <button
            type="button"
            onClick={next}
            className="inline-flex items-center justify-center gap-2 bg-brand-accent text-white font-semibold text-sm rounded-2xl px-6 py-3.5 hover:bg-brand-accent-hover transition cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
          >
            {index === last
              ? <><Sparkles className="w-4 h-4" /> Начнем</>
              : <>Дальше <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Визуальные мотивы слайдов (собраны из брендовых примитивов, без ассетов) ──
function Motif({ motif, reduced }: { motif: Motif; reduced: boolean }) {
  const appear = (delay: number) =>
    reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: EASE, delay } }

  // 1. Тишина: старательный пост, а откликов ноль
  if (motif === 'silence') {
    return (
      <motion.div {...appear(0)} className="bg-white rounded-2xl p-3.5 w-[262px] rotate-[1.5deg] shadow-[0_14px_30px_-12px_rgba(46,42,69,0.35)]">
        <div className="flex items-center gap-2 pb-2 border-b border-brand-border">
          <div className="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center text-brand-accent text-xs font-bold">А</div>
          <div className="h-2 w-20 rounded-full bg-brand-border/70" />
        </div>
        <div className="mt-2.5">
          <div className="h-2.5 w-32 rounded-full bg-brand-text/80" />
          <div className="mt-1"><Squiggle variant={0} width="80px" staticDraw={reduced} /></div>
          <div className="mt-2 space-y-1.5">
            <div className="h-2 w-full rounded-full bg-brand-border/60" />
            <div className="h-2 w-11/12 rounded-full bg-brand-border/60" />
            <div className="h-2 w-2/3 rounded-full bg-brand-border/60" />
          </div>
        </div>
        <motion.div {...appear(0.28)} className="flex items-center gap-4 mt-3 pt-2.5 border-t border-brand-border">
          <span className="flex items-center gap-1"><Heart className="w-[18px] h-[18px] text-brand-muted/30" /><span className="text-xs text-brand-muted/50">0</span></span>
          <span className="flex items-center gap-1"><MessageCircle className="w-[18px] h-[18px] text-brand-muted/30" /><span className="text-xs text-brand-muted/50">0</span></span>
          <span className="flex items-center gap-1"><Bookmark className="w-[18px] h-[18px] text-brand-muted/30" /><span className="text-xs text-brand-muted/50">0</span></span>
          <span className="ml-auto text-xs text-brand-muted/40">сегодня</span>
        </motion.div>
      </motion.div>
    )
  }

  // 2. Язык клиента: академично (сухо) против живой фразы (подчеркнута)
  if (motif === 'language') {
    return (
      <div className="flex flex-col items-center gap-2 w-[268px]">
        <motion.div {...appear(0)} className="self-stretch bg-brand-border/30 rounded-2xl px-4 py-3 opacity-70">
          <p className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider mb-1">по-научному</p>
          <p className="text-[13px] italic text-brand-muted/80 leading-snug">созависимое поведение в близких отношениях</p>
        </motion.div>
        <motion.div {...appear(0.12)} className="w-[2px] h-5 rounded-full bg-brand-sage" />
        <motion.div {...appear(0.2)} className="self-stretch bg-white rounded-2xl px-4 py-3.5 ring-1 ring-brand-soft shadow-[0_16px_34px_-12px_rgba(46,42,69,0.4)] scale-[1.03]">
          <p className="text-[10px] font-semibold text-brand-accent uppercase tracking-wider mb-1">как чувствует клиент</p>
          <p className="text-[14px] text-brand-text leading-snug">снова выбираешь тех, кто не выбирает тебя</p>
          <div className="mt-0.5"><Squiggle variant={2} width="150px" staticDraw={reduced} /></div>
        </motion.div>
      </div>
    )
  }

  // 3. Не маркетолог: чужие маркетинговые ярлыки сняты, продукт берет на себя
  if (motif === 'notmarketer') {
    const chips = ['алгоритмы', 'рилсы', 'охваты', 'продающий текст']
    const rot = ['-rotate-2', 'rotate-1', 'rotate-2', '-rotate-1']
    return (
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap justify-center gap-2 max-w-[260px]">
          {chips.map((c, i) => (
            <motion.span key={c} {...appear(i * 0.06)} className={`inline-flex items-center gap-1 bg-brand-border/40 text-brand-muted text-xs rounded-full px-3 py-1.5 line-through ${rot[i]}`}>
              {c}
            </motion.span>
          ))}
        </div>
        <motion.div {...appear(0.26)}><ArrowDown className="w-4 h-4 text-brand-sage my-2.5" /></motion.div>
        <motion.div {...appear(0.34)} className="inline-flex items-center gap-2 bg-brand-accent text-white rounded-2xl px-4 py-2.5 shadow-[0_12px_28px_-10px_rgba(91,79,160,0.5)]">
          <Sparkles className="w-4 h-4" />
          <span className="h-2 w-24 rounded-full bg-white/40" />
        </motion.div>
      </div>
    )
  }

  // 4. Продажи: человек пишет первым, никаких кнопок купить
  if (motif === 'selling') {
    return (
      <div className="flex flex-col items-center w-[260px]">
        <motion.div {...appear(0)} className="flex items-center gap-2 opacity-80 mb-3">
          <div className="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center text-brand-accent text-xs font-bold">А</div>
          <Squiggle variant={0} width="60px" staticDraw={reduced} />
        </motion.div>
        <motion.div {...appear(0.34)} className="self-start flex items-center gap-1.5 mb-1.5 ml-1">
          <span className="w-2 h-2 rounded-full bg-brand-accent" />
          <span className="text-[10px] text-brand-muted">новое сообщение</span>
        </motion.div>
        <motion.div
          initial={reduced ? false : { opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.18 }}
          className="self-start flex items-start gap-2 max-w-[240px]"
        >
          <div className="w-6 h-6 rounded-full bg-brand-soft-2 shrink-0 mt-1" />
          <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 ring-1 ring-brand-soft shadow-[0_14px_30px_-12px_rgba(46,42,69,0.35)]">
            <p className="text-[13px] text-brand-text leading-snug">Здравствуйте, давно вас читаю. Можно записаться к вам?</p>
          </div>
        </motion.div>
      </div>
    )
  }

  // 5. Форматы: колода форматов веером + лента контент-плана
  if (motif === 'formats') {
    const back = [
      { icon: Layers, label: 'карусель', cls: '-rotate-6 -translate-x-7' },
      { icon: Play, label: 'рилс', cls: 'rotate-3 translate-x-7' },
      { icon: Type, label: 'хук', cls: 'rotate-[7deg] translate-x-12 translate-y-2' },
    ]
    return (
      <div className="flex flex-col items-center">
        <div className="relative w-[230px] h-[132px] flex items-center justify-center">
          {back.map((b, i) => (
            <motion.div key={b.label} {...appear(i * 0.06)} className={`absolute w-[170px] h-[112px] rounded-2xl bg-white ring-1 ring-brand-border shadow-sm ${b.cls}`}>
              <div className="absolute top-2 right-2.5 flex items-center gap-1 text-brand-muted">
                <b.icon className="w-3.5 h-3.5" />
                <span className="text-[10px]">{b.label}</span>
              </div>
            </motion.div>
          ))}
          <motion.div {...appear(0.2)} className="relative bg-white rounded-2xl p-3.5 w-[190px] shadow-[0_18px_38px_-14px_rgba(46,42,69,0.4)]">
            <p className="text-[10px] font-semibold text-brand-accent uppercase tracking-wider mb-1.5">пост</p>
            <div className="h-2.5 w-28 rounded-full bg-brand-text/80" />
            <div className="mt-1"><Squiggle variant={1} width="90px" staticDraw={reduced} /></div>
            <div className="mt-2 space-y-1.5">
              <div className="h-2 w-full rounded-full bg-brand-border/60" />
              <div className="h-2 w-3/4 rounded-full bg-brand-border/60" />
            </div>
          </motion.div>
        </div>
        <motion.div {...appear(0.3)} className="flex items-center gap-2 mt-3 w-[228px] h-8 rounded-full bg-brand-soft/70 px-3">
          <CalendarCheck className="w-3.5 h-3.5 text-brand-accent shrink-0" />
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-brand-accent' : 'bg-brand-border'}`} />
            ))}
          </div>
          <span className="ml-auto text-[10px] text-brand-muted">контент-план</span>
        </motion.div>
      </div>
    )
  }

  // 6. Старт: пара коротких вопросов превращается в пост
  return (
    <div className="flex flex-col items-center">
      <motion.div {...appear(0)} className="flex items-center gap-2 mb-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-brand-accent' : 'bg-brand-border-soft'}`} />
        ))}
      </motion.div>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} {...appear(0.08 + i * 0.08)} className="flex items-center gap-2 bg-brand-soft rounded-2xl px-3 py-2 w-[150px]">
              {i === 2
                ? <Check className="w-3.5 h-3.5 text-brand-sage shrink-0" />
                : <Mic className="w-3.5 h-3.5 text-brand-sage shrink-0" />}
              <span className="h-2 w-16 rounded-full bg-brand-muted/40" />
            </motion.div>
          ))}
        </div>
        <motion.div {...appear(0.3)} className="text-brand-sage">
          <ArrowRight className="w-4 h-4 hidden sm:block" />
          <ArrowDown className="w-4 h-4 sm:hidden" />
        </motion.div>
        <motion.div {...appear(0.38)} className="relative bg-white rounded-2xl p-3 w-[118px] shadow-[0_14px_30px_-12px_rgba(46,42,69,0.35)]">
          <Sparkles className="absolute top-2 right-2 w-3.5 h-3.5 text-brand-accent" />
          <div className="h-2 w-14 rounded-full bg-brand-text/80" />
          <div className="mt-1"><Squiggle variant={1} width="56px" staticDraw={reduced} /></div>
          <div className="mt-2 space-y-1.5">
            <div className="h-2 w-full rounded-full bg-brand-border/60" />
            <div className="h-2 w-2/3 rounded-full bg-brand-border/60" />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
