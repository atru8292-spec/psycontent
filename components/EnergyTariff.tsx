'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Infinity as InfinityIcon, HelpCircle } from 'lucide-react'

// Данные приходят из read-only /api/me. Никакой логики энергии тут нет.
interface Summary {
  plan: { code: string; name: string; isUnlimited: boolean; deepAnalysis: boolean }
  energy: { balance: number; monthlyAllowance: number; nextRefill: string | null } | null
  textTrial: { remaining: number; cap: number } | null
}

function useAccount(enabled: boolean): Summary | null {
  const [data, setData] = useState<Summary | null>(null)
  useEffect(() => {
    if (!enabled) return
    let on = true
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (on) setData(j) })
      .catch(() => {})
    return () => { on = false }
  }, [enabled])
  return data
}

function refillDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  } catch {
    return ''
  }
}

// ── Компактная плашка в шапке дашборда (ведет в «Тариф и энергия») ──
export function EnergyBadge({ data, compact }: { data?: Summary | null; compact?: boolean } = {}) {
  const auto = useAccount(data === undefined)
  const d = data === undefined ? auto : data
  const router = useRouter()
  if (!d?.plan) return null
  const { plan, energy, textTrial } = d

  // Компактный вид для постоянной шапки/свернутого сайдбара: иконка + значение, без имени тарифа
  if (compact) {
    let v = ''
    if (!plan.isUnlimited) {
      if (textTrial) v = `${textTrial.remaining}/${textTrial.cap}`
      else if (energy) v = `${energy.balance}/${energy.monthlyAllowance}`
    }
    return (
      <button
        onClick={() => router.push('/dashboard/settings#energy')}
        aria-label="Энергия и тариф"
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-brand-soft border border-brand-border-soft text-sm font-semibold text-brand-accent hover:border-brand-accent/40 transition cursor-pointer"
      >
        <Zap className="w-3.5 h-3.5 text-brand-sage shrink-0" />
        {plan.isUnlimited
          ? <InfinityIcon className="w-3.5 h-3.5 shrink-0" />
          : (v && <span className="whitespace-nowrap">{v}</span>)}
      </button>
    )
  }

  let value: React.ReactNode = null
  if (plan.isUnlimited) {
    value = <span className="text-brand-accent font-semibold">Безлимит</span>
  } else if (textTrial) {
    value = (
      <span className="text-brand-accent font-semibold">
        {textTrial.remaining}<span className="text-brand-muted font-normal"> из {textTrial.cap}</span>
      </span>
    )
  } else if (energy) {
    value = (
      <span className="text-brand-accent font-semibold">
        {energy.balance}<span className="text-brand-muted font-normal">/{energy.monthlyAllowance}</span>
      </span>
    )
  }

  return (
    <button
      onClick={() => router.push('/dashboard/settings#energy')}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-brand-soft border border-brand-border-soft text-sm text-brand-text font-medium hover:border-brand-accent/40 transition cursor-pointer"
    >
      <Zap className="w-3.5 h-3.5 text-brand-sage shrink-0" />
      <span className="whitespace-nowrap">{plan.name}{value ? <> · {value}</> : null}</span>
    </button>
  )
}

// ── Иконка «?» с поповером «что такое энергия» (рядом с бейджем в шапке) ──
// Объясняет на месте, не уводя в настройки. Тон успокаивающий: почти все бесплатно.
// placement задает позицию поповера так, чтобы он не уезжал за край в обоих местах:
// 'header' (мобильная шапка) — fixed в правом верхнем углу под шапкой, всегда влезает;
// 'sidebar' (низ десктоп-сайдбара) — открывается вверх и вправо, не режется низом экрана.
export function EnergyInfo({ placement = 'header' }: { placement?: 'header' | 'sidebar' } = {}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const sidebar = placement === 'sidebar'
  const popClass = sidebar ? 'absolute bottom-full mb-2 left-0' : 'fixed top-14 right-4'
  const yFrom = sidebar ? 8 : -8

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="Что такое энергия"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="p-1 text-brand-muted hover:text-brand-accent transition cursor-pointer"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            initial={{ opacity: 0, y: yFrom }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: yFrom }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className={`${popClass} w-[280px] max-w-[calc(100vw-32px)] z-50 rounded-3xl bg-brand-soft border border-brand-border-soft shadow-[0_18px_40px_-16px_rgba(46,42,69,0.35)] p-4`}
          >
            <p className="font-bold text-brand-text text-sm mb-1.5">Почему почти все бесплатно</p>
            <p className="text-[13px] text-brand-muted leading-relaxed">
              Тексты можно писать сколько хочешь: посты, карусели, хуки, рилс, контент-план и карту бренда. Они энергию не трогают.
              Энергия нужна только для тяжелого: картинок к каруселям, расшифровки видео и глубокого разбора конкурента.
            </p>
            <button
              type="button"
              onClick={() => { setOpen(false); router.push('/dashboard/settings#energy') }}
              className="mt-2.5 text-[13px] font-semibold text-brand-accent hover:underline cursor-pointer"
            >
              Тариф и энергия
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="h-2 w-full bg-brand-soft-2 rounded-full overflow-hidden mt-3">
      <div className="h-full bg-brand-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Полная секция «Тариф и энергия» (экран настроек) ──
export function EnergyTariffPanel({ data }: { data?: Summary | null } = {}) {
  const auto = useAccount(data === undefined)
  const d = data === undefined ? auto : data

  if (!d?.plan) {
    return <div className="h-32 rounded-3xl bg-brand-soft animate-pulse" />
  }
  const { plan, energy, textTrial } = d

  const showTextUnlimited = !plan.isUnlimited && !textTrial && !!energy

  return (
    <div className="space-y-4">
      {/* Сначала успокоить: на платных тексты без ограничений */}
      {showTextUnlimited && (
        <div className="rounded-3xl bg-brand-soft border border-brand-border-soft p-5 sm:p-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-card flex items-center justify-center shrink-0">
            <InfinityIcon className="w-5 h-5 text-brand-sage" />
          </div>
          <div>
            <p className="font-semibold text-brand-text mb-1">Тексты без ограничений</p>
            <p className="text-sm text-brand-muted leading-relaxed">Посты, карусели, хуки, рилс, контент-план и карту бренда пиши сколько нужно. Они энергию не тратят.</p>
          </div>
        </div>
      )}

      {/* Энергия / пробы / безлимит */}
      {plan.isUnlimited ? (
        <div className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-soft flex items-center justify-center shrink-0">
            <InfinityIcon className="w-5 h-5 text-brand-sage" />
          </div>
          <div>
            <p className="font-semibold text-brand-text mb-1">Без ограничений</p>
            <p className="text-sm text-brand-muted leading-relaxed">Энергия не расходуется. Пользуйся всеми инструментами свободно.</p>
          </div>
        </div>
      ) : textTrial ? (
        <div className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-brand-text">Пробные генерации</p>
            <p className="text-sm font-semibold text-brand-accent">{textTrial.remaining} из {textTrial.cap}</p>
          </div>
          <Bar value={textTrial.remaining} max={textTrial.cap} />
          <p className="text-sm text-brand-muted leading-relaxed mt-3">
            Пробный доступ к AI-картинкам, транскрибации и глубокому анализу конкурента, по одному разу.
          </p>
        </div>
      ) : energy ? (
        <div className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-brand-text">Энергия</p>
            <p className="text-sm font-semibold text-brand-accent">
              {energy.balance} <span className="text-brand-muted font-normal">из {energy.monthlyAllowance}</span>
            </p>
          </div>
          <Bar value={energy.balance} max={energy.monthlyAllowance} />
          {energy.nextRefill && (
            <p className="text-sm text-brand-muted leading-relaxed mt-3">
              Обновится {refillDate(energy.nextRefill)}
            </p>
          )}
        </div>
      ) : null}

      {/* Пояснение */}
      <div className="rounded-3xl bg-brand-soft border border-brand-border-soft p-5 sm:p-6 flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-brand-card flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-brand-sage" />
        </div>
        <p className="text-sm text-brand-text leading-relaxed">
          Энергия нужна только для дорогих операций: AI-картинок к каруселям, транскрибации видео и глубокого анализа конкурента.
          Посты, карусели, хуки, контент-план и паспорт энергию не расходуют.
        </p>
      </div>
    </div>
  )
}
