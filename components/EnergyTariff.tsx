'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Infinity as InfinityIcon } from 'lucide-react'

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

// ── Компактная плашка в шапке дашборда (ведёт в «Тариф и энергия») ──
export function EnergyBadge({ data }: { data?: Summary | null } = {}) {
  const auto = useAccount(data === undefined)
  const d = data === undefined ? auto : data
  const router = useRouter()
  if (!d?.plan) return null
  const { plan, energy, textTrial } = d

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
      onClick={() => router.push('/dashboard/settings')}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-brand-soft border border-brand-border-soft text-sm text-brand-text font-medium hover:border-brand-accent/40 transition cursor-pointer"
    >
      <Zap className="w-3.5 h-3.5 text-brand-sage shrink-0" />
      <span className="whitespace-nowrap">{plan.name}{value ? <> · {value}</> : null}</span>
    </button>
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

  return (
    <div className="space-y-4">
      {/* Тариф */}
      <div className="rounded-3xl bg-brand-soft border border-brand-border-soft p-5 sm:p-6">
        <p className="text-xs font-bold text-brand-muted uppercase tracking-widest mb-1">Ваш тариф</p>
        <p className="text-2xl sm:text-3xl font-bold text-brand-accent leading-tight">{plan.name}</p>
      </div>

      {/* Энергия / пробы / безлимит */}
      {plan.isUnlimited ? (
        <div className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-soft flex items-center justify-center shrink-0">
            <InfinityIcon className="w-5 h-5 text-brand-sage" />
          </div>
          <div>
            <p className="font-semibold text-brand-text mb-1">Без ограничений</p>
            <p className="text-sm text-brand-muted leading-relaxed">Энергия не расходуется. Пользуйтесь всеми инструментами свободно.</p>
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
            Пробный доступ к AI-картинкам, транскрибации и глубокому анализу конкурента — по одному разу.
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
          <p className="text-sm text-brand-muted leading-relaxed mt-3">
            {energy.nextRefill ? `Обновится ${refillDate(energy.nextRefill)}. ` : ''}Тексты энергию не тратят — они без ограничений.
          </p>
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
