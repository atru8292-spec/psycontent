'use client'

// «Покажи, как ты говоришь» (08-GOLOS-I-OBUCHENIE.md). Три способа дать живую речь, хватит любого:
// сказать по-своему гладкую фразу, объяснить голосом, дать блог. Сверху «Вот как я тебя слышу»,
// чтобы было видно, что сервис понял, и можно было поправить. Ручные настройки свернуты вниз.
// Поля из миграции 20260930120000_generation_brain.sql.

import { useFeatureOpen, useTrackOnce } from '@/lib/analytics/hooks'
import { TONE_POSITIONS, tonePosition, toneAxisState, type ToneAxis } from '@/lib/generation/tone'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Trash2, Check, ChevronDown, Mic } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import VoiceTextarea from '@/components/VoiceTextarea'
import { QUIET_BTN, QUIET_BTN_MUTED } from '@/lib/ui-classes'
import { MANERY, MANERA_MAX, maneraIz } from '@/lib/manera'

type Story = { text: string; level: 'personal' | 'work' | 'practice' }

const MAX_TEXTS = 3

// Гладкие фразы «как у всех»: психолог говорит их по-своему, и мы слышим ее словарь.
const SMOOTH = [
  'Важно принимать свои эмоции.',
  'Границы нужны, чтобы сохранять себя в отношениях.',
  'Тревога это сигнал, который стоит услышать.',
]
const EXPLAIN_Q = 'Как ты объясняешь клиенту, почему нельзя просто взять и перестать тревожиться? Расскажи так, как говоришь в кабинете.'

// Ошибки на экране голоса: свой текст без сырого ответа сервера и без «я» сервиса (словарь 17.11)
const NET_ERR = 'Пропала связь. Проверь интернет и нажми еще раз'
function importErrorText(status: number, err: unknown): string {
  const e = typeof err === 'string' ? err : ''
  if (status === 400 && /ссылк/i.test(e)) return 'Ссылка не похожа на канал. Нужна вида t.me/имя_канала'
  if (status === 400 && /открыл/i.test(e)) return 'Канал не открылся. Он точно открытый?'
  if (status === 400 && /пост/i.test(e)) return 'В канале нет постов длиннее пары строк'
  return 'Посты не загрузились из-за сбоя в PsyCont. Попробуй через минуту'
}

type Heard = { summary: string; signatures: string[]; updatedAt: string | null; changeLine: string; tgChannel: string; samplesCount: number }

async function postEvent(body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch('/api/voice-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return r.ok
  } catch { return false }
}

const DISCLOSURE = [
  { v: 1, label: 'Открыто', hint: 'можно про жизнь, семью, прошлое, но только из историй ниже' },
  { v: 2, label: 'Про работу', hint: 'учеба, своя терапия, почему в профессии; про семью и личное нет' },
  { v: 3, label: 'Только практика', hint: 'о себе почти ничего' },
]
const LEVELS: { v: Story['level']; label: string }[] = [
  { v: 'personal', label: 'Личное' },
  { v: 'work', label: 'Про работу' },
  { v: 'practice', label: 'Из практики' },
]

function Choice<T extends string | number>({ value, options, onChange }: { value: T | null; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 rounded-full text-sm border transition cursor-pointer ${value === o.v ? 'bg-brand-accent text-white border-brand-accent' : 'bg-white text-brand-text-secondary border-brand-border hover:border-brand-accent'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Кодовое слово и звездочки в мате: колонки onboarding_profiles.kodovoe_slovo и mat_zvezdy. Пока миграции нет,
// база отвечает «нет такой колонки», тогда пишем в habits (сливаем с тем, что там уже лежит) и ошибку не показываем
type Extra = { kodovoe_slovo?: string | null; mat_zvezdy?: boolean | null }
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST204' || e.code === '42703' || /kodovoe_slovo|mat_zvezdy/.test(String(e.message || '')))
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

async function saveExtra(userId: string, patch: Extra): Promise<boolean> {
  const { error } = await supabase.from('onboarding_profiles').update(patch).eq('user_id', userId)
  const { data, error: readErr } = await supabase.from('onboarding_profiles').select('habits').eq('user_id', userId).maybeSingle()
  if (!error) {
    // колонка есть: старое значение из habits убираем, иначе после очистки поля оно вернется при чтении
    if (readErr) return true
    const h = asObj(data?.habits)
    if (!Object.keys(patch).some(k => k in h)) return true
    const next = { ...h }
    for (const k of Object.keys(patch)) delete next[k]
    await supabase.from('onboarding_profiles').update({ habits: next }).eq('user_id', userId)
    return true
  }
  if (!isMissingColumn(error) || readErr) return false
  const next: Record<string, unknown> = { ...asObj(data?.habits) }
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined) delete next[k]; else next[k] = v }
  const { error: e2 } = await supabase.from('onboarding_profiles').update({ habits: next }).eq('user_id', userId)
  return !e2
}

// чтение: колонка, иначе habits
function readExtra(p: Record<string, any>): { kod: string; zvezdy: boolean | null } {
  const h = asObj(p.habits)
  const kod = typeof p.kodovoe_slovo === 'string' && p.kodovoe_slovo ? p.kodovoe_slovo : typeof h.kodovoe_slovo === 'string' ? h.kodovoe_slovo : ''
  const zvezdy = typeof p.mat_zvezdy === 'boolean' ? p.mat_zvezdy : typeof h.mat_zvezdy === 'boolean' ? h.mat_zvezdy : null
  return { kod, zvezdy }
}
const field = 'w-full px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent'

export default function VoicePage() {
  const router = useRouter()
  useFeatureOpen('voice')
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [heard, setHeard] = useState<Heard | null>(null)
  const [heardVerdict, setHeardVerdict] = useState<'ok' | 'fix' | 'sent' | null>(null)
  const [heardNote, setHeardNote] = useState('')

  // Скажи по-своему
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [phraseAnswer, setPhraseAnswer] = useState('')
  const [phrasesDone, setPhrasesDone] = useState(0)
  const [repeat, setRepeat] = useState('')
  const [repeatSaved, setRepeatSaved] = useState(false)

  // Объясни голосом
  const [explain, setExplain] = useState('')
  const [explainSaved, setExplainSaved] = useState(false)

  // Блог
  const [tg, setTg] = useState('')
  const [importing, setImporting] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [texts, setTexts] = useState<string[]>([''])
  const [building, setBuilding] = useState(false)

  // Уточнить вручную
  const [manualOpen, setManualOpen] = useState(false)
  const [gender, setGender] = useState<'female' | 'male' | null>(null)
  const [address, setAddress] = useState<'ty' | 'vy' | 'vy_devochki' | null>(null)
  const [profanity, setProfanity] = useState<'no' | 'light' | 'free' | null>(null)
  const [intensity, setIntensity] = useState<'calm' | 'live' | 'hot' | null>(null)
  // манера из знакомства (27.11), до двух; тот же выбор, что на шаге 5 знакомства
  const [manera, setManera] = useState<string[]>([])
  // ползунки тона (те же, что в экспрессе): 0..100, высокое = формально / серьезно / бережно
  const [tone, setTone] = useState<Record<ToneAxis, number>>({ tone_formal: 50, tone_serious: 50, tone_cautious: 50 })
  const [toneSaved, setToneSaved] = useState<string | null>(null)
  const [disclosure, setDisclosure] = useState<1 | 2 | 3 | null>(null)
  const [audience, setAudience] = useState('')
  const [booking, setBooking] = useState('')
  const [kod, setKod] = useState('')
  // кодовое слово и звездочки читает только zh6: без него экран как в main (признак отдает /api/generate-post/formaty)
  const [zh6Ui, setZh6Ui] = useState(false)
  const [kodTouched, setKodTouched] = useState(false) // ошибку показываем после ухода из поля, не на первой букве
  const [matZvezdy, setMatZvezdy] = useState<boolean | null>(null)
  const [firstSession, setFirstSession] = useState('')
  const [position, setPosition] = useState('')
  const [character, setCharacter] = useState('')
  const [stories, setStories] = useState<Story[]>([])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(false)

  const [message, setMessage] = useState<string | null>(null)

  const loadHeard = async () => {
    try {
      const r = await fetch('/api/voice-core')
      if (r.ok) {
        const d: Heard = await r.json()
        setHeard(d)
        if (d.tgChannel) setTg(v => v || d.tgChannel)
      }
    } catch { /* блок просто не покажем */ }
  }

  useEffect(() => {
    fetch('/api/generate-post/formaty').then(r => r.ok ? r.json() : null).then(d => setZh6Ui(d?.zh6 === true)).catch(() => {})
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      setUserId(user.id)
      const { data: p } = await supabase.from('onboarding_profiles').select('*').eq('user_id', user.id).maybeSingle()
      if (p) {
        setGender(p.author_gender ?? null)
        setAddress(p.reader_address ?? null)
        setProfanity(p.profanity ?? null)
        setIntensity(p.intensity ?? null)
        setManera(maneraIz(p.manera))
        // ?? 50, не || 50: ноль это валидный край «очень разговорно»
        setTone({ tone_formal: p.tone_formal ?? 50, tone_serious: p.tone_serious ?? 50, tone_cautious: p.tone_cautious ?? 50 })
        setDisclosure(p.disclosure ?? null)
        setAudience(p.audience || '')
        setBooking(p.booking_info || '')
        const ex = readExtra(p)
        setKod(ex.kod)
        setMatZvezdy(ex.zvezdy)
        setFirstSession(p.first_session_info || '')
        setPosition(p.position_text || '')
        setCharacter(p.character_text || '')
        setStories(Array.isArray(p.story_bank) ? p.story_bank : [])
      }
      await loadHeard()
      setLoading(false)
    }
    load()
  }, [router])

  const sendPhrase = async () => {
    const after = phraseAnswer.trim()
    if (!after) return
    const ok = await postEvent({ action: 'rephrase', before: SMOOTH[phraseIdx], after })
    if (!ok) { setMessage('Не получилось сохранить. Попробуй еще раз чуть позже.'); return }
    setPhrasesDone(n => n + 1)
    setPhraseAnswer('')
    setPhraseIdx(i => (i + 1) % SMOOTH.length)
  }

  const sendRepeat = async () => {
    if (!repeat.trim()) return
    const ok = await postEvent({ action: 'repeat_phrases', text: repeat.trim() })
    if (ok) setRepeatSaved(true)
    else setMessage('Не получилось сохранить. Попробуй еще раз чуть позже.')
  }

  const sendExplain = async () => {
    if (explain.trim().length < 60) return
    const ok = await postEvent({ action: 'speech', text: explain.trim(), typed: true })
    if (ok) setExplainSaved(true)
    else setMessage('Не получилось сохранить. Попробуй еще раз чуть позже.')
  }

  const afterRebuild = async (d: any) => {
    await loadHeard()
    setHeardVerdict(null)
    setMessage(d?.needMoreSamples
      ? 'Готово. Живых текстов пока мало, поэтому описание примерное. Любой способ выше его уточнит.'
      : 'Готово. Проверь наверху, похоже ли описание на тебя.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const importTg = async () => {
    if (!tg.trim()) return
    setImporting(true); setMessage(null)
    try {
      const r = await fetch('/api/voice-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: tg.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMessage(importErrorText(r.status, d?.error)); return }
      await afterRebuild(d)
    } catch {
      setMessage(NET_ERR)
    } finally {
      setImporting(false)
    }
  }

  const buildFromPasted = async () => {
    setBuilding(true); setMessage(null)
    try {
      const r = await fetch('/api/voice-core', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: texts.filter(t => t.trim()) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMessage(typeof d?.error === 'string' && d.error.startsWith('Пока нет') ? 'Пока не из чего услышать голос: вставь хотя бы один свой пост' : 'Голос не собрался из-за сбоя в PsyCont. Попробуй через минуту'); return }
      setTexts([''])
      setPasteOpen(false)
      await afterRebuild(d)
    } catch {
      setMessage(NET_ERR)
    } finally {
      setBuilding(false)
    }
  }

  const sendHeardFeedback = async (ok: boolean) => {
    if (ok) { setHeardVerdict('ok') }
    try {
      await fetch('/api/voice-core/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok, note: ok ? '' : heardNote.trim() }),
      })
    } catch { /* не критично */ }
    if (!ok) { setHeardVerdict('sent'); setHeardNote('') }
  }

  // Мат и эмоции сохраняются сразу по клику: это главные ручки голоса, без кнопки «Сохранить»
  const saveTone = async (patch: { profanity?: string; intensity?: string; manera?: string[] } | Partial<Record<ToneAxis, number>>) => {
    if (!userId) return
    setToneSaved(null)
    const { error } = await supabase.from('onboarding_profiles').update(patch).eq('user_id', userId)
    setToneSaved(error ? 'Не сохранилось, попробуй еще раз' : 'Сохранено, следующие посты будут так')
  }

  // звездочки сохраняются сразу, как мат и эмоции
  const saveZvezdy = async (v: boolean) => {
    if (!userId) return
    setMatZvezdy(v); setToneSaved(null)
    const ok = await saveExtra(userId, { mat_zvezdy: v })
    setToneSaved(ok ? 'Сохранено, следующие посты будут так' : 'Не сохранилось, попробуй еще раз')
  }

  const kodTrim = kod.trim()
  const kodBad = zh6Ui && (kodTrim.length === 1 || kodTrim.length > 40)

  const saveSettings = async () => {
    if (!userId) return
    if (kodBad) { setKodTouched(true); setMessage('В кодовом слове должно быть от 2 до 40 знаков. Поправь, и можно сохранять.'); return }
    setSaving(true); setMessage(null); setSavedAt(false)
    const { error } = await supabase.from('onboarding_profiles').update({
      author_gender: gender,
      reader_address: address,
      profanity,
      intensity,
      disclosure,
      audience: audience.trim() || null,
      booking_info: booking.trim() || null,
      first_session_info: firstSession.trim() || null,
      position_text: position.trim() || null,
      character_text: character.trim() || null,
      story_bank: stories.filter(s => s.text.trim()).map(s => ({ text: s.text.trim(), level: s.level })),
    }).eq('user_id', userId)
    const kodOk = error || !zh6Ui ? true : await saveExtra(userId, { kodovoe_slovo: kodTrim || null })
    setSaving(false)
    if (error || !kodOk) setMessage('Не получилось сохранить. Попробуй еще раз чуть позже.')
    else setSavedAt(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-accent" />
      </div>
    )
  }

  const filled = texts.filter(t => t.trim().length >= 60).length
  const card = 'rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6 space-y-3'
  const primary = (on: boolean) => `inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold transition cursor-pointer ${on ? 'bg-brand-accent text-white hover:bg-brand-accent-hover' : 'bg-brand-border text-brand-text/70 cursor-not-allowed'}`

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <button onClick={() => router.push('/dashboard/settings')} className="inline-flex items-center gap-2 text-sm text-brand-muted hover:text-brand-text transition cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Настройки
        </button>

        <div>
          <h1 className="text-2xl font-bold text-brand-text">Покажи, как ты говоришь</h1>
          <p className="text-sm text-brand-muted mt-1 leading-relaxed">Хватит любого одного способа. Остальное доберется из постов, которые ты правишь перед публикацией.</p>
        </div>

        {/* Как я тебя слышу */}
        <section className="rounded-3xl bg-brand-soft p-5 sm:p-6 space-y-3">
          <h2 className="text-lg font-bold text-brand-text">Как звучит твой голос</h2>
          {heard?.summary ? (
            <>
              <p className="text-sm text-brand-text leading-relaxed whitespace-pre-wrap">{heard.summary}</p>
              {heard.signatures.length > 0 && (
                <p className="text-sm text-brand-text-secondary">Твои словечки: {heard.signatures.map(s => `«${s}»`).join(', ')}</p>
              )}
              {heard.updatedAt && <p className="text-xs text-brand-muted">Обновлено {new Date(heard.updatedAt).toLocaleDateString('ru-RU')}</p>}
              {heardVerdict === 'ok' && <p className="text-sm text-brand-text">Отлично, посты пишутся так.</p>}
              {heardVerdict === 'sent' && <p className="text-sm text-brand-text">Принято, это учтется в следующих постах.</p>}
              {heardVerdict === null && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => sendHeardFeedback(true)} className={QUIET_BTN}>Похоже</button>
                  <button type="button" onClick={() => setHeardVerdict('fix')} className={QUIET_BTN_MUTED}>Не совсем</button>
                </div>
              )}
              {heardVerdict === 'fix' && (
                <div className="space-y-2">
                  <textarea value={heardNote} onChange={e => setHeardNote(e.target.value)} rows={3} placeholder="Что не так? Например: я не шучу в постах, и никаких «дорогие»" className={`${field} resize-y`} />
                  <button type="button" disabled={!heardNote.trim()} onClick={() => sendHeardFeedback(false)} className={primary(!!heardNote.trim())}>Поправить</button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-brand-text-secondary leading-relaxed">Пока голоса мало. Выбери способ ниже, и тут появится описание твоей манеры. Если мимо, его можно поправить.</p>
          )}
        </section>

        {/* Как ты звучишь: мат и эмоции на виду, это то, что психологи чаще всего хотят поменять */}
        <section className={card}>
          <h2 className="text-lg font-bold text-brand-text">Как ты звучишь</h2>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Как ты пишешь в блоге</p>
            <p className="text-xs text-brand-muted leading-relaxed">Одну или две. Если не выбрано, первый текст спокойный, дальше PsyCont подстраивается под правки.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Как ты пишешь в блоге">
              {MANERY.map(m => {
                const on = manera.includes(m.kod)
                const off = !on && manera.length >= MANERA_MAX
                return (
                  <button key={m.kod} type="button" aria-pressed={on} aria-disabled={off || undefined} title={off ? 'Уже две. Сними одну, чтобы выбрать эту' : `«${m.primer}»`}
                    onClick={() => {
                      if (off) return
                      const next = on ? manera.filter(k => k !== m.kod) : [...manera, m.kod]
                      setManera(next); saveTone({ manera: next })
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm border transition cursor-pointer ${on ? 'bg-brand-accent text-white border-brand-accent' : off ? 'bg-white text-brand-muted border-dashed border-brand-border' : 'bg-white text-brand-text-secondary border-brand-border hover:border-brand-accent'}`}>
                    {m.imya}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Мат</p>
            <p className="text-xs text-brand-muted leading-relaxed">Мат разрешен, если он есть в твоей речи. Если в жизни можешь сказать «да пошло оно все», посты тоже могут. Тут никто не осудит.</p>
            <Choice value={profanity} onChange={v => { setProfanity(v); saveTone({ profanity: v }) }} options={[
              { v: 'no', label: 'Без мата' },
              { v: 'light', label: zh6Ui ? 'Иногда' : 'Иногда, со звездочкой' },
              { v: 'free', label: 'Как в жизни' },
            ]} />
            {zh6Ui && profanity && profanity !== 'no' && (
              <button type="button" role="switch" aria-checked={matZvezdy ?? profanity === 'light'} onClick={() => saveZvezdy(!(matZvezdy ?? profanity === 'light'))}
                className="w-full min-h-11 flex items-center gap-3 text-left cursor-pointer">
                <span className={`relative w-11 h-6 rounded-full transition shrink-0 ${(matZvezdy ?? profanity === 'light') ? 'bg-brand-accent' : 'bg-brand-border'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-[left] duration-150 ease-out ${(matZvezdy ?? profanity === 'light') ? 'left-[22px]' : 'left-0.5'}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-brand-text">Ставить звездочки в мате</span>
                  <span className="block text-xs text-brand-muted">Слово понятно, но не целиком: «п*здец»</span>
                </span>
              </button>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Эмоции</p>
            <Choice value={intensity} onChange={v => { setIntensity(v); saveTone({ intensity: v }) }} options={[
              { v: 'calm', label: 'Спокойно и ровно' },
              { v: 'live', label: 'Живо, как в разговоре' },
              { v: 'hot', label: 'На эмоциях, с огоньком' },
            ]} />
            <p className="text-xs text-brand-muted">{intensity === 'hot' ? 'Можно резко, с иронией, иногда капсом одно слово.' : intensity === 'calm' ? 'Без восклицаний и резких слов, мягко и по делу.' : intensity === 'live' ? 'Разговорные словечки, немного восклицаний, как в разговоре с близкими.' : 'Если не выбрано, эмоции берутся по твоим постам.'}</p>
          </div>
          <ToneSteps tone={tone} profanity={profanity} intensity={intensity}
            onChange={(axis, v) => { setTone(t => ({ ...t, [axis]: v })); saveTone({ [axis]: v }) }} />
          {toneSaved && <p className="text-xs text-brand-text">{toneSaved}</p>}
        </section>

        {message && <p className="text-sm text-brand-text bg-white border border-brand-border rounded-xl px-4 py-3">{message}</p>}

        {/* Скажи по-своему */}
        <section className={card}>
          <h2 className="text-lg font-bold text-brand-text">Скажи по-своему</h2>
          <p className="text-sm text-brand-muted leading-relaxed">Так пишут все. Как ты скажешь это клиенту? Голосом или текстом, как выйдет.</p>
          <p className="text-base font-semibold text-brand-text">«{SMOOTH[phraseIdx]}»</p>
          <VoiceTextarea value={phraseAnswer} onChange={setPhraseAnswer} minHeight={90} placeholder="Твоими словами" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!phraseAnswer.trim()} onClick={sendPhrase} className={primary(!!phraseAnswer.trim())}>Готово</button>
            <button type="button" onClick={() => { setPhraseAnswer(''); setPhraseIdx(i => (i + 1) % SMOOTH.length) }} className={QUIET_BTN_MUTED}>Другую фразу</button>
            {phrasesDone > 0 && <span className="text-xs text-brand-muted">Сохранено {phrasesDone} из {SMOOTH.length}</span>}
          </div>

          <div className="pt-3 border-t border-brand-border-soft space-y-2">
            <p className="text-sm font-semibold text-brand-text">Что ты чаще всего повторяешь клиентам?</p>
            {repeatSaved ? (
              <p className="text-sm text-brand-text-secondary">Сохранено. Эти фразы будут иногда появляться в постах, не в каждом.</p>
            ) : (
              <>
                <VoiceTextarea value={repeat} onChange={setRepeat} minHeight={70} placeholder="Одна-две фразы, как говоришь вслух" />
                <button type="button" disabled={!repeat.trim()} onClick={sendRepeat} className={primary(!!repeat.trim())}>Сохранить</button>
              </>
            )}
          </div>
        </section>

        {/* Объясни голосом */}
        <section className={card}>
          <h2 className="text-lg font-bold text-brand-text">Объясни голосом</h2>
          <p className="text-sm text-brand-muted leading-relaxed">{EXPLAIN_Q}</p>
          {explainSaved ? (
            <p className="text-sm text-brand-text-secondary">Спасибо, это самое ценное. По живой речи голос слышно лучше всего.</p>
          ) : (
            <>
              <VoiceTextarea value={explain} onChange={setExplain} minHeight={120} placeholder="Нажми на микрофон и говори минуту-две" />
              <p className="flex items-center gap-1.5 text-xs text-brand-muted"><Mic className="w-3.5 h-3.5" /> Говорить проще, чем писать, и речь живее. Оговорки не страшны.</p>
              <button type="button" disabled={explain.trim().length < 60} onClick={sendExplain} className={primary(explain.trim().length >= 60)}>Готово</button>
            </>
          )}
        </section>

        {/* Блог */}
        <section className={card}>
          <h2 className="text-lg font-bold text-brand-text">Есть блог</h2>
          <p className="text-sm text-brand-muted leading-relaxed">Дай ссылку на открытый Telegram-канал, прочитаются последние посты. Темы не берутся, только манера.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={tg} onChange={e => setTg(e.target.value)} placeholder="t.me/твой_канал" className={field} />
            <button type="button" disabled={!tg.trim() || importing} onClick={importTg} className={`${primary(!!tg.trim() && !importing)} shrink-0`}>
              {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Читается</> : 'Прочитать'}
            </button>
          </div>
          <button type="button" onClick={() => setPasteOpen(!pasteOpen)} aria-expanded={pasteOpen} className={`text-left ${QUIET_BTN}`}>
            {pasteOpen ? 'Свернуть' : 'Канала нет или он закрыт? Вставь 2-3 поста'}
          </button>
          {pasteOpen && (
            <div className="space-y-3">
              <p className="text-xs text-brand-muted">Лучше разные: длинный, короткий, злой, теплый. Анонсы и рекламу не надо, по ним голос не услышать.</p>
              {texts.map((t, i) => (
                <div key={i} className="relative">
                  <textarea
                    value={t}
                    onChange={e => setTexts(texts.map((x, j) => (j === i ? e.target.value : x)))}
                    rows={5}
                    placeholder={`Пост ${i + 1}`}
                    className={`${field} resize-y`}
                  />
                  {texts.length > 1 && (
                    <button type="button" aria-label="Убрать" onClick={() => setTexts(texts.filter((_, j) => j !== i))} className="absolute top-2 right-2 p-1.5 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-soft cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {texts.length < MAX_TEXTS && (
                <button type="button" onClick={() => setTexts([...texts, ''])} className={QUIET_BTN}>
                  <Plus className="w-4 h-4" /> Еще пост
                </button>
              )}
              <div>
                <button type="button" onClick={buildFromPasted} disabled={building || filled === 0} className={primary(!building && filled > 0)}>
                  {building ? <><Loader2 className="w-4 h-4 animate-spin" /> Читается</> : 'Послушать мои посты'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Уточнить вручную */}
        <section className="rounded-3xl bg-brand-card border border-brand-border">
          <button type="button" onClick={() => setManualOpen(!manualOpen)} className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 cursor-pointer">
            <span className="text-left">
              <span className="block text-base font-bold text-brand-text">Уточнить вручную</span>
              <span className="block text-xs text-brand-muted mt-0.5">Ты или вы, что можно о себе, истории, как к тебе попасть</span>
            </span>
            <ChevronDown className={`w-5 h-5 text-brand-muted transition-transform ${manualOpen ? 'rotate-180' : ''}`} />
          </button>
        </section>

        {manualOpen && (<>
        {/* Как пишешь */}
        <section className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6 space-y-5">
          <h2 className="text-lg font-bold text-brand-text">Как ты пишешь</h2>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">О себе пишешь</p>
            <Choice value={gender} onChange={setGender} options={[{ v: 'female', label: 'В женском роде: я заметила' }, { v: 'male', label: 'В мужском роде: я заметил' }]} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">К читателю обращаешься</p>
            <Choice value={address} onChange={setAddress} options={[{ v: 'ty', label: 'На ты' }, { v: 'vy', label: 'На вы' }, { v: 'vy_devochki', label: 'На вы, иногда «девочки»' }]} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Сколько рассказываешь о себе</p>
            <div className="space-y-2">
              {DISCLOSURE.map(d => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => setDisclosure(d.v as 1 | 2 | 3)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition cursor-pointer ${disclosure === d.v ? 'border-brand-accent bg-brand-soft' : 'border-brand-border bg-white hover:border-brand-accent'}`}
                >
                  <span className="text-sm font-semibold text-brand-text">{d.label}</span>
                  <span className="block text-xs text-brand-muted mt-0.5">{d.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Кто тебя читает</p>
            <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="Например: в основном женщины 30-45" className={field} />
          </div>
        </section>

        {/* Материал */}
        <section className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6 space-y-5">
          <h2 className="text-lg font-bold text-brand-text">Что знаешь только ты</h2>
          <p className="text-sm text-brand-muted leading-relaxed -mt-3">Твои истории и мнения за тебя не придумываются: если посту они нужны, появится вопрос или место «добавь».</p>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">С чем ты споришь, что бесит в профессии</p>
            <textarea value={position} onChange={e => setPosition(e.target.value)} rows={3} placeholder="Например: когда тревогу лечат аффирмациями" className={`${field} resize-y`} />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-brand-text">Истории, о которых можно писать</p>
            <p className="text-xs text-brand-muted -mt-2">Коротко, пара предложений. Из практики только обобщенно, без деталей, по которым узнают человека.</p>
            {stories.map((st, i) => (
              <div key={i} className="rounded-2xl border border-brand-border bg-white p-3 space-y-2">
                <textarea
                  value={st.text}
                  onChange={e => setStories(stories.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  rows={3}
                  className="w-full text-sm text-brand-text focus:outline-none resize-y"
                  placeholder="Что было"
                />
                <div className="flex items-center justify-between gap-2">
                  <Choice value={st.level} onChange={v => setStories(stories.map((x, j) => (j === i ? { ...x, level: v } : x)))} options={LEVELS} />
                  <button type="button" aria-label="Убрать историю" onClick={() => setStories(stories.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-soft cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setStories([...stories, { text: '', level: 'practice' }])} className={QUIET_BTN}>
              <Plus className="w-4 h-4" /> Добавить историю
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Как к тебе попасть</p>
            <textarea value={booking} onChange={e => setBooking(e.target.value)} rows={2} placeholder={zh6Ui ? 'Например: через директ, первая встреча онлайн' : 'Например: написать в директ слово «встреча»'} className={`${field} resize-y`} />
          </div>

          {zh6Ui && <div className="space-y-2">
            <label htmlFor="kod-slovo" className="block text-sm font-semibold text-brand-text">Кодовое слово, если есть</label>
            <p id="kod-slovo-hint" className="text-xs text-brand-muted -mt-1">Посты позовут читателей написать это слово тебе в директ или в комментарии, так им проще записаться. Нет слова, позовут просто написать в директ.</p>
            <input id="kod-slovo" value={kod} onChange={e => setKod(e.target.value)} onBlur={() => setKodTouched(true)} maxLength={40} placeholder="Например, встреча"
              aria-describedby="kod-slovo-hint" aria-invalid={(kodTouched && kodBad) || undefined} className={field} />
            {kodTouched && kodBad && <p className="text-xs text-brand-text" role="status">В кодовом слове должно быть от 2 до 40 знаков</p>}
          </div>}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Как проходит первая встреча</p>
            <textarea value={firstSession} onChange={e => setFirstSession(e.target.value)} rows={2} placeholder="Например: 50 минут онлайн, говорим о запросе, можно просто прийти посмотреть" className={`${field} resize-y`} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Персонаж, который часто бывает в твоих постах, если есть</p>
            <input value={character} onChange={e => setCharacter(e.target.value)} placeholder="Например: внутренняя Лида, вечно недовольная и смешная" className={field} />
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-brand-bg pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-brand-accent text-white font-semibold text-sm hover:bg-brand-accent-hover transition cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedAt ? <Check className="w-4 h-4" /> : null}
            {savedAt ? 'Сохранено' : 'Сохранить'}
          </button>
        </div>
        </>)}

        <p className="text-xs text-brand-muted text-center pb-4">Только твой голос, без клиентов. Аудио удаляется сразу после расшифровки.</p>
      </div>
    </div>
  )
}

// Ползунки тона на экране голоса: 7 позиций (три ступени в каждую сторону и середина), как их видит модель
// (lib/generation/tone.ts). Под ползунком то, что уйдет в промпт; если «Мат» или «Эмоции» перебивают ось, пишем об этом.
function ToneSteps({ tone, profanity, intensity, onChange }: {
  tone: Record<ToneAxis, number>
  profanity: string | null
  intensity: string | null
  onChange: (axis: ToneAxis, v: number) => void
}) {
  const axes: { key: ToneAxis; left: string; right: string }[] = [
    { key: 'tone_formal', left: 'Разговорно', right: 'Сдержанно' },
    { key: 'tone_serious', left: 'С юмором', right: 'Серьезно' },
    { key: 'tone_cautious', left: 'Прямо', right: 'Бережно' },
  ]
  const profile = { ...tone, profanity, intensity }
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-brand-text">Тон</p>
      {axes.map(ax => {
        const pos = tonePosition(tone[ax.key])
        const st = toneAxisState(ax.key, profile)
        return (
          <div key={ax.key}>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className={pos < 3 ? 'text-brand-accent font-semibold' : 'text-brand-muted'}>{ax.left}</span>
              <span className={pos > 3 ? 'text-brand-accent font-semibold' : 'text-brand-muted'}>{ax.right}</span>
            </div>
            <input type="range" min={0} max={6} step={1} value={pos}
              onChange={e => onChange(ax.key, TONE_POSITIONS[Number(e.target.value)])}
              aria-label={`${ax.left} или ${ax.right}`} aria-valuetext={st.word || 'посередине'}
              className="w-full h-11 cursor-pointer" style={{ accentColor: 'var(--color-brand-accent)' }} />
            {/* 7 засечек: видно, что это ступени, середина крупнее */}
            <div className="-mt-3 mb-1 flex justify-between px-[7px]" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6].map(i => <span key={i} className={`rounded-full ${i === 3 ? 'w-2 h-2' : 'w-1 h-1'} ${i === pos ? 'bg-brand-accent' : 'bg-brand-border'}`} />)}
            </div>
            <p className="text-xs text-brand-muted">
              {st.overriddenBy === 'intensity' && st.word ? `В постах: ${st.word}. Сильнее не будет, выбрано «Спокойно и ровно»`
                : st.overriddenBy === 'intensity' ? `Выбрано «На эмоциях», поэтому будет ${ax.key === 'tone_cautious' ? 'прямее' : 'разговорнее'}. Ползунок пока не действует`
                : st.overriddenBy === 'profanity' ? 'Мат разрешен, поэтому будет разговорнее. Ползунок пока не действует'
                : st.word ? `В постах: ${st.word}` : 'Посередине, тон берется по твоим постам'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
