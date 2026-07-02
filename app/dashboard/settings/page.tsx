'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Settings as SettingsIcon, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { EnergyTariffPanel } from '@/components/EnergyTariff'
import TariffSection from '@/components/TariffSection'
import { isVoiceIncomplete } from '@/lib/profile-status'
import { ARCHETYPES, ARCHETYPE_ACCENT, archetypeLabel, flexibleLine, type ArchetypeSelection } from '@/lib/archetypes'
import { ArchetypeGlyph, FlexibleGlyph } from '@/lib/archetype-glyphs'
import Squiggle from '@/components/Squiggle'

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

interface Summary {
  plan: { code: string; name: string; isUnlimited: boolean; deepAnalysis: boolean }
  energy: { balance: number; monthlyAllowance: number; nextRefill: string | null } | null
  textTrial: { remaining: number; cap: number } | null
}

const ANCHORS = [
  { id: 'archetype', label: 'Архетип' },
  { id: 'voice', label: 'Голос' },
  { id: 'tariff', label: 'Тариф' },
  { id: 'energy', label: 'Энергия' },
]

export default function SettingsPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let on = true
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!on) return
      if (!user) { router.replace('/'); return }
      const [meRes, profRes] = await Promise.all([
        fetch('/api/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        supabase.from('onboarding_profiles').select('full_name, live_voice, values, archetype_scores, archetype_primary').eq('user_id', user.id).maybeSingle(),
      ])
      if (!on) return
      if (!meRes) { setStatus('error'); return }
      setSummary(meRes)
      setProfile(profRes.data || null)
      setStatus('ready')
    }
    load()
    return () => { on = false }
  }, [router])

  // Якорный переход с #energy из бейджа в шапке
  useEffect(() => {
    if (status !== 'ready') return
    const hash = window.location.hash.replace('#', '')
    if (hash) {
      const el = document.getElementById(hash)
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }, [status])

  const incomplete = isVoiceIncomplete(profile)

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Шапка */}
      <nav className="sticky top-0 z-40 bg-brand-card/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 -ml-2 text-brand-muted hover:text-brand-text hover:bg-brand-soft rounded-2xl transition cursor-pointer"
            aria-label="Назад в кабинет"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <SettingsIcon className="w-5 h-5 text-brand-sage" />
          <span className="font-bold text-brand-text">Настройки</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-brand-text mb-1">Настройки</h1>
          <p className="text-brand-muted">Твой голос, тариф и энергия в одном месте.</p>

          {/* Якорные чипы (десктоп) */}
          <div className="hidden sm:flex items-center gap-2 mt-5">
            {ANCHORS.map((a) => (
              <a
                key={a.id}
                href={`#${a.id}`}
                className="px-3 py-1.5 rounded-2xl bg-brand-card border border-brand-border text-sm text-brand-muted hover:text-brand-text hover:border-brand-accent/40 transition"
              >
                {a.label}
              </a>
            ))}
          </div>
        </motion.div>

        {status === 'loading' && (
          <div className="mt-8 space-y-4">
            <div className="h-28 rounded-3xl bg-brand-soft animate-pulse" />
            <div className="h-40 rounded-3xl bg-brand-soft animate-pulse" />
          </div>
        )}

        {status === 'error' && (
          <div className="mt-8 rounded-3xl bg-brand-soft border border-brand-border-soft p-6 text-center">
            <p className="text-brand-text font-semibold mb-1">Не получилось загрузить настройки</p>
            <p className="text-sm text-brand-muted mb-4">Похоже, временный сбой связи.</p>
            <button onClick={() => window.location.reload()} className="btn-primary px-5 py-2.5 text-sm">Обновить</button>
          </div>
        )}

        {status === 'ready' && (
          <div className="mt-8 space-y-12">
            {/* ── Твой архетип ── */}
            <section id="archetype" className="scroll-mt-20">
              <SectionTitle>Твой архетип</SectionTitle>
              {(() => {
                const sel: ArchetypeSelection | null = profile?.archetype_scores?.selection || (profile?.archetype_primary ? { primary: profile.archetype_primary } : null)
                if (!sel || !sel.primary) {
                  return (
                    <div className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6">
                      <h3 className="text-lg font-bold text-brand-text mb-1">Узнай свой архетип</h3>
                      <p className="text-sm text-brand-muted leading-relaxed mb-4">Тест на семь минут. Поймем, какой ты автор, и посты начнут собираться в твоем голосе.</p>
                      <button onClick={() => router.push('/onboarding/archetype')} className="inline-flex items-center gap-2 text-brand-accent font-semibold text-sm rounded-2xl px-5 py-2.5 border border-brand-accent/40 hover:bg-brand-soft transition cursor-pointer">Пройти тест <ArrowRight className="w-4 h-4" /></button>
                    </div>
                  )
                }
                const pk = sel.primary
                const accent = sel.flexible ? '#5B4FA0' : ARCHETYPE_ACCENT[pk]
                const top3 = (profile?.archetype_scores?.top3 || []) as { key: keyof typeof ARCHETYPES; percent: number }[]
                return (
                  <div className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: accent + '1A' }}>
                        <div style={{ color: accent }}>{sel.flexible ? <FlexibleGlyph size={30} /> : <ArchetypeGlyph k={pk} size={30} />}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-brand-text">{archetypeLabel(sel)}</h3>
                        <p className="text-sm text-brand-muted leading-relaxed mt-0.5">
                          {sel.flexible ? flexibleLine(sel) : cap(ARCHETYPES[pk].gift)}
                        </p>
                      </div>
                    </div>
                    {top3.length > 0 && (
                      <div className="mt-4 space-y-2 max-w-[420px]">
                        {top3.map((t) => (
                          <div key={t.key}>
                            <div className="flex items-baseline justify-between mb-1"><span className="text-sm text-brand-text">{ARCHETYPES[t.key].name}</span><span className="text-xs text-brand-muted tabular-nums">{t.percent}</span></div>
                            <div className="h-1.5 rounded-full bg-brand-soft overflow-hidden"><div className="h-full rounded-full" style={{ width: `${t.percent}%`, backgroundColor: ARCHETYPE_ACCENT[t.key] }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => { if (window.confirm('Пройти тест заново? Твой текущий архетип заменится новым результатом.')) router.push('/onboarding/archetype') }} className="mt-5 text-sm text-brand-muted/80 hover:text-brand-text transition cursor-pointer">Пройти тест заново</button>
                  </div>
                )
              })()}
            </section>

            {/* ── Голос (профиль) ── */}
            <section id="voice" className="scroll-mt-20">
              <SectionTitle>Голос</SectionTitle>
              {incomplete ? (
                <div className="soft-panel">
                  <p className="text-xs font-bold text-brand-accent uppercase tracking-widest mb-2">Звучит как ты</p>
                  <h3 className="text-xl font-bold text-brand-text mb-1">Настроить голос точнее</h3>
                  <Squiggle variant={1} width="120px" />
                  <p className="text-sm text-brand-muted leading-relaxed mt-3 mb-1">
                    Сейчас PsyCont знает о тебе главное. Добавь ценности, живые фразы и тон, и посты станут еще больше похожи на тебя, а не на нейросеть.
                  </p>
                  <p className="text-xs text-brand-muted mb-4">Основное готово, осталось дописать голос.</p>
                  <button
                    onClick={() => router.push('/dashboard/edit-profile?deepen=1')}
                    className="inline-flex items-center gap-2 bg-brand-accent text-white font-semibold text-sm rounded-2xl px-5 py-2.5 hover:bg-brand-accent-hover transition cursor-pointer"
                  >
                    Дополнить профиль <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-brand-text mb-1">Профиль и голос</h3>
                  <p className="text-sm text-brand-muted leading-relaxed mb-4">
                    Отсюда PsyCont берет твою манеру: подход, тон, ценности, фразы. Меняешь что угодно, и посты подстраиваются.
                  </p>
                  <button
                    onClick={() => router.push('/dashboard/edit-profile')}
                    className="inline-flex items-center gap-2 text-brand-accent font-semibold text-sm rounded-2xl px-5 py-2.5 border border-brand-accent/40 hover:bg-brand-soft transition cursor-pointer"
                  >
                    Редактировать профиль <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </section>

            {/* ── Тариф ── */}
            <section id="tariff" className="scroll-mt-20">
              <SectionTitle>Тариф</SectionTitle>
              <TariffSection currentCode={summary?.plan?.code} />
            </section>

            {/* ── Энергия ── */}
            <section id="energy" className="scroll-mt-20">
              <SectionTitle>Энергия</SectionTitle>
              <EnergyTariffPanel data={summary} />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold text-brand-muted uppercase tracking-widest mb-4">{children}</h2>
}
