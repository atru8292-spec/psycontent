'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Sparkles, Mic, ArrowRight, Loader2, SlidersHorizontal, ChevronDown } from 'lucide-react'
import Squiggle from '@/components/Squiggle'

// Метки подхода = ровно ключи getApproachContext в generate-post (иначе стилевой блок
// молча провалится в «Интегративный»). Матчинг там по includes в обе стороны.
const APPROACHES = [
  'КПТ', 'Гештальт', 'ACT', 'Психоанализ', 'Схема-терапия', 'ЭФТ',
  'EMDR', 'Нарративная терапия', 'Телесно-ориентированная', 'Экзистенциальный', 'Арт-терапия', 'Интегративный',
]

const NICHES = [
  'Тревога и паника', 'Отношения и привязанность', 'Самооценка и самозванец', 'Выгорание и стресс',
  'Травма', 'Депрессия и апатия', 'Детско-родительское', 'Психосоматика',
]

export default function ExpressOnboarding() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [fullName, setFullName] = useState('')
  const [approaches, setApproaches] = useState<string[]>([])
  const [nicheChip, setNicheChip] = useState<string | null>(null)
  const [nicheText, setNicheText] = useState('')
  const [toneVerbal, setToneVerbal] = useState('')
  const [pain, setPain] = useState('')
  // Бегунки тона: необязательные, по умолчанию по центру (50 = нейтрально в промпте).
  // Дополняют текстовое поле манеры, не заменяют. Ориентация под движок profile-context:
  // высокое значение = формальный / серьезный / осторожный.
  const [toneFormal, setToneFormal] = useState(50)
  const [toneSerious, setToneSerious] = useState(50)
  const [toneCautious, setToneCautious] = useState(50)
  // Бегунки спрятаны по умолчанию, чтобы не раздувать вопрос и держать краткость экспресса
  const [showTone, setShowTone] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return
      if (!user) { router.replace('/'); return }
      // предзаполнить имя из метаданных сессии (Яндекс/почта обычно отдают)
      const metaName = (user.user_metadata?.full_name || user.user_metadata?.name || '') as string
      if (metaName) setFullName(metaName)
      // если профиль уже есть, не держим на экспрессе (анти-цикл)
      const { data, error: readErr } = await supabase
        .from('onboarding_profiles').select('user_id').eq('user_id', user.id).single()
      if (!active) return
      if (data) { router.replace('/dashboard'); return }
      // PGRST116 = строки нет, нормальный путь -> показываем форму.
      // Иной сбой чтения = НЕ действуем вслепую (иначе upsert перезатрет профиль), уводим в кабинет.
      if (readErr && readErr.code !== 'PGRST116') { router.replace('/dashboard'); return }
      setReady(true)
    })
    return () => { active = false }
  }, [router])

  const toggleApproach = (a: string) => {
    setApproaches((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : prev.length >= 3 ? prev : [...prev, a]
    )
  }

  const oneNiche = (nicheText.trim() || nicheChip || '')
  const canSubmit = Boolean(fullName.trim() && approaches.length > 0 && toneVerbal.trim())

  const handleSubmit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/'); return }

    const profileData = {
      user_id: user.id,
      full_name: fullName.trim(),
      approaches,
      niches: nicheChip ? [nicheChip] : [],
      one_niche: oneNiche,
      tone_verbal: toneVerbal.trim(),
      tone_formal: toneFormal,
      tone_serious: toneSerious,
      tone_cautious: toneCautious,
      client_pain_phrases: pain.trim(),
    }

    // upsert, чтобы полная распаковка потом ДОПОЛНЯЛА строку, а не падала на дубле user_id
    const { error: saveErr } = await supabase
      .from('onboarding_profiles').upsert(profileData, { onConflict: 'user_id' })

    if (saveErr) {
      setError('Не получилось сохранить. Проверь связь и попробуй еще раз.')
      setSaving(false)
      return
    }
    // мостик-оверлей держим коротко, затем к первому посту с авто-генерацией
    setTimeout(() => router.push('/dashboard/post-generator?first=1&auto=1'), 800)
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-32">
        {/* Шапка экрана */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-1.5 bg-brand-soft text-brand-accent px-3 py-1.5 rounded-full text-xs font-bold mb-4">
            <Sparkles className="w-3.5 h-3.5" /> 5 коротких вопросов
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-text">Пара минут, и соберем первый пост</h1>
          <div className="flex justify-center"><Squiggle variant={1} width="180px" /></div>
          <p className="text-sm text-brand-text-secondary mt-3 max-w-md mx-auto">
            Нам хватит главного: кто ты, как говоришь и для кого пишешь. Остальное настроим потом.
          </p>
        </motion.div>

        <div className="space-y-7">
          {/* 1. Имя */}
          <Question num={1} title="Как тебя зовут?" subtitle="Чтобы посты звучали от живого человека, а не от сервиса.">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Например, Анна"
              aria-label="Как тебя зовут"
              className="w-full p-4 rounded-2xl border-[1.5px] border-brand-border focus:border-brand-accent outline-none text-base bg-white"
            />
          </Question>

          {/* 2. Подход */}
          <Question num={2} title="В каком подходе работаешь?" subtitle="Можно выбрать до трех, если совмещаешь.">
            <div className="flex flex-wrap gap-2.5">
              {APPROACHES.map((a) => {
                const on = approaches.includes(a)
                const muted = !on && approaches.length >= 3
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleApproach(a)}
                    className={`px-4 py-2.5 rounded-full border-[1.5px] text-sm font-medium transition-colors cursor-pointer ${
                      on ? 'border-brand-accent bg-brand-soft text-brand-accent'
                      : muted ? 'border-brand-border bg-brand-card text-brand-muted/50'
                      : 'border-brand-border bg-brand-card text-brand-text hover:border-brand-accent/40'
                    }`}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </Question>

          {/* 3. Ниша */}
          <Question num={3} title="С чем работаешь чаще всего?" subtitle="Та тема, ради которой тебе не лень вставать на сессию.">
            <div className="flex flex-wrap gap-2.5 mb-3">
              {NICHES.map((n) => {
                const on = nicheChip === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { setNicheChip(on ? null : n); setNicheText('') }}
                    className={`px-4 py-2.5 rounded-full border-[1.5px] text-sm font-medium transition-colors cursor-pointer ${
                      on ? 'border-brand-accent bg-brand-soft text-brand-accent' : 'border-brand-border bg-brand-card text-brand-text hover:border-brand-accent/40'
                    }`}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <input
              value={nicheText}
              onChange={(e) => { setNicheText(e.target.value); if (e.target.value) setNicheChip(null) }}
              placeholder="Или впиши свое"
              aria-label="С чем работаешь чаще всего"
              className="w-full p-4 rounded-2xl border-[1.5px] border-brand-border focus:border-brand-accent outline-none text-base bg-white"
            />
          </Question>

          {/* 4. Манера (текст + голос-заглушка) */}
          <Question num={4} title="Как ты говоришь с клиентами?" subtitle="Пара фраз так, как ты обычно говоришь. Можно наговорить голосом.">
            <VoiceField
              value={toneVerbal}
              onChange={setToneVerbal}
              placeholder="Например: давай по-честному, без умных слов и без обесценивания"
              ariaLabel="Как ты говоришь с клиентами"
            />
            <button
              type="button"
              onClick={() => setShowTone((v) => !v)}
              aria-expanded={showTone}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-text transition cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Тонкая настройка тона, по желанию
              <ChevronDown className={`w-4 h-4 transition-transform ${showTone ? 'rotate-180' : ''}`} />
            </button>
            {showTone && (
              <ToneSliders
                formal={toneFormal} serious={toneSerious} cautious={toneCautious}
                setFormal={setToneFormal} setSerious={setToneSerious} setCautious={setToneCautious}
              />
            )}
          </Question>

          {/* 5. Боль клиента (текст + голос-заглушка) */}
          <Question num={5} title="Какими словами твой клиент описывает боль?" subtitle="Одна, две живые фразы, которые ты слышишь на первых сессиях.">
            <VoiceField
              value={pain}
              onChange={setPain}
              placeholder="Например: устала быть сильной. Мозг не выключается даже в отпуске."
              ariaLabel="Какими словами клиент описывает боль"
            />
          </Question>

          {error && (
            <div className="bg-brand-soft border border-brand-border rounded-2xl p-4 text-sm text-brand-text">
              {error}
            </div>
          )}

          {/* Кнопка */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              className={`w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition ${
                canSubmit && !saving
                  ? 'bg-brand-accent text-white hover:bg-brand-accent-hover shadow-lg shadow-brand-accent/20 cursor-pointer'
                  : 'bg-brand-soft text-brand-muted cursor-not-allowed'
              }`}
            >
              {saving ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Собираю первый пост</>
              ) : (
                <><Sparkles className="w-5 h-5" /> Собрать первый пост <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
            <p className="text-center text-xs text-brand-muted mt-2">Это займет меньше минуты</p>
          </div>
        </div>
      </div>

      {/* Мостик-оверлей при сабмите */}
      {saving && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 bg-brand-bg/95 backdrop-blur-sm flex items-center justify-center"
        >
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="text-center">
            <div className="flex justify-center"><Squiggle variant={0} width="160px" /></div>
            <p className="text-brand-text font-semibold mt-3">Твой голос у нас. Собираю первый пост</p>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function Question({ num, title, subtitle, children }: { num: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-start gap-2.5 mb-3">
        <span className="w-6 h-6 rounded-full bg-brand-soft text-brand-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{num}</span>
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-brand-text leading-tight">{title}</h2>
          {subtitle && <p className="text-sm text-brand-text-secondary mt-1">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function VoiceField({ value, onChange, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string }) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={2}
        className="w-full p-4 pr-14 rounded-2xl border-[1.5px] border-brand-border focus:border-brand-accent outline-none text-base bg-white resize-none"
      />
      <button
        type="button"
        title="голосовой ввод скоро"
        aria-label="Голосовой ввод, скоро"
        className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-brand-soft text-brand-accent flex items-center justify-center hover:bg-brand-soft/70 transition cursor-pointer"
      >
        <Mic className="w-4 h-4" />
      </button>
    </div>
  )
}

// Бегунки тона, необязательные. Дополняют поле манеры. Высокое значение = формальный/
// серьезный/осторожный (так читает движок profile-context). По умолчанию 50 (нейтрально).
function ToneSliders(props: {
  formal: number; serious: number; cautious: number
  setFormal: (n: number) => void; setSerious: (n: number) => void; setCautious: (n: number) => void
}) {
  const axes = [
    { left: 'Разговорный', right: 'Формальный', value: props.formal, set: props.setFormal },
    { left: 'С юмором', right: 'Серьезный', value: props.serious, set: props.setSerious },
    { left: 'Прямой', right: 'Осторожный', value: props.cautious, set: props.setCautious },
  ]
  return (
    <div className="mt-3 rounded-2xl bg-brand-card border border-brand-border p-4">
      <p className="text-xs text-brand-muted mb-3">Можно подвинуть тон, по желанию. По умолчанию посередине.</p>
      <div className="space-y-3.5">
        {axes.map((ax) => (
          <div key={ax.left}>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className={ax.value < 50 ? 'text-brand-accent' : 'text-brand-muted'}>{ax.left}</span>
              <span className={ax.value > 50 ? 'text-brand-accent' : 'text-brand-muted'}>{ax.right}</span>
            </div>
            <input
              type="range" min={0} max={100} value={ax.value}
              onChange={(e) => ax.set(Number(e.target.value))}
              aria-label={`${ax.left} или ${ax.right}`}
              className="w-full cursor-pointer"
              style={{ accentColor: 'var(--color-brand-accent)' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
