'use client'

// Экспресс-онбординг карточками (задача onbording; верстка по спецификации designer-psycont): вход с Верой,
// 6 вопросов по одному на экран, финал с первой темой. Анкета 2 (19.11, версия 2): имя, подход, «с чем работаешь»
// (8 групп, тап отмечает группу со всеми темами, стрелка раскрывает темы), «кто приходит» (возраст, пол, формат,
// можно пропустить), фразы клиентов (можно пропустить), ответ клиентке. Данные lib/anketa. Темы ложатся в niches
// по кругу между группами, первая в one_niche, фразы в client_pain_phrases через перенос строки, группы и «кто
// приходит» в поле klienty. Порядок от легкого к тяжелому: первые шаги
// пролетают за секунды. Ответы живут в sessionStorage (перезагрузка и «Назад» ничего не стирают), в базу один
// upsert в конце с теми же полями, что раньше. Ползунки тона отсюда убраны (они на экране голоса): тон не пишем,
// в базе остается значение по умолчанию, генерация середину ползунка не выводит.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { makeHref } from '@/lib/make-handoff'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, Check, Plus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { firstTopic } from '@/lib/first-topic'
import { EMPTY_KLIENTY, parseKlienty, temyPoKrugu, type Klienty } from '@/lib/anketa'
import { KtoPrihodit, SChemRabotaesh } from '@/components/anketa/AnketaBlocks'
import { track } from '@/lib/track'
import { MANERY } from '@/lib/manera'
import { syncEmailName } from '@/lib/auth-name'

// Метки подхода = ровно ключи getApproachContext в generate-post (иначе стилевой блок
// молча провалится в «Интегративный»). Матчинг там по includes в обе стороны.
const APPROACHES = [
  'КПТ', 'Гештальт', 'ACT', 'Психоанализ', 'Схема-терапия', 'ЭФТ',
  'EMDR', 'Нарративная терапия', 'Телесно-ориентированная', 'Экзистенциальный', 'Арт-терапия', 'Интегративный',
]
// Сначала шесть самых частых, остальные под «Еще» (на 375×667 иначе «Дальше» уходит за край)
const TOP_APPROACHES = ['КПТ', 'Гештальт', 'Психоанализ', 'Схема-терапия', 'ACT', 'Интегративный']
// раскрытый список: частые на своих местах, остальные после них
const ALL_APPROACHES = [...TOP_APPROACHES, ...APPROACHES.filter(x => !TOP_APPROACHES.includes(x))]
const STORE = 'psycont_onb_express'
const TOTAL = 6
// Просмотр для проверки верстки: только в dev-сборке, ?preview=1 пропускает проверку профиля и ничего не пишет в базу.
// В проде переменная NODE_ENV = production, режим не включается.
const isPreview = () => process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1'

type Answers = {
  name: string; gender?: 'female' | 'male' | null; approaches: string[]
  klienty: Klienty; topics: string[]; ownTopic: string; phrases: string[]; ownPhrase: string
  // до 27.11 вопросы 5 «Что говорят клиенты» и 6 «Как ты ответишь на такое?»; поля остаются, чтобы старый черновик
  // из sessionStorage не ломался, в базу больше не пишутся
  tone: string; situation: number; situationFor?: string
  // 27.11 «Как ты пишешь в блоге?»: шаг 5 манера (до двух кодов MANERA из lib/generation/zh13/prompt.ts), шаг 6 три коротких
  manera: string[]; address: 'ty' | 'vy' | null; mat: 'no' | 'light' | 'free' | null; oSebe: 'da' | 'net' | null
}

const EMPTY: Answers = { name: '', gender: null, approaches: [], klienty: EMPTY_KLIENTY, topics: [], ownTopic: '', phrases: [], ownPhrase: '', tone: '', situation: 0, manera: [], address: null, mat: null, oSebe: null }

// Тексты шагов 5-6 (copywriter-psycont 27.11) и коды манер, как в генераторе (MANERA в lib/generation/zh13/prompt.ts)
const T6 = {
  manHint: 'Выбери одну или две', neZnayu: 'Пока не знаю', neZnayuSub: 'Тогда первый текст выйдет спокойным, дальше PsyCont подстроится под твои правки',
  tretya: 'Можно до двух. Сними одну, чтобы выбрать другую',
  title6: 'Еще три мелочи', hint6: 'Все это поменяешь потом в «Настройках»',
  address: 'К читателю:', ty: 'На ты', vy: 'На вы',
  oSebe: 'Рассказываешь о себе в блоге?', da: 'Да', daSub: 'И про личное, только с твоих слов', net: 'Нет', netSub: 'Про работу можно: «ко мне приходят», «в практике вижу»',
  mat: 'Материшься в текстах?', matNo: 'Нет', matNoSub: 'Ни мата, ни даже «блин»', matLight: 'Иногда', matLightSub: 'Со звездочками внутри слова', matFree: 'Да', matFreeSub: 'Без звездочек, как в жизни',
  missAll: 'Отметь по одному ответу в каждом вопросе', missAddr: 'Выбери, на ты или на вы', missMat: 'Выбери ответ про мат',
}
// 0 вход, 1-6 вопросы, 7 финал
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

// Вера и ее реплика: стикер слева, пузырь с хвостиком к лицу
function Vera({ src, h, w, tilt = '', children, delay, caption }: { src: string; h: number; w: number; tilt?: string; children: React.ReactNode; delay: boolean; caption?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" aria-hidden="true" width={w} height={h} style={{ height: h, width: w, filter: 'drop-shadow(0 2px 6px rgba(59,42,34,.12))' }} className={tilt} />
        {/* кто она: при первом знакомстве подпись под стикером */}
        {caption && <p className="mt-1.5 text-[13px] leading-4 text-brand-muted text-center max-w-[110px]">{caption}</p>}
      </div>
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
  const [limitHint, setLimitHint] = useState(false)
  // остальные подходы под «Еще»; раскрыт сразу, если выбран кто-то из скрытых (вернулась на шаг)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { if (a.approaches.some(x => !TOP_APPROACHES.includes(x))) setShowAll(true) }, [a.approaches])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [topic, setTopic] = useState('')
  const stepStart = useRef(Date.now())
  const titleRef = useRef<HTMLHeadingElement>(null)
  const actionRef = useRef<HTMLDivElement>(null)
  const uidRef = useRef<string | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const blockRef = useRef<HTMLDivElement>(null)
  const [centered, setCentered] = useState(true)
  const decideRef = useRef<() => void>(() => {})
  // флаг нового мозга: с ним финал ведет на новый «Сделать» (пост и карусель), без него как раньше
  const [newGen, setNewGen] = useState<boolean | null>(null)
  // zh13 (у всех с 19.11): «Сделать» пишет один текст за раз, финал обещает ровно это и передает только тему
  const [zh13, setZh13] = useState(false)

  // сессия, «профиль уже есть» (анти-цикл, как было) и восстановление ответов после перезагрузки
  useEffect(() => {
    let active = true
    // dev-просмотр без входа и без базы: снимки экранов делаются на фиктивном Supabase
    if (isPreview() && new URLSearchParams(window.location.search).get('nouser') === '1') {
      uidRef.current = 'preview'
      setNewGen(true)
      const s = Number(new URLSearchParams(window.location.search).get('step'))
      setStep((s >= 0 && s <= TOTAL ? s : 0) as Step)
      setReady(true)
      return () => { active = false }
    }
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return
      if (!user) { router.replace('/'); return }
      uidRef.current = user.id
      fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => { if (active) { setNewGen(j?.newPipeline === true); setZh13(j?.zh13 === true) } }).catch(() => { if (active) setNewGen(false) })
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
        // старая форма ответов (до 19.11) без новых полей: недостающее берется из EMPTY
        // группы чистятся по нынешним данным (коды групп первой версии анкеты больше не существуют)
        setA({ ...EMPTY, ...restored.a, klienty: parseKlienty(restored.a.klienty) })
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
    if (!ready || step === 7) return
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

  // по центру или сверху: блок меньше 60% высоты под шапкой и клавиатура закрыта.
  // useLayoutEffect: решаем до отрисовки, иначе на смене шага блок мелькает по центру и прыгает наверх
  useLayoutEffect(() => {
    const decide = () => {
      const area = areaRef.current, block = blockRef.current
      if (!area || !block) return
      const avail = window.innerHeight - area.getBoundingClientRect().top + window.scrollY
      // клавиатура открыта: фокус в поле и видимая область заметно ниже окна (на десктопе фокус не мешает центру)
      const el = document.activeElement
      const vv = window.visualViewport
      const keyboard = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !!vv && vv.height < window.innerHeight - 120
      setCentered(!keyboard && block.offsetHeight < avail * 0.6)
    }
    decideRef.current = decide
    decide()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(decide) : null
    if (ro && blockRef.current) ro.observe(blockRef.current)
    window.addEventListener('resize', decide)
    window.visualViewport?.addEventListener('resize', decide)
    document.addEventListener('focusin', decide)
    document.addEventListener('focusout', decide)
    return () => { ro?.disconnect(); window.removeEventListener('resize', decide); window.visualViewport?.removeEventListener('resize', decide); document.removeEventListener('focusin', decide); document.removeEventListener('focusout', decide) }
  }, [ready, step])

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

  // темы: отмеченные по кругу между группами и своя тема в конце; фразы так же
  const topics = [...new Set([...temyPoKrugu(a.klienty.groups, a.topics), ...(a.ownTopic.trim() ? [a.ownTopic.trim()] : [])])]
  const valid: Record<number, boolean> = { 1: !!a.name.trim() && !!a.gender, 2: a.approaches.length > 0, 3: a.klienty.groups.length > 0, 4: true, 5: a.manera.length > 0, 6: !!a.address && !!a.mat }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    // id взят при загрузке: повторный getUser при сбое сети выкинул бы на вход вместо «проверь связь»
    const uid = uidRef.current
    if (!uid) { router.replace('/'); return }
    // те же поля, что раньше; тон ползунками больше не пишем. Темы в niches, первая в one_niche, фразы строками
    const profileData: Record<string, unknown> = {
      user_id: uid,
      full_name: a.name.trim(),
      // род автора для текстов (16.11): генератор больше не угадывает его по имени
      author_gender: a.gender === 'male' ? 'male' : 'female',
      approaches: a.approaches,
      niches: topics,
      one_niche: topics[0] || '',
      klienty: a.klienty,
      // 27.11 «Как ты пишешь в блоге?» (читает zh13 avtorIz); tone_verbal и client_pain_phrases знакомство больше не пишет
      manera: a.manera.slice(0, 2),
      reader_address: a.address,
      profanity: a.mat,
      ...(a.mat === 'light' ? { mat_zvezdy: true } : a.mat === 'free' ? { mat_zvezdy: false } : {}),
      // ступени Настроек: 1 можно и про личное, 2 без личного, про работу можно; не ответила: поле не трогаем
      ...(a.oSebe === 'da' ? { disclosure: 1 } : a.oSebe === 'net' ? { disclosure: 2 } : {}),
    }
    // upsert, чтобы полная распаковка потом ДОПОЛНЯЛА строку, а не падала на дубле user_id
    let saveErr: unknown = null
    try {
      if (!isPreview()) {
        saveErr = (await supabase.from('onboarding_profiles').upsert(profileData, { onConflict: 'user_id' })).error
        // миграция manera (или klienty) еще не применена: сохраняем все остальное без нового поля, ответы не теряются
        for (const pole of ['manera', 'klienty']) {
          if (saveErr && new RegExp(pole).test(String((saveErr as { message?: string }).message || ''))) {
            delete profileData[pole]
            saveErr = (await supabase.from('onboarding_profiles').upsert(profileData, { onConflict: 'user_id' })).error
          }
        }
      }
    } catch (e) { saveErr = e }
    if (saveErr) {
      setError('Не получилось сохранить. Проверь связь и нажми еще раз')
      setSaving(false)
      return
    }
    try { sessionStorage.removeItem(STORE) } catch {}
    // имя для писем входа («{имя}, привет!»), в фоне, без ожидания
    if (!isPreview()) void syncEmailName(a.name)
    // первая тема без модели: ситуация из первой отмеченной темы (та же логика, что «Не знаю, о чем писать»)
    setTopic(firstTopic(topics[0], '', topics))
    track('onb_done')
    setSaving(false)
    go(7)
  }

  const next = () => {
    // шаг 6: тап по неактивной «Готово» ведет к первому неотвеченному вопросу (дизайнер 27.11)
    if (step === 6 && !valid[6] && !moving && !saving) {
      const el = document.querySelector<HTMLInputElement>(!a.address ? 'input[name="onb-address"]' : 'input[name="onb-mat"]')
      el?.closest('fieldset')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
      return
    }
    if (moving || saving || !valid[step]) return
    if (step >= 1 && step <= TOTAL) done(step)
    if (step === TOTAL) save()
    else go((step + 1) as Step)
  }

  const startFirst = () => {
    track('onb_first_click')
    // новый мозг: тема в поле, Пост и Карусель выбраны, генерация только по нажатию.
    // Без флага старый экран как раньше: auto=1 сам пишет первый пост, теперь на этой теме (старый экран пишет только пост)
    // тема дня не в адресе, а через sessionStorage (lib/make-handoff.ts)
    // zh13: кнопка сразу запускает первый текст на этой теме (go, одноразовый признак, аудит 19.11 Б1)
    router.push(zh13
      ? makeHref({ first: '1', topic, go: '1' })
      : newGen === false
      ? makeHref({ first: '1', auto: '1', topic })
      : makeHref({ first: '1', topic, formats: 'post,carousel' }))
  }

  if (!ready) {
    return (
      <div className="min-h-dvh bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-accent animate-spin" aria-label="Загрузка" />
      </div>
    )
  }

  // ---------- общие куски ----------
  const green = 'w-full h-[52px] rounded-2xl text-[16px] font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover cursor-pointer transition'
  const outline = 'w-full h-[52px] rounded-2xl text-[16px] font-semibold border-[1.5px] border-brand-accent text-brand-accent bg-brand-card cursor-pointer transition'
  // вопросы 2 и 6 крупнее, чтобы не было пустоты; на 3-5 свои плотные чипы (components/anketa), иначе не влезает в 375×667
  const big = step === 2
  const chip = (on: boolean, dim = false) => `${big ? 'min-h-[52px] px-5 text-[17px]' : 'h-11 px-4 text-[15px]'} inline-flex items-center gap-1.5 rounded-full cursor-pointer transition ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text'} ${dim ? 'opacity-50' : ''}`
  const inputCls = 'h-14 w-full rounded-[20px] bg-brand-card border-[1.5px] border-brand-border px-4 text-[16px] text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-[3px] focus:ring-brand-soft'

  const missing: Record<number, string> = {
    1: !a.name.trim() ? 'Напиши имя' : 'Выбери, как пишешь о себе',
    2: 'Выбери хотя бы один подход',
    3: 'Отметь хотя бы одну группу',
    6: !a.address && !a.mat ? T6.missAll : !a.address ? T6.missAddr : T6.missMat,
  }
  const nextBlock = (label = 'Дальше') => (
    // прилипает к низу экрана, если карточка длиннее окна (длинный список групп на 375×667)
    <div ref={actionRef} className={`sticky bottom-0 z-10 bg-brand-bg pt-2 pb-[max(4px,env(safe-area-inset-bottom))] ${step === 6 ? 'mt-1' : step === 3 ? 'mt-2' : 'mt-3'}`}>
      <button type="button" onClick={next} aria-disabled={!valid[step] || saving} aria-describedby="onb-missing"
        className={valid[step] && !saving ? green : 'w-full h-[52px] rounded-2xl text-[16px] font-semibold bg-brand-border text-brand-muted cursor-not-allowed'}>
        {saving ? <span className="inline-flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Сохраняется</span> : label}
      </button>
      <p id="onb-missing" className="mt-2 min-h-[18px] text-center text-[13px] text-brand-muted" role="status">
        {limitHint ? (step === 5 ? T6.tretya : 'Можно до трех. Сними один, чтобы выбрать другой') : !valid[step] ? missing[step] || '' : ''}
      </p>
    </div>
  )
  // необязательный шаг: ничего не отмечено = «Пропустить», есть ответ = «Дальше» (один слот)
  const skipBlock = (n: 4 | 5, has: boolean) => (
    <div ref={actionRef} className="sticky bottom-0 z-10 bg-brand-bg pt-2 pb-[max(4px,env(safe-area-inset-bottom))] mt-3">
      <button type="button" disabled={moving}
        onClick={() => { if (has) next(); else { track('onb_skip', { step: n }); done(n); go((n + 1) as Step) } }}
        className={has ? green : outline}>
        {has ? 'Дальше' : 'Пропустить'}
      </button>
      <p className="mt-2 text-center text-[13px] text-brand-muted">Можно дописать потом в «Настройках»</p>
    </div>
  )
  const title = (t: string, hint?: string) => (
    <>
      {/* заголовок и подсказка одного размера на всех вопросах */}
      <h1 ref={titleRef} tabIndex={-1} className="text-[29px] leading-[34px] font-semibold text-brand-text outline-none">{t}</h1>
      {hint && <p className="mt-1.5 text-[16px] leading-[22px] text-brand-muted">{hint}</p>}
    </>
  )

  // ---------- карточки ----------
  let body: React.ReactNode = null
  if (step === 0) {
    body = (
      <div>
        <Vera src="/vera/privet.webp" h={120} w={93} tilt="-rotate-2" delay={!reduce} caption="Вера · помогаю вести блог">
          <p className="text-[16px] leading-[22px]">Расскажи о практике и о том, как ты пишешь. Шесть коротких вопросов, пара минут. Остальное берет PsyCont</p>
        </Vera>
        <button type="button" onClick={() => { if (!moving) go(1) }} className={`mt-8 ${green}`}>Начать</button>
      </div>
    )
  } else if (step === 1) {
    body = (
      <div>
        {title('Как тебя зовут?', 'Чтобы посты звучали от живого человека')}
        <input autoFocus value={a.name} onChange={e => setA({ ...a, name: e.target.value })} aria-label="Как тебя зовут"
          onKeyDown={e => { if (e.key === 'Enter') next() }} placeholder="Например, Анна" autoComplete="given-name" enterKeyHint="next"
          className={`mt-5 ${inputCls}`} />
        {/* род автора (16.11, тексты copywriter-psycont): от него глаголы в текстах от ее или его лица */}
        {/* 17.11 (словарь, вариант А): ничего не выбрано заранее, «Дальше» ждет выбора (valid[1]) */}
        <p id="onb-gender" className="mt-6 text-[17px] leading-6 font-semibold text-brand-text">Как пишешь о себе?</p>
        <div role="radiogroup" aria-labelledby="onb-gender" aria-describedby="onb-gender-why" className="mt-3 flex flex-col gap-2">
          {([['female', 'В женском роде', 'я заметила'], ['male', 'В мужском роде', 'я заметил']] as const).map(([g, label, sample]) => {
            const on = a.gender === g
            return (
              <button key={g} type="button" role="radio" aria-checked={on} aria-label={`${label}: ${sample}`} onClick={() => setA({ ...a, gender: g })}
                className={`w-full min-h-[56px] rounded-[20px] px-4 py-2.5 text-left cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent' : 'bg-brand-card border border-brand-border'}`}>
                <span className="flex items-center gap-2 text-[16px] leading-[22px] font-semibold text-brand-text">
                  {on && <Check className="w-4 h-4 text-brand-accent shrink-0" aria-hidden="true" />}{label}
                </span>
                <span className="block text-[15px] leading-5 text-brand-muted">{sample}</span>
              </button>
            )
          })}
        </div>
        <p id="onb-gender-why" className="mt-2 text-[14px] leading-5 text-brand-muted">Посты пишутся от твоего лица, так в них не будет ошибок в роде</p>
        {nextBlock()}
      </div>
    )
  } else if (step === 2) {
    body = (
      <div>
        {title('В каком подходе работаешь?', 'Чтобы не писать то, что противоречит твоему методу')}
        <p className="mt-5 text-[14px] leading-5 text-brand-muted">Можно выбрать до трех</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {(showAll ? ALL_APPROACHES : TOP_APPROACHES).map(x => {
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
          {!showAll && (
            <button type="button" aria-expanded={false} onClick={() => setShowAll(true)} className={chip(false)}>Еще</button>
          )}
        </div>
        {nextBlock()}
      </div>
    )
  } else if (step === 3) {
    body = (
      <div>
        {title('С чем работаешь?', 'Отметь группы, все их темы выберутся сами. Стрелка покажет темы')}
        <div className="mt-3">
          <SChemRabotaesh groups={a.klienty.groups} topics={a.topics} onChange={v => setA({ ...a, klienty: { ...a.klienty, groups: v.groups }, topics: v.topics })}
            own={a.ownTopic} onOwn={v => setA({ ...a, ownTopic: v })} />
        </div>
        {nextBlock()}
      </div>
    )
  } else if (step === 4) {
    const k = a.klienty
    const has = k.age.length > 0 || !!k.gender || k.format.length > 0
    body = (
      <div>
        {title('Кто к тебе приходит?', 'Можно пропустить')}
        <div className="mt-1">
          <KtoPrihodit value={a.klienty} onChange={v => setA({ ...a, klienty: v })} />
        </div>
        {skipBlock(4, has)}
      </div>
    )
  } else if (step === 5) {
    // Манера (27.11, разбор 245 рилсов): одну или две; «Пока не знаю» в слоте кнопки, пока ничего не выбрано
    const full = a.manera.length >= 2
    body = (
      <div>
        {title('Как ты пишешь в блоге?')}
        <p id="onb-manera-hint" className="mt-1.5 text-[14px] leading-5 text-brand-muted">{T6.manHint}</p>
        <div role="group" aria-label="Как ты пишешь в блоге" aria-describedby="onb-manera-hint" className="mt-3 flex flex-col gap-1.5">
          {MANERY.map(m => {
            const on = a.manera.includes(m.kod)
            const off = full && !on
            return (
              <button key={m.kod} type="button" aria-pressed={on} aria-disabled={off || undefined}
                aria-labelledby={`man-${m.kod}`} aria-describedby={`man-${m.kod}-p`}
                onClick={() => {
                  if (on) { setLimitHint(false); setA({ ...a, manera: a.manera.filter(k => k !== m.kod) }); return }
                  if (full) { setLimitHint(true); return }
                  setLimitHint(false); setA({ ...a, manera: [...a.manera, m.kod] })
                }}
                className={`w-full min-h-[56px] rounded-2xl border-[1.5px] px-3 py-2 flex items-start gap-2.5 text-left cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg ${on ? 'bg-brand-soft border-brand-accent' : 'bg-brand-card border-brand-border hover:border-brand-accent/40'}`}>
                <span aria-hidden="true" className={`mt-px w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${on ? 'bg-brand-accent' : off ? 'border-[1.5px] border-dashed border-brand-border' : 'border-[1.5px] border-brand-border bg-brand-card'}`}>
                  {on && <Check className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="min-w-0">
                  <span id={`man-${m.kod}`} className="block text-[16px] leading-5 font-semibold text-brand-text">{m.imya}</span>
                  <span id={`man-${m.kod}-p`} className={`mt-0.5 block text-[14px] leading-[19px] ${on ? 'text-brand-text' : 'text-brand-muted'}`}>«{m.primer}»</span>
                </span>
              </button>
            )
          })}
        </div>
        {a.manera.length ? nextBlock() : (
          <div ref={actionRef} className="sticky bottom-0 z-10 bg-brand-bg pt-2 pb-[max(4px,env(safe-area-inset-bottom))] mt-3">
            <button type="button" disabled={moving} className={outline}
              onClick={() => { setLimitHint(false); setA({ ...a, manera: [] }); track('onb_skip', { step: 5 }); done(5); go(6) }}>
              {T6.neZnayu}
            </button>
            <p id="onb-missing" className="mt-2 min-h-[18px] text-center text-[13px] text-brand-muted" role="status">{limitHint ? T6.tretya : T6.neZnayuSub}</p>
          </div>
        )}
      </div>
    )
  } else if (step === 6) {
    // Три коротких (27.11): ты/вы и мат обязательны, «о себе» можно не отвечать (тогда поле в базе не трогаем)
    const variant = (name: string, checked: boolean, onPick: () => void, text: string, sub?: string, req = false) => (
      <label className={`${sub ? 'min-h-[60px]' : 'min-h-[48px]'} rounded-2xl border-[1.5px] px-2 py-2 flex flex-col items-center justify-center text-center cursor-pointer transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-brand-bg ${checked ? 'bg-brand-soft border-brand-accent' : 'bg-brand-card border-brand-border hover:border-brand-accent/40'}`}>
        <input type="radio" name={name} checked={checked} onChange={onPick} required={req} className="sr-only" />
        <span className={`inline-flex items-center gap-1.5 text-[16px] leading-5 text-brand-text ${checked ? 'font-semibold' : ''}`}>{checked && <Check className="w-4 h-4 text-brand-accent" aria-hidden="true" />}{text}</span>
        {sub && <span className="mt-0.5 text-[13px] leading-4 text-brand-muted">{sub}</span>}
      </label>
    )
    const legend = 'text-[17px] leading-6 font-semibold text-brand-text'
    body = (
      <div>
        {title(T6.title6, T6.hint6)}
        <fieldset className="mt-5">
          <legend className={legend}>{T6.address}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 items-stretch">
            {variant('onb-address', a.address === 'ty', () => setA({ ...a, address: 'ty' }), T6.ty, undefined, true)}
            {variant('onb-address', a.address === 'vy', () => setA({ ...a, address: 'vy' }), T6.vy, undefined, true)}
          </div>
        </fieldset>
        <fieldset className="mt-5">
          <legend className={legend}>{T6.oSebe}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 items-stretch">
            {variant('onb-osebe', a.oSebe === 'da', () => setA({ ...a, oSebe: 'da' }), T6.da, T6.daSub)}
            {variant('onb-osebe', a.oSebe === 'net', () => setA({ ...a, oSebe: 'net' }), T6.net, T6.netSub)}
          </div>
        </fieldset>
        <fieldset className="mt-5">
          <legend className={legend}>{T6.mat}</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 items-stretch">
            {variant('onb-mat', a.mat === 'no', () => setA({ ...a, mat: 'no' }), T6.matNo, T6.matNoSub, true)}
            {variant('onb-mat', a.mat === 'light', () => setA({ ...a, mat: 'light' }), T6.matLight, T6.matLightSub, true)}
            {variant('onb-mat', a.mat === 'free', () => setA({ ...a, mat: 'free' }), T6.matFree, T6.matFreeSub, true)}
          </div>
        </fieldset>
        {nextBlock('Готово')}
      </div>
    )
  } else {
    const name = a.name.trim()
    body = (
      <div>
        <Vera src="/vera/raduetsya.webp" h={140} w={117} tilt="rotate-2" delay={!reduce}>
          <h1 ref={titleRef} tabIndex={-1} className="text-[20px] leading-[26px] font-semibold outline-none">{name ? `Готово, ${name}, я тебя услышала` : 'Готово, я тебя услышала'}</h1>
        </Vera>
        <div className="mt-6 rounded-[20px] bg-brand-card border border-brand-border p-4">
          <p className="text-[13px] leading-[18px] text-brand-muted">Первая тема под тебя:</p>
          <p className="mt-1 text-[18px] leading-6 font-semibold text-brand-text line-clamp-3 break-words">{topic}</p>
        </div>
        <button type="button" onClick={startFirst} disabled={newGen === null} className={`mt-5 ${green} disabled:opacity-60`}>{zh13 ? 'Написать первый текст' : newGen === false ? 'Написать пост' : 'Написать пост и карусель'}</button>
        {/* тема уходит и сюда (26.11): на «Написать» подсказка поля назовет ее, если человек передумает писать свою мысль */}
        <button type="button" onClick={() => router.push(makeHref({ first: '1', topic }))}
          className="mt-2 h-12 w-full rounded-2xl border border-brand-border bg-brand-card text-center text-[15px] font-semibold text-brand-text cursor-pointer hover:bg-brand-soft-2">Или начни со своей мысли</button>
      </div>
    )
  }

  const q = step >= 1 && step <= TOTAL ? step : 0
  return (
    <div className="min-h-dvh bg-brand-bg overflow-x-clip flex flex-col">
      {/* шапка сверху, карточка по центру оставшейся высоты, оптический центр чуть выше середины (снизу 10dvh) */}
      <div className="flex-1 w-full max-w-[440px] mx-auto px-4 pt-[max(8px,env(safe-area-inset-top))] flex flex-col">
        {/* шапка стоит на месте, двигается только тело */}
        <div className="h-11 flex items-center gap-1">
          {step >= 1 && step <= TOTAL ? (
            <button type="button" onClick={back} aria-label="Назад" className="w-11 h-11 -ml-2.5 flex items-center justify-center rounded-full text-brand-text hover:bg-brand-soft cursor-pointer shrink-0">
              <ChevronLeft className="w-6 h-6" />
            </button>
          ) : <span className="w-11 h-11 -ml-2.5 shrink-0" />}
          {/* делений столько же, сколько шагов в подписи «Шаг N из 6» (17.11) */}
          <div className="flex-1 flex gap-1" aria-hidden="true">
            {Array.from({ length: TOTAL }, (_, i) => {
              const filled = i < q - 1 || step === 7
              const current = !filled && i === q - 1
              return <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${filled ? 'bg-brand-accent' : current ? 'bg-brand-lilac ring-1 ring-inset ring-brand-accent' : 'bg-brand-border'}`} />
            })}
          </div>
        </div>
        {q > 0 && <p className="pl-12 mt-0.5 text-[13px] leading-[18px] text-brand-muted tabular-nums">Шаг {q} из {TOTAL}</p>}

        {/* Правило Арины: мало контента, блок по центру (чуть выше середины, снизу 10dvh); много, сверху сразу под
            счетчиком. Решаем по высоте блока (меньше 60% доступной высоты), а не списком экранов. При открытой
            клавиатуре всегда сверху. my-auto не обрезает верх: высокая карточка просто прокручивается с начала */}
        <div ref={areaRef} className={`flex-1 flex flex-col ${centered ? 'pt-6 pb-[max(2rem,10dvh)]' : 'pt-4 pb-4'}`}>
        <div ref={blockRef} className={`${centered ? 'my-auto' : ''} w-full`}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          {/* новая карточка смонтировалась: решаем по ее высоте сразу, до отрисовки (AnimatePresence держит старую до конца выхода) */}
          <motion.div key={step} ref={(n: HTMLDivElement | null) => { if (n) decideRef.current() }}
            initial={reduce ? false : { opacity: 0, x: 24 * dir }}
            animate={{ opacity: 1, x: 0, transition: { duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] } }}
            exit={reduce ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0, x: -24 * dir, transition: { duration: 0.14, ease: 'easeIn' } }}>
            {body}
          </motion.div>
        </AnimatePresence>
        </div>
        </div>
      </div>

      {/* dev-просмотр still=1: без CSS-переходов, в фоновой вкладке они не доигрываются и снимки врут */}
      {reduce && isPreview() && <style>{'*{transition:none!important;animation:none!important}'}</style>}

    </div>
  )
}
