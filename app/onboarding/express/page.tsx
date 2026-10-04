'use client'

// Экспресс-онбординг карточками (задача onbording; верстка по спецификации designer-psycont): вход с Верой,
// 5 вопросов по одному на экран, финал с первой темой по нише. Порядок от легкого к тяжелому: первые шаги
// пролетают за секунды. Ответы живут в sessionStorage (перезагрузка и «Назад» ничего не стирают), в базу один
// upsert в конце с теми же полями, что раньше. Ползунки тона отсюда убраны (они на экране голоса): тон не пишем,
// в базе остается значение по умолчанию, генерация середину ползунка не выводит.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, Check, Plus, Mic, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useVoiceRecorder } from '@/lib/use-voice-recorder'
import VoiceSheet from '@/components/make/VoiceSheet'
import { firstTopic } from '@/lib/first-topic'
import { track } from '@/lib/track'

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
const STORE = 'psycont_onb_express'
const TOTAL = 5
const VOICE_LIMIT = 60
// Просмотр для проверки верстки: только в dev-сборке, ?preview=1 пропускает проверку профиля и ничего не пишет в базу.
// В проде переменная NODE_ENV = production, режим не включается.
const isPreview = () => process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1'

type Answers = { name: string; approaches: string[]; nicheChip: string | null; nicheText: string; tone: string; pain: string }
const EMPTY: Answers = { name: '', approaches: [], nicheChip: null, nicheText: '', tone: '', pain: '' }
// 0 вход, 1-5 вопросы, 6 финал
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6

// Вера и ее реплика: стикер слева, пузырь с хвостиком к лицу
function Vera({ src, h, w, tilt = '', children, delay }: { src: string; h: number; w: number; tilt?: string; children: React.ReactNode; delay: boolean }) {
  return (
    <div className="flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden="true" width={w} height={h} style={{ height: h, width: w, filter: 'drop-shadow(0 2px 6px rgba(59,42,34,.12))' }} className={`shrink-0 ${tilt}`} />
      <motion.div initial={delay ? { opacity: 0, y: 4 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay ? 0.15 : 0, duration: 0.2 }}
        className="relative mt-3 flex-1 min-w-0 bg-brand-soft border border-brand-border-soft rounded-[20px] px-4 py-3 text-brand-text [overflow-wrap:anywhere]">
        <span aria-hidden="true" className="absolute -left-[7px] top-5 w-3 h-3 rotate-45 bg-brand-soft border-l border-b border-brand-border-soft" />
        {children}
      </motion.div>
    </div>
  )
}

export default function ExpressOnboarding() {
  const router = useRouter()
  // still=1 только в dev-просмотре (снимки экранов в фоновой вкладке): ведет себя как «уменьшить движение»
  const reduce = useReducedMotion() || (isPreview() && new URLSearchParams(window.location.search).get('still') === '1')
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState<Step>(0)
  const [dir, setDir] = useState(1)
  const [moving, setMoving] = useState(false)
  const [a, setA] = useState<Answers>(EMPTY)
  const [ownNiche, setOwnNiche] = useState(false)
  const [limitHint, setLimitHint] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [topic, setTopic] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)
  const stepStart = useRef(Date.now())
  const titleRef = useRef<HTMLHeadingElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const actionRef = useRef<HTMLDivElement>(null)
  const uidRef = useRef<string | null>(null)
  // флаг нового мозга: с ним финал ведет на новый «Сделать» (пост и карусель), без него как раньше
  const [newGen, setNewGen] = useState<boolean | null>(null)

  // сессия, «профиль уже есть» (анти-цикл, как было) и восстановление ответов после перезагрузки
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return
      if (!user) { router.replace('/'); return }
      uidRef.current = user.id
      fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => { if (active) setNewGen(j?.newPipeline === true) }).catch(() => { if (active) setNewGen(false) })
      const { data, error: readErr } = await supabase
        .from('onboarding_profiles').select('user_id').eq('user_id', user.id).single()
      if (!active) return
      if (data && !isPreview()) { router.replace('/dashboard'); return }
      // PGRST116 = строки нет, нормальный путь. Иной сбой чтения = не действуем вслепую (upsert перезатрет профиль)
      if (readErr && readErr.code !== 'PGRST116' && !isPreview()) { router.replace('/dashboard'); return }
      // ответы привязаны к пользователю: на общем устройстве второй не получит чужое имя и речь
      let restored: { uid?: string; a?: Answers; step?: number } | null = null
      try { restored = JSON.parse(sessionStorage.getItem(STORE) || 'null') } catch {}
      if (restored && restored.uid !== user.id) { restored = null; try { sessionStorage.removeItem(STORE) } catch {} }
      if (restored?.a) {
        setA({ ...EMPTY, ...restored.a })
        if (restored.a.nicheText) setOwnNiche(true)
      } else {
        // имя из метаданных входа (Яндекс и почта обычно отдают)
        const metaName = String(user.user_metadata?.full_name || user.user_metadata?.name || '')
        if (metaName) setA(x => ({ ...x, name: metaName }))
      }
      const s = Number(restored?.step)
      setStep((s >= 0 && s <= TOTAL ? s : 0) as Step)
      setReady(true)
    })
    return () => { active = false }
  }, [router])

  // каждый шаг пишется в sessionStorage
  useEffect(() => {
    if (!ready || step === 6) return
    try { sessionStorage.setItem(STORE, JSON.stringify({ uid: uidRef.current, a, step })) } catch {}
  }, [a, step, ready])

  // замеры и фокус на заголовок после перехода (кроме вопроса 1: там фокус в поле)
  useEffect(() => {
    if (!ready) return
    stepStart.current = Date.now()
    if (step === 0) track('onb_intro')
    else if (step <= TOTAL) track('onb_step_view', { step })
    setLimitHint(false)
    if (step >= 2) setTimeout(() => titleRef.current?.focus({ preventScroll: true }), reduce ? 0 : 220)
  }, [step, ready, reduce])

  // iOS: клавиатура кладется поверх, кнопку «Дальше» держим над ней
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const onResize = () => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) actionRef.current?.scrollIntoView({ block: 'nearest' })
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  const go = useCallback((to: Step) => {
    setDir(to > step ? 1 : -1)
    setError('')
    setStep(to)
    // пока карточка едет, кнопки не реагируют: двойной тап не проскакивает шаг
    setMoving(true)
    setTimeout(() => setMoving(false), reduce ? 0 : 220)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }, [step, reduce])

  const done = (n: number) => track('onb_step_done', { step: n, ms: Date.now() - stepStart.current })
  const back = () => { if (step >= 1 && step <= TOTAL && !moving) go((step - 1) as Step) }

  const niche = (a.nicheText.trim() || a.nicheChip || '')
  // на 4-м шаге «Дальше» ждет конца расшифровки, иначе текст придет после сохранения и потеряется
  const valid: Record<number, boolean> = { 1: !!a.name.trim(), 2: a.approaches.length > 0, 3: !!niche, 4: !!a.tone.trim(), 5: true }

  // запись голоса до минуты; текст встает в конец поля
  const appendTone = useCallback((t: string) => setA(x => ({ ...x, tone: x.tone.trim() ? `${x.tone.trim()} ${t}` : t })), [])
  const rec = useVoiceRecorder(appendTone, { maxSeconds: VOICE_LIMIT, nearSeconds: VOICE_LIMIT - 10 })
  const transcribing = rec.state === 'transcribing'
  const transcribeFailed = rec.state === 'error' && rec.errorKind === 'network'
  if (transcribing) valid[4] = false
  useEffect(() => { if (rec.state === 'error' && rec.errorKind === 'denied') track('onb_mic_denied') }, [rec.state, rec.errorKind])

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    // id взят при загрузке: повторный getUser при сбое сети выкинул бы на вход вместо «проверь связь»
    const uid = uidRef.current
    if (!uid) { router.replace('/'); return }
    // те же поля, что раньше; тон ползунками больше не пишем
    const profileData = {
      user_id: uid,
      full_name: a.name.trim(),
      approaches: a.approaches,
      niches: a.nicheChip && !a.nicheText.trim() ? [a.nicheChip] : [],
      one_niche: niche,
      tone_verbal: a.tone.trim(),
      client_pain_phrases: a.pain.trim(),
    }
    // upsert, чтобы полная распаковка потом ДОПОЛНЯЛА строку, а не падала на дубле user_id
    let saveErr: unknown = null
    try {
      if (!isPreview()) saveErr = (await supabase.from('onboarding_profiles').upsert(profileData, { onConflict: 'user_id' })).error
    } catch (e) { saveErr = e }
    if (saveErr) {
      setError('Не получилось сохранить. Проверь связь и нажми еще раз')
      setSaving(false)
      return
    }
    try { sessionStorage.removeItem(STORE) } catch {}
    // тема дня по нише без модели: та же логика, что карточка «Не знаю, о чем писать» (lib/first-topic.ts)
    setTopic(firstTopic(niche, a.pain))
    track('onb_done')
    setSaving(false)
    go(6)
  }

  const next = () => {
    if (moving || saving || !valid[step]) return
    if (step >= 1 && step <= TOTAL) done(step)
    if (step === TOTAL) save()
    else go((step + 1) as Step)
  }

  const startFirst = () => {
    track('onb_first_click')
    // новый мозг: тема в поле, Пост и Карусель выбраны, генерация только по нажатию.
    // Без флага старый экран как раньше: auto=1 сам пишет первый пост, теперь на этой теме (старый экран пишет только пост)
    const q = newGen === false
      ? new URLSearchParams({ first: '1', auto: '1', topic })
      : new URLSearchParams({ first: '1', topic, formats: 'post,carousel' })
    router.push(`/dashboard/make?${q.toString()}`)
  }

  if (!ready) {
    return (
      <div className="min-h-dvh bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-accent animate-spin" aria-label="Загружаю" />
      </div>
    )
  }

  // ---------- общие куски ----------
  const green = 'w-full h-[52px] rounded-2xl text-[16px] font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover cursor-pointer transition'
  const outline = 'w-full h-[52px] rounded-2xl text-[16px] font-semibold border-[1.5px] border-brand-accent text-brand-accent bg-brand-card cursor-pointer transition'
  const chip = (on: boolean, dim = false) => `h-11 px-4 inline-flex items-center gap-1.5 rounded-full text-[15px] cursor-pointer transition ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text'} ${dim ? 'opacity-50' : ''}`
  const inputCls = 'h-14 w-full rounded-[20px] bg-brand-card border-[1.5px] border-brand-border px-4 text-[16px] text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-[3px] focus:ring-brand-soft'

  const missing: Record<number, string> = {
    1: 'Напиши имя, и пойдем дальше',
    2: 'Выбери хотя бы один подход',
    3: 'Впиши, с чем работаешь',
    4: transcribing ? 'Подожди, расшифровываю' : 'Наговори или напиши хоть одну фразу',
  }
  const nextBlock = (label = 'Дальше') => (
    <div ref={actionRef} className="mt-5">
      <button type="button" onClick={next} aria-disabled={!valid[step] || saving} aria-describedby="onb-missing"
        className={valid[step] && !saving ? green : 'w-full h-[52px] rounded-2xl text-[16px] font-semibold bg-brand-border text-brand-muted cursor-not-allowed'}>
        {saving ? <span className="inline-flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Сохраняю</span> : label}
      </button>
      <p id="onb-missing" className="mt-2 min-h-[18px] text-center text-[13px] text-brand-muted" role="status">
        {limitHint ? 'Можно до трех. Сними один, чтобы выбрать другой' : !valid[step] ? missing[step] || '' : ''}
      </p>
    </div>
  )
  const title = (t: string, hint?: string) => (
    <>
      <h1 ref={titleRef} tabIndex={-1} className="text-[22px] leading-7 font-semibold text-brand-text outline-none">{t}</h1>
      {hint && <p className="mt-1.5 text-[15px] leading-5 text-brand-muted">{hint}</p>}
    </>
  )

  // поле с пилюлей «Наговорить» внутри рамки (как поле на «Сделать»)
  const voiceField = (value: string, onChange: (v: string) => void, placeholder: string, label: string, primaryMic: boolean) => (
    <div className="rounded-[20px] bg-brand-card border-[1.5px] border-brand-border focus-within:border-brand-accent focus-within:ring-[3px] focus-within:ring-brand-soft transition">
      <textarea ref={fieldRef} value={value} onChange={e => onChange(e.target.value)} readOnly={transcribing} rows={2} aria-label={label}
        placeholder={transcribing ? 'Расшифровываю...' : placeholder}
        className={`block w-full min-h-[72px] max-h-[144px] resize-none bg-transparent px-4 pt-3.5 text-[16px] leading-6 text-brand-text placeholder:text-brand-muted focus:outline-none ${transcribing ? 'animate-pulse' : ''}`} />
      <div className="h-16 flex items-center justify-end pr-1.5">
        <button type="button" onClick={() => { rec.reset(); setVoiceOpen(true) }} disabled={transcribing}
          className={`h-[52px] px-5 rounded-full inline-flex items-center gap-2 text-[16px] font-semibold cursor-pointer transition disabled:opacity-60 ${primaryMic ? 'bg-brand-accent text-white hover:bg-brand-accent-hover' : 'bg-brand-card border-[1.5px] border-brand-accent text-brand-accent'}`}>
          {transcribing ? <><Loader2 className="w-[22px] h-[22px] animate-spin" />Слушаю</> : <><Mic className="w-[22px] h-[22px]" />Наговорить</>}
        </button>
      </div>
    </div>
  )

  // ---------- карточки ----------
  let body: React.ReactNode = null
  if (step === 0) {
    body = (
      <div className="pt-10">
        <Vera src="/vera/privet.webp" h={120} w={93} tilt="-rotate-2" delay={!reduce}>
          <p className="text-[16px] leading-[22px]">Я Вера. Пять коротких вопросов, около минуты. Потом сделаем первый пост твоим голосом</p>
        </Vera>
        <button type="button" onClick={() => { if (!moving) go(1) }} className={`mt-8 ${green}`}>Начнем</button>
      </div>
    )
  } else if (step === 1) {
    body = (
      <div className="pt-6">
        {title('Как тебя зовут?', 'Чтобы посты звучали от живого человека')}
        <input autoFocus value={a.name} onChange={e => setA({ ...a, name: e.target.value })} aria-label="Как тебя зовут"
          onKeyDown={e => { if (e.key === 'Enter') next() }} placeholder="Например, Анна" autoComplete="given-name" enterKeyHint="next"
          className={`mt-5 ${inputCls}`} />
        {nextBlock()}
      </div>
    )
  } else if (step === 2) {
    body = (
      <div className="pt-6">
        {title('В каком подходе работаешь?', 'Чтобы не писать то, что противоречит твоему методу')}
        <div className="mt-5 flex flex-wrap gap-2">
          {APPROACHES.map(x => {
            const on = a.approaches.includes(x)
            const full = !on && a.approaches.length >= 3
            return (
              <button key={x} type="button" aria-pressed={on}
                onClick={() => {
                  if (full) { setLimitHint(true); return }
                  setLimitHint(false)
                  setA({ ...a, approaches: on ? a.approaches.filter(y => y !== x) : [...a.approaches, x] })
                }}
                className={chip(on, full)}>
                {on ? <Check className="w-4 h-4 text-brand-accent" /> : <Plus className="w-4 h-4 text-brand-muted" />}{x}
              </button>
            )
          })}
        </div>
        {nextBlock()}
      </div>
    )
  } else if (step === 3) {
    body = (
      <div className="pt-6">
        {title('С чем работаешь чаще всего?', 'Отсюда возьму первые темы')}
        <div className="mt-5 flex flex-wrap gap-2">
          {NICHES.map(x => {
            const on = a.nicheChip === x && !ownNiche
            return (
              <button key={x} type="button" aria-pressed={on}
                onClick={() => {
                  if (moving) return
                  setOwnNiche(false)
                  setA({ ...a, nicheChip: x, nicheText: '' })
                  // тап сразу ведет дальше, через 250 мс, чтобы было видно выбор; повторные тапы это время не считаются
                  setMoving(true)
                  setTimeout(() => { done(3); go(4) }, 250)
                }}
                className={chip(on)}>
                {on ? <Check className="w-4 h-4 text-brand-accent" /> : <Plus className="w-4 h-4 text-brand-muted" />}{x}
              </button>
            )
          })}
          <button type="button" aria-pressed={ownNiche} onClick={() => { setOwnNiche(true); setA({ ...a, nicheChip: null }) }} className={chip(ownNiche)}>
            {ownNiche ? <Check className="w-4 h-4 text-brand-accent" /> : <Plus className="w-4 h-4 text-brand-muted" />}Свое
          </button>
        </div>
        {ownNiche && (
          <input autoFocus value={a.nicheText} onChange={e => setA({ ...a, nicheText: e.target.value })} aria-label="С чем работаешь"
            onKeyDown={e => { if (e.key === 'Enter') next() }} placeholder="Например, расставания" enterKeyHint="next"
            className={`mt-3 ${inputCls}`} />
        )}
        {/* кнопка нужна только для своего варианта или когда вернулась назад с уже выбранной нишей */}
        {(ownNiche || a.nicheChip) && nextBlock()}
      </div>
    )
  } else if (step === 4) {
    body = (
      <div className="pt-6">
        {title('Как ты говоришь с клиентами?')}
        <div className="mt-4">
          <Vera src="/vera/slushaet.webp" h={90} w={66} delay={false}>
            <p className="text-[15px] leading-[21px]">Наговори, как сказала бы клиентке. Я запомню, как ты звучишь</p>
          </Vera>
        </div>
        <div className="mt-4">{voiceField(a.tone, v => setA({ ...a, tone: v }), 'Или напиши текстом', 'Как ты говоришь с клиентами', !a.tone.trim())}</div>
        {transcribeFailed ? (
          <div className="mt-2 flex items-center justify-between gap-2 text-[14px] text-brand-text">
            <span className="min-w-0">Не получилось расшифровать. Запись цела</span>
            <button type="button" onClick={rec.retry} className="h-11 px-4 rounded-full border border-brand-border font-semibold cursor-pointer shrink-0">Еще раз</button>
          </div>
        ) : (
          <p className="mt-2 text-[13px] leading-[18px] text-brand-muted">Например: давай по-честному, без умных слов</p>
        )}
        {nextBlock()}
      </div>
    )
  } else if (step === 5) {
    const hasPain = !!a.pain.trim()
    body = (
      <div className="pt-6">
        {title('Какими словами клиент описывает боль?', 'Так посты заговорят словами твоих клиентов')}
        {/* без микрофона: здесь слова клиента, а записи с микрофона идут в память ее голоса */}
        <textarea value={a.pain} onChange={e => setA({ ...a, pain: e.target.value })} rows={3} aria-label="Какими словами клиент описывает боль"
          placeholder="Например: устала быть сильной"
          className="mt-5 block w-full min-h-[96px] resize-none rounded-[20px] bg-brand-card border-[1.5px] border-brand-border px-4 py-3.5 text-[16px] leading-6 text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-[3px] focus:ring-brand-soft" />
        {error && <p className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-[15px] text-brand-text" role="alert">{error}</p>}
        <div ref={actionRef} className="mt-5">
          {/* один слот: пусто = «Пропустить», есть текст = «Дальше» */}
          <button type="button" disabled={saving || moving}
            onClick={() => { if (hasPain) next(); else { track('onb_skip', { step: 5 }); save() } }}
            className={hasPain ? green : outline}>
            {saving ? <span className="inline-flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Сохраняю</span> : hasPain ? 'Дальше' : 'Пропустить'}
          </button>
          <p className="mt-2 text-center text-[13px] text-brand-muted">Можно дописать потом в настройках</p>
        </div>
      </div>
    )
  } else {
    const name = a.name.trim()
    body = (
      <div className="pt-8">
        <Vera src="/vera/raduetsya.webp" h={140} w={117} tilt="rotate-2" delay={!reduce}>
          <h1 ref={titleRef} tabIndex={-1} className="text-[20px] leading-[26px] font-semibold outline-none">{name ? `Готово, ${name}, я тебя услышала` : 'Готово, я тебя услышала'}</h1>
        </Vera>
        <div className="mt-6 rounded-[20px] bg-brand-card border border-brand-border p-4">
          <p className="text-[13px] leading-[18px] text-brand-muted">Первая тема под тебя:</p>
          <p className="mt-1 text-[18px] leading-6 font-semibold text-brand-text line-clamp-3 break-words">{topic}</p>
        </div>
        <button type="button" onClick={startFirst} disabled={newGen === null} className={`mt-5 ${green} disabled:opacity-60`}>{newGen === false ? 'Сделать пост' : 'Сделать пост и карусель'}</button>
        <button type="button" onClick={() => router.push('/dashboard/make?first=1')}
          className="mt-1 h-11 w-full text-center text-[15px] text-brand-muted underline underline-offset-4 cursor-pointer">Или начни со своей мысли</button>
      </div>
    )
  }

  const q = step >= 1 && step <= TOTAL ? step : 0
  return (
    <div className="min-h-[100dvh] bg-brand-bg overflow-x-hidden">
      <div className="max-w-[440px] mx-auto px-4 pb-8 pt-[max(8px,env(safe-area-inset-top))] sm:pt-16">
        {/* шапка стоит на месте, двигается только тело */}
        <div className="h-11 flex items-center gap-1">
          {step >= 1 && step <= TOTAL ? (
            <button type="button" onClick={back} aria-label="Назад" className="w-11 h-11 -ml-2.5 flex items-center justify-center rounded-full text-brand-text hover:bg-brand-soft cursor-pointer shrink-0">
              <ChevronLeft className="w-6 h-6" />
            </button>
          ) : <span className="w-11 h-11 -ml-2.5 shrink-0" />}
          {/* 6 сегментов: «Аккаунт» закрашен сразу (регистрация пройдена), дальше 5 вопросов */}
          <div className="flex-1 flex gap-1" aria-hidden="true">
            {Array.from({ length: TOTAL + 1 }, (_, i) => {
              const filled = i === 0 || i < q || step === 6
              const current = !filled && i === q
              return <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${filled ? 'bg-brand-accent' : current ? 'bg-brand-lilac ring-1 ring-inset ring-brand-accent' : 'bg-brand-border'}`} />
            })}
          </div>
        </div>
        {q > 0 && <p className="pl-12 mt-0.5 text-[13px] leading-[18px] text-brand-muted tabular-nums">Вопрос {q} из {TOTAL}</p>}

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={step}
            initial={reduce ? false : { opacity: 0, x: 24 * dir }}
            animate={{ opacity: 1, x: 0, transition: { duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] } }}
            exit={reduce ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0, x: -24 * dir, transition: { duration: 0.14, ease: 'easeIn' } }}>
            {body}
          </motion.div>
        </AnimatePresence>
      </div>

      <VoiceSheet open={voiceOpen} rec={rec} maxSeconds={VOICE_LIMIT} prompt="Говори, как с клиенткой. Паузы не страшны." onClose={() => setVoiceOpen(false)}
        onWriteText={() => { setVoiceOpen(false); rec.reset(); setTimeout(() => fieldRef.current?.focus(), 50) }} />
    </div>
  )
}
