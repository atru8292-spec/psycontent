'use client'

// «Покажи, как ты говоришь» (08-GOLOS-I-OBUCHENIE.md). Три способа дать живую речь, хватит любого:
// сказать по-своему гладкую фразу, объяснить голосом, дать блог. Сверху «Вот как я тебя слышу»,
// чтобы было видно, что сервис понял, и можно было поправить. Ручные настройки свернуты вниз.
// Поля из миграции 20260930120000_generation_brain.sql.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Trash2, Check, ChevronDown, Mic } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import VoiceTextarea from '@/components/VoiceTextarea'

type Story = { text: string; level: 'personal' | 'work' | 'practice' }

const MAX_TEXTS = 3

// Гладкие фразы «как у всех»: психолог говорит их по-своему, и мы слышим ее словарь.
const SMOOTH = [
  'Важно принимать свои эмоции.',
  'Границы нужны, чтобы сохранять себя в отношениях.',
  'Тревога это сигнал, который стоит услышать.',
]
const EXPLAIN_Q = 'Как ты объясняешь клиенту, почему нельзя просто взять и перестать тревожиться? Расскажи так, как говоришь в кабинете.'

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

const field = 'w-full px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent'

export default function VoicePage() {
  const router = useRouter()
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
  const [toneSaved, setToneSaved] = useState<string | null>(null)
  const [disclosure, setDisclosure] = useState<1 | 2 | 3 | null>(null)
  const [audience, setAudience] = useState('')
  const [booking, setBooking] = useState('')
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
        setDisclosure(p.disclosure ?? null)
        setAudience(p.audience || '')
        setBooking(p.booking_info || '')
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
      ? 'Послушала. Живых текстов пока мало, поэтому описание примерное. Любой способ выше его уточнит.'
      : 'Послушала. Проверь сверху, так ли я тебя слышу.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const importTg = async () => {
    if (!tg.trim()) return
    setImporting(true); setMessage(null)
    try {
      const r = await fetch('/api/voice-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: tg.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Не получилось открыть канал')
      await afterRebuild(d)
    } catch (e: any) {
      setMessage(e.message)
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
      if (!r.ok) throw new Error(d.error || 'Не получилось')
      setTexts([''])
      setPasteOpen(false)
      await afterRebuild(d)
    } catch (e: any) {
      setMessage(e.message)
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
  const saveTone = async (patch: { profanity?: string; intensity?: string }) => {
    if (!userId) return
    setToneSaved(null)
    const { error } = await supabase.from('onboarding_profiles').update(patch).eq('user_id', userId)
    setToneSaved(error ? 'Не сохранилось, попробуй еще раз' : 'Запомнила, следующие посты будут так')
  }

  const saveSettings = async () => {
    if (!userId) return
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
    setSaving(false)
    if (error) setMessage('Не получилось сохранить. Попробуй еще раз чуть позже.')
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
  const primary = (on: boolean) => `inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold transition cursor-pointer ${on ? 'bg-brand-accent text-white hover:bg-brand-accent-hover' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <button onClick={() => router.push('/dashboard/settings')} className="inline-flex items-center gap-2 text-sm text-brand-muted hover:text-brand-text transition cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Настройки
        </button>

        <div>
          <h1 className="text-2xl font-bold text-brand-text">Покажи, как ты говоришь</h1>
          <p className="text-sm text-brand-muted mt-1 leading-relaxed">Хватит любого одного способа. Остальное я доберу сама из постов, которые ты правишь перед публикацией.</p>
        </div>

        {/* Как я тебя слышу */}
        <section className="rounded-3xl bg-brand-soft p-5 sm:p-6 space-y-3">
          <h2 className="text-lg font-bold text-brand-text">Вот как я тебя слышу</h2>
          {heard?.summary ? (
            <>
              <p className="text-sm text-brand-text leading-relaxed whitespace-pre-wrap">{heard.summary}</p>
              {heard.signatures.length > 0 && (
                <p className="text-sm text-brand-text-secondary">Твои словечки: {heard.signatures.map(s => `«${s}»`).join(', ')}</p>
              )}
              {heard.updatedAt && <p className="text-xs text-brand-muted">Обновила {new Date(heard.updatedAt).toLocaleDateString('ru-RU')}</p>}
              {heardVerdict === 'ok' && <p className="text-sm text-brand-text">Отлично, так и пишу.</p>}
              {heardVerdict === 'sent' && <p className="text-sm text-brand-text">Поняла, поправлю. Следующие посты будут с этим.</p>}
              {heardVerdict === null && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => sendHeardFeedback(true)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-brand-text border border-brand-border hover:border-brand-accent cursor-pointer">Похоже</button>
                  <button type="button" onClick={() => setHeardVerdict('fix')} className="text-sm text-brand-text-secondary hover:text-brand-accent cursor-pointer">Не совсем</button>
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
            <p className="text-sm text-brand-text-secondary leading-relaxed">Пока слышу мало. Выбери способ ниже, и тут появится, как я поняла твою манеру. Сможешь поправить, если мимо.</p>
          )}
        </section>

        {/* Как ты звучишь: мат и эмоции на виду, это то, что психологи чаще всего хотят поменять */}
        <section className={card}>
          <h2 className="text-lg font-bold text-brand-text">Как ты звучишь</h2>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Мат</p>
            <p className="text-xs text-brand-muted leading-relaxed">Мы за то, чтобы ты говорила как думаешь. Если в жизни ты можешь сказать «да пошло оно все», посты тоже могут. Никто тут не осудит.</p>
            <Choice value={profanity} onChange={v => { setProfanity(v); saveTone({ profanity: v }) }} options={[
              { v: 'no', label: 'Без мата' },
              { v: 'light', label: 'Иногда, со звездочкой' },
              { v: 'free', label: 'Как в жизни' },
            ]} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Эмоции</p>
            <Choice value={intensity} onChange={v => { setIntensity(v); saveTone({ intensity: v }) }} options={[
              { v: 'calm', label: 'Спокойно и ровно' },
              { v: 'live', label: 'Живо, как в разговоре' },
              { v: 'hot', label: 'На эмоциях, с огоньком' },
            ]} />
            <p className="text-xs text-brand-muted">{intensity === 'hot' ? 'Можно резко, с иронией, иногда капсом одно слово.' : intensity === 'calm' ? 'Без восклицаний и резких слов, мягко и по делу.' : intensity === 'live' ? 'Разговорные словечки, немного восклицаний, как говоришь с подругой.' : 'Не выбрала, значит беру по твоим постам.'}</p>
          </div>
          {toneSaved && <p className="text-xs text-brand-text">{toneSaved}</p>}
        </section>

        {message && <p className="text-sm text-brand-text bg-white border border-brand-border rounded-xl px-4 py-3">{message}</p>}

        {/* Скажи по-своему */}
        <section className={card}>
          <h2 className="text-lg font-bold text-brand-text">Скажи по-своему</h2>
          <p className="text-sm text-brand-muted leading-relaxed">Так пишут все. Как бы ты сказала это клиенту? Голосом или текстом, как выйдет.</p>
          <p className="text-base font-semibold text-brand-text">«{SMOOTH[phraseIdx]}»</p>
          <VoiceTextarea value={phraseAnswer} onChange={setPhraseAnswer} minHeight={90} placeholder="Твоими словами" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!phraseAnswer.trim()} onClick={sendPhrase} className={primary(!!phraseAnswer.trim())}>Готово</button>
            <button type="button" onClick={() => { setPhraseAnswer(''); setPhraseIdx(i => (i + 1) % SMOOTH.length) }} className="text-sm text-brand-muted hover:text-brand-text cursor-pointer">Другую фразу</button>
            {phrasesDone > 0 && <span className="text-xs text-brand-muted">Запомнила {phrasesDone} из {SMOOTH.length}</span>}
          </div>

          <div className="pt-3 border-t border-brand-border-soft space-y-2">
            <p className="text-sm font-semibold text-brand-text">Что ты чаще всего повторяешь клиентам?</p>
            {repeatSaved ? (
              <p className="text-sm text-brand-text-secondary">Запомнила. Буду иногда вставлять, не в каждый пост.</p>
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
            <p className="text-sm text-brand-text-secondary">Спасибо, это самое ценное. По такой речи я слышу тебя лучше всего.</p>
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
          <h2 className="text-lg font-bold text-brand-text">У меня есть блог</h2>
          <p className="text-sm text-brand-muted leading-relaxed">Дай ссылку на открытый телеграм-канал, я прочитаю последние посты. Темы брать не буду, только манеру.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={tg} onChange={e => setTg(e.target.value)} placeholder="t.me/твой_канал" className={field} />
            <button type="button" disabled={!tg.trim() || importing} onClick={importTg} className={`${primary(!!tg.trim() && !importing)} shrink-0`}>
              {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Читаю</> : 'Прочитать'}
            </button>
          </div>
          <button type="button" onClick={() => setPasteOpen(!pasteOpen)} className="text-sm text-brand-accent hover:underline cursor-pointer">
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
                <button type="button" onClick={() => setTexts([...texts, ''])} className="inline-flex items-center gap-1.5 text-sm text-brand-accent hover:underline cursor-pointer">
                  <Plus className="w-4 h-4" /> Еще пост
                </button>
              )}
              <div>
                <button type="button" onClick={buildFromPasted} disabled={building || filled === 0} className={primary(!building && filled > 0)}>
                  {building ? <><Loader2 className="w-4 h-4 animate-spin" /> Читаю</> : 'Послушать мои посты'}
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
            <Choice value={gender} onChange={setGender} options={[{ v: 'female', label: '«я устала»' }, { v: 'male', label: '«я устал»' }]} />
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
          <p className="text-sm text-brand-muted leading-relaxed -mt-3">Без этого я не выдумываю: если посту нужна твоя история или мнение, спрошу или оставлю место «добавь».</p>

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
            <button type="button" onClick={() => setStories([...stories, { text: '', level: 'practice' }])} className="inline-flex items-center gap-1.5 text-sm text-brand-accent hover:underline cursor-pointer">
              <Plus className="w-4 h-4" /> Добавить историю
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Как к тебе попасть</p>
            <textarea value={booking} onChange={e => setBooking(e.target.value)} rows={2} placeholder="Например: написать в директ слово «встреча»" className={`${field} resize-y`} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Как проходит первая встреча</p>
            <textarea value={firstSession} onChange={e => setFirstSession(e.target.value)} rows={2} placeholder="Например: 50 минут онлайн, говорим о запросе, можно просто прийти посмотреть" className={`${field} resize-y`} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-text">Твой сквозной персонаж, если есть</p>
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

        <p className="text-xs text-brand-muted text-center pb-4">Только твой голос, без клиентов. Аудио удаляем сразу после расшифровки.</p>
      </div>
    </div>
  )
}
