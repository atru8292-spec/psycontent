'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, ArrowDown, Sparkles, Check, Heart, MessageCircle, Bookmark, Mic, Layers, Play, Type, CalendarCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Squiggle from '@/components/Squiggle'

const EASE = [0.22, 1, 0.36, 1] as const

// Система глубины: тонированные индиго/аметист тени, два слоя в каждой (контактная + мягкая).
const SHADOW_L1 = 'shadow-[0_2px_6px_-2px_rgba(46,42,69,0.10),0_16px_36px_-16px_rgba(46,42,69,0.22)]'
const SHADOW_L2 = 'shadow-[0_4px_10px_-4px_rgba(46,42,69,0.14),0_26px_54px_-20px_rgba(46,42,69,0.30)]'
const SHADOW_L3 = 'shadow-[0_8px_18px_-8px_rgba(46,42,69,0.18),0_36px_72px_-28px_rgba(46,42,69,0.38)]'
const SHADOW_ACC = 'shadow-[0_6px_14px_-6px_rgba(91,79,160,0.30),0_28px_56px_-22px_rgba(91,79,160,0.45)]'

// Листалка-знакомство после регистрации, перед экспрессом. Показываем только
// холодному входу (без мысли из демо). Ручное листание, без авто-таймера.
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
      const { data: prof } = await supabase
        .from('onboarding_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
      if (!active) return
      if (prof) { router.replace('/dashboard'); return }
      try {
        const raw = localStorage.getItem('psycont_seed_thought')
        if (raw) {
          const { text, ts } = JSON.parse(raw)
          if (text && typeof ts === 'number' && Date.now() - ts < 24 * 3600 * 1000) {
            router.replace('/onboarding/express'); return
          }
        }
      } catch { /* localStorage недоступен, показываем слайды */ }
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
  const stepper = `${String(index + 1).padStart(2, '0')} / ${String(SLIDES.length).padStart(2, '0')}`
  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduced ? 0 : d > 0 ? 24 : -24 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduced ? 0 : d > 0 ? -24 : 24 }),
  }
  const appear = (delay: number) =>
    reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: EASE, delay } }

  return (
    <div className="relative min-h-[100dvh] bg-brand-bg overflow-hidden">
      {/* Глубина фона: радиальные пулы (едва читаются) + зернистость */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full bg-brand-accent opacity-[0.06] blur-[130px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-44 -right-40 w-[620px] h-[620px] rounded-full bg-brand-soft opacity-50 blur-[140px]" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 left-[15%] w-[440px] h-[440px] rounded-full bg-brand-sage opacity-[0.04] blur-[150px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[url('/paper-grain.png')] bg-repeat bg-[length:128px_128px] opacity-[0.06]" />

      <div
        className="relative z-10 mx-auto w-full max-w-[1120px] min-h-[100dvh] flex flex-col px-5 sm:px-8 lg:px-10 py-6 lg:py-9"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* ── Шапка: точки прогресса + Пропустить (фикс) ── */}
        <header className="shrink-0 flex items-center justify-between h-10">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goto(i)}
                aria-label={`Слайд ${i + 1}`}
                className={`h-2 rounded-full transition-[width,background-color] duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F3EC] ${i === index ? 'w-7 bg-brand-accent' : 'w-2 bg-brand-border-soft hover:bg-brand-border'}`}
              />
            ))}
          </div>
          <button type="button" onClick={toExpress} className="text-sm text-brand-muted hover:text-brand-text transition-colors cursor-pointer">
            Пропустить
          </button>
        </header>

        {/* ── Сцена: десктоп 2 колонки, мобилка стек ── */}
        <main className="flex-1 flex items-center py-4">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={index}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: EASE }}
              className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 xl:gap-20 items-center"
            >
              {/* Иллюстрация */}
              <div className="flex items-center justify-center min-h-[230px] sm:min-h-[300px] lg:min-h-[380px] order-1">
                <div className="scale-[0.8] sm:scale-90 lg:scale-100 origin-center">
                  <Motif motif={slide.motif} reduced={reduced} appear={appear} />
                </div>
              </div>

              {/* Текст */}
              <div className="order-2 text-center lg:text-left max-w-[340px] lg:max-w-[460px] mx-auto lg:mx-0">
                <motion.p {...appear(0.05)} className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-accent mb-3">{stepper}</motion.p>
                <motion.h2 {...appear(0.1)} className="text-[28px] sm:text-[32px] lg:text-[40px] font-bold text-brand-text tracking-[-0.02em] leading-[1.1]">
                  {slide.title}
                </motion.h2>
                <div className="flex justify-center lg:justify-start mt-2"><Squiggle variant={index % 3 as 0 | 1 | 2} width="140px" staticDraw={reduced} /></div>
                <motion.p {...appear(0.18)} className="text-[15px] lg:text-[17px] text-brand-muted leading-[1.6] mt-4">
                  {slide.subtitle}
                </motion.p>
              </div>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Подвал: Назад + Дальше/Начнем (фикс позиции) ── */}
        <footer className="shrink-0 pt-6 lg:pt-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="h-6 lg:h-auto flex items-center justify-center lg:justify-start">
              {index > 0 && (
                <button type="button" onClick={prev} className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-text transition-colors cursor-pointer">
                  <ArrowLeft className="w-4 h-4" /> Назад
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={next}
              className="w-full lg:w-auto inline-flex items-center justify-center gap-2 bg-brand-accent text-white font-semibold text-sm rounded-2xl px-7 py-4 lg:py-3.5 hover:bg-brand-accent-hover transition-colors cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F3EC]"
            >
              {index === last
                ? <><Sparkles className="w-4 h-4" /> Начнем</>
                : <>Дальше <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppearFn = (delay: number) => any

// Лавандовый пад за карточкой-героем: дает считываемый перепад база -> карточка.
function Pad({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`absolute inset-0 -z-10 translate-x-3 translate-y-4 rounded-3xl bg-brand-soft-2 ${className}`} />
}

// ── Визуальные мотивы слайдов (один вес, герой + пад + система теней) ──
function Motif({ motif, reduced, appear }: { motif: Motif; reduced: boolean; appear: AppearFn }) {
  // 1. Тишина: крупный старательный пост, а откликов ноль
  if (motif === 'silence') {
    return (
      <div className="relative">
        <Pad />
        <motion.div {...appear(0)} className={`relative bg-white rounded-3xl p-5 w-[320px] rotate-[1.5deg] ring-1 ring-brand-border/60 ${SHADOW_L2}`}>
          <div className="flex items-center gap-3 pb-3 border-b border-brand-border">
            <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-brand-accent text-sm font-bold">А</div>
            <div className="h-2.5 w-24 rounded-full bg-brand-border/70" />
          </div>
          <div className="mt-3.5">
            <div className="h-3 w-40 rounded-full bg-brand-text/85" />
            <div className="mt-1.5"><Squiggle variant={0} width="110px" staticDraw={reduced} /></div>
            <div className="mt-3 space-y-2">
              <div className="h-2.5 w-full rounded-full bg-brand-border/60" />
              <div className="h-2.5 w-11/12 rounded-full bg-brand-border/60" />
              <div className="h-2.5 w-2/3 rounded-full bg-brand-border/60" />
            </div>
          </div>
          <motion.div {...appear(0.28)} className="flex items-center gap-5 mt-4 pt-3 border-t border-brand-border">
            <span className="flex items-center gap-1.5"><Heart className="w-5 h-5 text-brand-muted/30" /><span className="text-xs text-brand-muted/40">0</span></span>
            <span className="flex items-center gap-1.5"><MessageCircle className="w-5 h-5 text-brand-muted/30" /><span className="text-xs text-brand-muted/40">0</span></span>
            <span className="flex items-center gap-1.5"><Bookmark className="w-5 h-5 text-brand-muted/30" /><span className="text-xs text-brand-muted/40">0</span></span>
            <span className="ml-auto text-xs text-brand-muted/40">сегодня</span>
          </motion.div>
        </motion.div>
      </div>
    )
  }

  // 2. Язык клиента: сухая академичная (утоплена) против живой фразы (плавает, подчеркнута)
  if (motif === 'language') {
    return (
      <div className="flex flex-col items-center gap-2.5 w-[300px]">
        <motion.div {...appear(0)} className="self-stretch bg-brand-border/25 ring-1 ring-brand-border/40 rounded-2xl px-4 py-3 opacity-70">
          <p className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider mb-1">по-научному</p>
          <p className="text-[13px] italic text-brand-muted/80 leading-snug">созависимое поведение в близких отношениях</p>
        </motion.div>
        <motion.div {...appear(0.12)} className="w-[2px] h-6 rounded-full bg-brand-sage" />
        <div className="relative self-stretch">
          <Pad className="translate-x-2.5 translate-y-3" />
          <motion.div {...appear(0.2)} className={`relative bg-white rounded-3xl px-5 py-4 ring-1 ring-brand-soft scale-[1.03] ${SHADOW_L3}`}>
            <p className="text-[10px] font-semibold text-brand-accent uppercase tracking-wider mb-1">как чувствует клиент</p>
            <p className="text-[15px] text-brand-text leading-snug">снова выбираешь тех, кто не выбирает тебя</p>
            <div className="mt-1"><Squiggle variant={2} width="150px" staticDraw={reduced} /></div>
          </motion.div>
        </div>
      </div>
    )
  }

  // 3. Не маркетолог: чужие ярлыки сняты сверху, продукт выдает чистый результат снизу
  if (motif === 'notmarketer') {
    const chips = ['алгоритмы', 'рилсы', 'охваты', 'продающий текст']
    const rot = ['-rotate-2', 'rotate-1', 'rotate-2', '-rotate-1']
    return (
      <div className="flex flex-col items-center w-[300px]">
        <div className="flex flex-wrap justify-center gap-2 max-w-[300px] opacity-80">
          {chips.map((c, i) => (
            <motion.span key={c} {...appear(i * 0.06)} className={`inline-flex items-center bg-brand-border/40 text-brand-muted text-xs rounded-full px-3 py-1.5 line-through ${rot[i]}`}>
              {c}
            </motion.span>
          ))}
        </div>
        <motion.div {...appear(0.26)} className="my-3">
          <div className="w-9 h-9 rounded-full bg-brand-soft-2 flex items-center justify-center"><ArrowDown className="w-5 h-5 text-brand-sage" /></div>
        </motion.div>
        <div className="relative">
          <Pad className="translate-x-2.5 translate-y-3" />
          <motion.div {...appear(0.34)} className={`relative bg-white rounded-2xl p-4 w-[230px] ring-1 ring-brand-soft ${SHADOW_ACC}`}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-brand-accent" />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
            </div>
            <div className="h-2.5 w-32 rounded-full bg-brand-text/80" />
            <div className="mt-1"><Squiggle variant={1} width="90px" staticDraw={reduced} /></div>
            <div className="mt-2.5 space-y-2">
              <div className="h-2.5 w-full rounded-full bg-brand-border/60" />
              <div className="h-2.5 w-3/4 rounded-full bg-brand-border/60" />
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // 4. Продажи: человек пишет первым, плавающий входящий пузырь, без кнопок купить
  if (motif === 'selling') {
    return (
      <div className="flex flex-col items-center w-[290px]">
        <motion.div {...appear(0)} className="flex items-center gap-2 opacity-80 mb-4">
          <div className="w-8 h-8 rounded-full bg-brand-soft flex items-center justify-center text-brand-accent text-xs font-bold">А</div>
          <Squiggle variant={0} width="64px" staticDraw={reduced} />
        </motion.div>
        <motion.div {...appear(0.34)} className="self-start flex items-center gap-1.5 mb-2 ml-1">
          <span className="w-2 h-2 rounded-full bg-brand-accent" />
          <span className="text-[10px] text-brand-muted">новое сообщение</span>
        </motion.div>
        <motion.div
          initial={reduced ? false : { opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.18 }}
          className="self-start flex items-start gap-2.5 max-w-[270px]"
        >
          <div className="w-7 h-7 rounded-full bg-brand-soft-2 shrink-0 mt-1" />
          <div className="relative">
            <Pad className="translate-x-2 translate-y-2.5" />
            <div className={`relative bg-white rounded-3xl rounded-tl-md px-5 py-3.5 ring-1 ring-brand-soft ${SHADOW_L3}`}>
              <p className="text-[14px] text-brand-text leading-snug">Здравствуйте, давно вас читаю. Можно записаться к вам?</p>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  // 5. Форматы: колода веером + герой-пост + лента контент-плана
  if (motif === 'formats') {
    const back = [
      { icon: Layers, label: 'карусель', cls: '-rotate-6 -translate-x-12' },
      { icon: Play, label: 'рилс', cls: 'rotate-3 translate-x-12' },
      { icon: Type, label: 'хук', cls: 'rotate-[8deg] translate-x-20 translate-y-3' },
    ]
    return (
      <div className="flex flex-col items-center">
        <div className="relative w-[260px] h-[150px] flex items-center justify-center">
          {back.map((b, i) => (
            <motion.div key={b.label} {...appear(i * 0.06)} className={`absolute w-[176px] h-[116px] rounded-2xl bg-white ring-1 ring-brand-border/60 ${SHADOW_L1} ${b.cls}`}>
              <div className="absolute top-2.5 right-3 flex items-center gap-1 text-brand-muted">
                <b.icon className="w-4 h-4" />
                <span className="text-[10px]">{b.label}</span>
              </div>
            </motion.div>
          ))}
          <div className="relative">
            <Pad className="translate-x-2.5 translate-y-3 rounded-3xl" />
            <motion.div {...appear(0.2)} className={`relative bg-white rounded-3xl p-4 w-[200px] ring-1 ring-brand-border/60 ${SHADOW_L2}`}>
              <p className="text-[10px] font-semibold text-brand-accent uppercase tracking-wider mb-1.5">пост</p>
              <div className="h-2.5 w-28 rounded-full bg-brand-text/80" />
              <div className="mt-1"><Squiggle variant={1} width="90px" staticDraw={reduced} /></div>
              <div className="mt-2.5 space-y-2">
                <div className="h-2.5 w-full rounded-full bg-brand-border/60" />
                <div className="h-2.5 w-3/4 rounded-full bg-brand-border/60" />
              </div>
            </motion.div>
          </div>
        </div>
        <motion.div {...appear(0.3)} className="flex items-center gap-2 mt-5 w-[230px] h-9 rounded-full bg-brand-soft px-3.5">
          <CalendarCheck className="w-4 h-4 text-brand-accent shrink-0" />
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

  // 6. Старт: пара коротких вопросов -> пост (всегда горизонтально, высота ограничена)
  return (
    <div className="flex flex-col items-center">
      <motion.div {...appear(0)} className="flex items-center gap-2 mb-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-brand-accent' : 'bg-brand-border-soft'}`} />
        ))}
      </motion.div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} {...appear(0.08 + i * 0.08)} className="flex items-center gap-2 bg-brand-soft rounded-2xl px-3.5 py-2.5 w-[160px]">
              {i === 2
                ? <Check className="w-4 h-4 text-brand-sage shrink-0" />
                : <Mic className="w-4 h-4 text-brand-sage shrink-0" />}
              <span className="h-2.5 w-16 rounded-full bg-brand-muted/40" />
            </motion.div>
          ))}
        </div>
        <motion.div {...appear(0.3)}><ArrowRight className="w-5 h-5 text-brand-sage" /></motion.div>
        <div className="relative">
          <Pad className="translate-x-2 translate-y-3" />
          <motion.div {...appear(0.38)} className={`relative bg-white rounded-3xl p-4 w-[136px] ring-1 ring-brand-soft ${SHADOW_L3}`}>
            <Sparkles className="absolute top-3 right-3 w-4 h-4 text-brand-accent" />
            <div className="h-2.5 w-14 rounded-full bg-brand-text/80" />
            <div className="mt-1"><Squiggle variant={1} width="56px" staticDraw={reduced} /></div>
            <div className="mt-2.5 space-y-2">
              <div className="h-2.5 w-full rounded-full bg-brand-border/60" />
              <div className="h-2.5 w-2/3 rounded-full bg-brand-border/60" />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
