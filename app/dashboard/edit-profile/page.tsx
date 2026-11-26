// app/dashboard/edit-profile/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ArrowLeft, Check, CheckCircle, User,
  Heart, MapPin, Loader2
} from 'lucide-react'
import VoiceTextarea from '@/components/VoiceTextarea'
import { QUIET_BTN_SM_MUTED } from '@/lib/ui-classes'
import { syncEmailName } from '@/lib/auth-name'
import { KtoPrihodit, PickChips, SChemRabotaesh, chipCls } from '@/components/anketa/AnketaBlocks'
import { EMPTY_KLIENTY, frazyDlya, gruppaTemy, parseKlienty, temyPoKrugu, type Klienty } from '@/lib/anketa'

// Профиль практики (этап 5.5 шаг 2): только ФАКТЫ о работе. Стиль и личность теперь
// целиком держит тест-архетип, поэтому стилевые вопросы (тон, ценности, суперсилы,
// живой голос) из анкеты убраны. Цели уехали в трекер контент-плана. Мертвые поля
// (content_struggles, content_pain, idols, something_else) выкинуты совсем.
const blocks = [
  { id: 'practice', title: 'Ты и практика', icon: User, color: 'text-brand-accent bg-brand-soft' },
  { id: 'client', title: 'Твой клиент', icon: Heart, color: 'text-brand-accent bg-brand-soft' },
  { id: 'outward', title: 'Как ты в блоге', icon: MapPin, color: 'text-brand-sage bg-brand-soft' },
]

// только метки на экране: в базу идет female/male (prefill и сохранение сравнивают с этими строками)
const GENDER_OPTIONS = ['В женском роде: я заметила', 'В мужском роде: я заметил']

const questions = [
  // --- БЛОК 1: ТЫ И ПРАКТИКА ---
  {
    block: 0, key: 'full_name',
    title: 'Как тебя зовут и как к тебе обращаться?',
    subtitle: 'Как тебя зовут клиенты. А на «ты» или на «вы» писать читателю, выберешь в настройках голоса.',
    type: 'text_and_single',
    placeholder: 'Например: Анна Петрова',
    options: ['По имени (Анна)', 'По имени-отчеству (Анна Сергеевна)', 'На «ты» по имени'],
    optionsKey: 'appeal'
  },
  {
    block: 0, key: 'approaches',
    title: 'В каком подходе работаешь?',
    subtitle: 'Какой подход основной, тот, через который смотришь на мир?',
    type: 'multi',
    options: [
      'КПТ (когнитивно-поведенческая)', 'Гештальт-терапия', 'Психоанализ',
      'Экзистенциальная терапия', 'Системная семейная терапия', 'Арт-терапия',
      'ACT (терапия принятия)', 'Схема-терапия', 'EMDR',
      'Телесно-ориентированная терапия', 'Эклектика / интегративный'
    ]
  },
  {
    // род автора (16.11): генератор больше не угадывает его по имени; значения female/male, метки ниже
    block: 0, key: 'author_gender',
    title: 'Как пишешь о себе?',
    subtitle: 'Посты пишутся от твоего лица, так в них не будет ошибок в роде',
    type: 'single',
    options: GENDER_OPTIONS,
  },
  {
    block: 0, key: 'experience',
    title: 'Сколько лет в практике?',
    type: 'single',
    options: ['Меньше года (только начинаю)', '1-3 года', '3-5 лет', '5-10 лет', '10+ лет'],
  },
  {
    block: 0, key: 'formats',
    title: 'Как работаешь и сколько стоит сессия?',
    subtitle: 'Форматы работы и примерная цена.',
    type: 'multi_and_single',
    options: ['Индивидуально (взрослые)', 'Индивидуально (подростки)', 'Детская', 'Семейная/парная', 'Групповая', 'Онлайн', 'Очно', 'Супервизия'],
    singleKey: 'price',
    singleOptions: ['до 3000₽', '3000-5000₽', '5000-7000₽', '7000-10000₽', '10000₽+']
  },

  // --- БЛОК 2: ТВОЙ КЛИЕНТ ---
  // Анкета 2 (19.11): вместо одной ниши и портрета клиента те же блоки, что в экспресс-анкете (components/anketa).
  // Портрет клиента («Кто твой клиент?») больше не спрашиваем: старые client_avatar и client_job сохраняются как были.
  // версия 2 (19.11): «с чем работаешь» группами с раскрытием тем, потом необязательное «кто приходит»
  {
    block: 1, key: 'niches',
    title: 'С чем работаешь?',
    subtitle: 'Отметь группы, все их темы выберутся сами. Стрелка покажет темы, лишние можно снять.',
    type: 'temy',
  },
  {
    block: 1, key: 'klienty',
    title: 'Кто к тебе приходит?',
    subtitle: 'Возраст, пол и формат. Можно пропустить.',
    type: 'klienty',
  },
  {
    block: 1, key: 'client_pain_phrases',
    title: 'Что говорят твои клиенты?',
    subtitle: 'Отметь фразы, которые слышишь, или допиши свою. Можно пропустить.',
    type: 'frazy',
  },
  {
    block: 1, key: 'client_tried',
    title: 'Что он пробовал до тебя?',
    subtitle: 'С чем приходит за спиной.',
    type: 'multi',
    options: [
      'Читал книги', 'Смотрел YouTube', 'Другой психолог', 'Таблетки', 'Пытался «не думать»', 'Медитации/Йога', 'Обращается впервые'
    ]
  },
  {
    block: 1, key: 'client_fear',
    title: 'Чего он боится перед терапией?',
    subtitle: 'Что мешает записаться?',
    type: 'multi',
    options: [
      '«Другим хуже»', '«Психолог для сумасшедших»', '«Дорого»', '«Не поможет»', '«Копаться в прошлом страшно»', '«Стыдно»'
    ]
  },
  {
    block: 1, key: 'client_result',
    title: 'Что меняется после работы с тобой?',
    subtitle: 'Конкретное действие, которое человек начинает делать по-другому. Можно голосом.',
    type: 'textarea',
    placeholder: 'Например: «перестала звонить бывшему ночью», «впервые взяла отпуск и не проверяла почту»'
  },

  // --- БЛОК 3: КАК ТЫ ВЕДЕШЬСЯ НАРУЖУ ---
  {
    block: 2, key: 'platforms',
    title: 'Где ведешь блог?',
    subtitle: 'И сколько сейчас подписчиков?',
    type: 'multi_and_single',
    options: ['Instagram', 'Telegram', 'Пока нигде'],
    singleKey: 'current_followers',
    singleOptions: ['0', 'до 500', '500-2000', '2000-5000', '5000+'],
    videoToggle: true
  },
  {
    block: 2, key: 'anti_values',
    title: 'Что бесит тебя в индустрии?',
    subtitle: 'Против чего ты. От этого будут отталкиваться посты.',
    type: 'multi',
    options: [
      'Инфоцыганство («вылечу за 1 сессию»)', 'Попсовая психология («мысли позитивно»)',
      'Обесценивание («поговори с подругой»)', 'Гонка за подписчиками',
      'Нарушение этики', 'Диагнозы через экран', 'Шаблонные советы («подыши»)'
    ]
  }
]

// Значения тумблера видео. Храним строкой в существующем поле video_attitude,
// чтобы промпты читали осмысленную фразу (схему БД не трогаем).
const VIDEO_YES = 'Снимаю видео'
const VIDEO_NO = 'Пока без видео'

export default function EditProfile() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  // своя тема и своя фраза: поле под чипами, при сохранении встают в конец списков
  const [ownTopic, setOwnTopic] = useState('')
  const [ownPhrase, setOwnPhrase] = useState('')
  const router = useRouter()

  // Загрузка существующего профиля. Префилим только поля, которые форма спрашивает.
  // Стилевые и целевые колонки (live_voice, values, superpowers, tone_*, цели) НЕ
  // трогаем: их нет ни в prefill, ни в handleSubmit, значит .update их не перезапишет
  // и данные архетипа/старой анкеты сохранятся.
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('onboarding_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!profile) {
        router.push('/onboarding/express')
        return
      }

      setAnswers({
        full_name: profile.full_name || '',
        author_gender: profile.author_gender === 'male' ? GENDER_OPTIONS[1] : GENDER_OPTIONS[0],
        appeal: profile.appeal || '',
        approaches: profile.approaches || [],
        klienty: parseKlienty(profile.klienty),
        niches: Array.isArray(profile.niches) ? profile.niches.map(String) : [],
        one_niche: profile.one_niche || '',
        experience: profile.experience || '',
        formats: profile.formats || [],
        price: profile.price || '',
        client_avatar: profile.client_avatar || '',
        client_job: profile.client_job || '',
        // фразы хранятся строкой через перенос, в форме это список чипов
        client_pain_phrases: String(profile.client_pain_phrases || '').split(/\n/).map((x: string) => x.trim()).filter(Boolean),
        client_tried: profile.client_tried || [],
        client_fear: profile.client_fear || [],
        client_result: profile.client_result || '',
        platforms: profile.platforms || [],
        current_followers: profile.current_followers || '',
        anti_values: profile.anti_values || [],
        video_attitude: profile.video_attitude || '',
      })
      setLoading(false)
    }
    loadProfile()
  }, [router])

  const currentQuestion = questions[Math.min(step, questions.length - 1)]
  const currentBlock = blocks[currentQuestion.block]
  const progress = ((step + 1) / questions.length) * 100

  const toggleArrayItem = (key: string, item: string, max?: number) => {
    const arr = answers[key] || []
    if (arr.includes(item)) {
      setAnswers({ ...answers, [key]: arr.filter((i: string) => i !== item) })
    } else {
      if (max && arr.length >= max) return
      setAnswers({ ...answers, [key]: [...arr, item] })
    }
  }

  const canProceed = () => {
    const { key, type } = currentQuestion
    const textKey = (currentQuestion as any).textKey
    const singleKey = (currentQuestion as any).singleKey
    const optionsKey = (currentQuestion as any).optionsKey

    if (type === 'klienty') return true
    // старые пользователи без групп: их ниши засчитываются, перезаполнять не нужно
    if (type === 'temy') return ((answers.klienty as Klienty | undefined)?.groups.length || 0) > 0 || (answers.niches || []).length > 0 || !!ownTopic.trim()
    if (type === 'frazy') return true
    if (type === 'text' || type === 'textarea') return (answers[key]?.length > 2)
    if (type === 'single') return !!answers[key]
    if (type === 'multi') return (answers[key]?.length > 0)
    if (type === 'text_and_single') return (answers[key]?.length > 2 && !!answers[optionsKey])
    if (type === 'multi_and_text') return (answers[key]?.length > 0 && answers[textKey]?.length > 2)
    if (type === 'single_and_text') return (answers[key] && answers[textKey]?.length > 2)
    if (type === 'multi_and_single') {
      if (!(answers[key]?.length > 0)) return false
      // «Пока нигде» на площадках снимает требование указать число подписчиков
      if (key === 'platforms' && answers.platforms.every((p: string) => p === 'Пока нигде')) return true
      return !!answers[singleKey]
    }
    return true
  }

  const handleNext = () => {
    if (step < questions.length - 1) {
      setStep(step + 1)
      window.scrollTo(0, 0)
    } else {
      handleSubmit()
    }
  }

  const handleSubmit = async () => {
    if (!userId) return
    setSaving(true)
    setSaveError(false)

    // Пишем только факты профиля практики. Остальных колонок тут нет намеренно, чтобы
    // .update не затер стиль (live_voice/values) и результат теста-архетипа.
    const topics = [...new Set([...temyPoKrugu((answers.klienty as Klienty | undefined)?.groups || [], answers.niches || []), ...(ownTopic.trim() ? [ownTopic.trim()] : [])])]
    const phrases = [...(answers.client_pain_phrases || []), ...(ownPhrase.trim() ? [ownPhrase.trim()] : [])]
    const profileData: Record<string, unknown> = {
      full_name: answers.full_name || '',
      author_gender: answers.author_gender === GENDER_OPTIONS[1] ? 'male' : 'female',
      appeal: answers.appeal || '',
      approaches: answers.approaches || [],
      niches: topics,
      one_niche: topics[0] || '',
      klienty: answers.klienty || EMPTY_KLIENTY,
      experience: answers.experience || '',
      formats: answers.formats || [],
      price: answers.price || '',
      client_avatar: answers.client_avatar || '',
      client_job: answers.client_job || '',
      client_pain_phrases: phrases.join('\n'),
      client_tried: answers.client_tried || [],
      client_fear: answers.client_fear || [],
      client_result: answers.client_result || '',
      platforms: answers.platforms || [],
      current_followers: answers.current_followers || '',
      anti_values: answers.anti_values || [],
      video_attitude: answers.video_attitude || '',
    }

    let { error } = await supabase
      .from('onboarding_profiles')
      .update(profileData)
      .eq('user_id', userId)
    // миграция klienty еще не применена: остальное сохраняем без нового поля
    if (error && /klienty/.test(error.message || '')) {
      const { klienty: _k, ...rest } = profileData
      void _k
      ;({ error } = await supabase.from('onboarding_profiles').update(rest).eq('user_id', userId))
    }

    if (error) {
      console.error('Update error:', error)
      setSaveError(true)
      setSaving(false)
      return
    }

    // имя для писем входа («{имя}, привет!»), в фоне
    void syncEmailName(String(profileData.full_name || ""))
    setCompleted(true)
  }

  // Загрузка
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-accent" />
      </div>
    )
  }

  // Завершение
  if (completed) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white max-w-lg w-full rounded-2xl p-8 border border-brand-border text-center shadow-xl"
        >
          <div className="w-20 h-20 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-brand-sage" />
          </div>
          <h1 className="text-3xl font-bold text-brand-text mb-4">Готово, профиль обновлен</h1>
          <p className="text-brand-text-secondary mb-6 leading-relaxed">
            Ответы сохранены. Следующие тексты PsyCont напишет уже с ними.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full py-4 bg-brand-accent hover:bg-brand-accent-hover text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              Вернуться в кабинет <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ═══════════════════════════════════
  // ШАГИ РЕДАКТИРОВАНИЯ
  // ═══════════════════════════════════
  const q = currentQuestion

  return (
    <div className="min-h-screen bg-brand-bg pb-24">
      {/* HEADER ПРОГРЕСС */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-brand-border">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-sm font-bold mb-3">
            <span className={currentBlock.color + ' px-3 py-1 rounded-full flex items-center gap-1.5'}>
              <currentBlock.icon className="w-4 h-4" />
              {currentBlock.title}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-brand-text-secondary">{step + 1} / {questions.length}</span>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className={QUIET_BTN_SM_MUTED}
              >
                Отмена
              </button>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <motion.div
              className="bg-brand-accent h-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      </div>

      {/* ВОПРОС */}
      <div className="max-w-3xl mx-auto px-6 pt-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-2xl md:text-4xl font-semibold text-brand-text mb-4 leading-tight">
              {q.title}
            </h2>
            {q.subtitle && <p className="text-lg text-brand-text-secondary mb-10">{q.subtitle}</p>}

            <div className="space-y-6">

              {/* 0. Блоки анкеты 2: кто приходит, темы, фразы (те же, что в экспресс-анкете) */}
              {q.type === 'klienty' && (
                <div className="max-w-xl">
                  <KtoPrihodit value={answers.klienty || EMPTY_KLIENTY} onChange={v => setAnswers({ ...answers, klienty: v })} />
                </div>
              )}
              {q.type === 'temy' && (() => {
                const k: Klienty = answers.klienty || EMPTY_KLIENTY
                const picked: string[] = answers.niches || []
                // свои темы и темы прошлой анкеты, которых нет в группах: видны отмеченными, их можно снять
                const starye = picked.filter(t => !gruppaTemy(t))
                return (
                  <div className="max-w-xl">
                    {starye.length > 0 && (
                      <div className="mb-4">
                        <p className="mb-1.5 text-[14px] font-semibold text-brand-text">Свои темы</p>
                        <div className="flex flex-wrap gap-1.5">
                          {starye.map(t => (
                            <button key={t} type="button" aria-pressed={true} onClick={() => setAnswers({ ...answers, niches: picked.filter(x => x !== t) })} className={chipCls(true, false, 'sm')}>
                              <Check className="w-4 h-4 shrink-0 text-brand-accent" /><span className="min-w-0">{t}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <SChemRabotaesh groups={k.groups} topics={picked}
                      onChange={v => setAnswers({ ...answers, klienty: { ...k, groups: v.groups }, niches: v.topics })}
                      own={ownTopic} onOwn={setOwnTopic} />
                  </div>
                )
              })()}
              {q.type === 'frazy' && (() => {
                const picked: string[] = answers.client_pain_phrases || []
                const options = [...picked.filter(x => !frazyDlya(answers.klienty?.groups || []).includes(x)), ...frazyDlya(answers.klienty?.groups || [])]
                return (
                  <div className="max-w-xl">
                    <PickChips options={options} selected={picked} first={12}
                      onChange={v => setAnswers({ ...answers, client_pain_phrases: v })}
                      own={ownPhrase} onOwn={setOwnPhrase} ownPlaceholder="Своя фраза клиента" ownLabel="Своя фраза клиента" />
                  </div>
                )
              })()}

              {/* 1. Текстовый ввод (input для имени, VoiceTextarea для развернутых) */}
              {(q.type === 'text' || q.type === 'textarea' || q.type === 'text_and_single') && (
                <div>
                  {q.type === 'textarea' ? (
                    <VoiceTextarea
                      value={answers[q.key] || ''}
                      onChange={(v) => setAnswers({ ...answers, [q.key]: v })}
                      placeholder={q.placeholder}
                    />
                  ) : (
                    <input
                      type="text"
                      value={answers[q.key] || ''}
                      onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })}
                      placeholder={q.placeholder}
                      className="w-full p-5 rounded-2xl border-2 border-gray-200 focus:border-brand-accent outline-none text-lg"
                    />
                  )}
                </div>
              )}

              {/* 2. Основная сетка опций */}
              {(q.type === 'single' || q.type === 'multi' || q.type === 'multi_and_text' || q.type === 'single_and_text' || q.type === 'multi_and_single') && (q as any).options && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {((q as any).options || []).map((opt: string) => {
                    const isMulti = q.type.includes('multi')
                    const isSelected = isMulti ? (answers[q.key] || []).includes(opt) : answers[q.key] === opt

                    return (
                      <button
                        key={opt}
                        onClick={() => isMulti ? toggleArrayItem(q.key, opt, (q as any).maxChoice) : setAnswers({ ...answers, [q.key]: opt })}
                        className={`text-left p-4 rounded-xl border-2 transition font-medium cursor-pointer flex items-start gap-3 ${isSelected ? 'border-brand-accent bg-brand-soft text-brand-text' : 'border-gray-200 bg-white hover:border-brand-border'}`}
                      >
                        <div className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center shrink-0 border ${isSelected ? 'bg-brand-accent border-brand-accent' : 'border-gray-200'}`}>
                          {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                        </div>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* 3. Дополнительный развернутый ответ (голосом) */}
              {((q as any).textKey) && (
                <div className="pt-6 mt-6 border-t border-gray-100">
                  <p className="font-bold text-brand-text mb-3 text-lg">
                    {q.key === 'niches' && 'Если бы можно было выбрать только одну тему на всю жизнь, какую?'}
                    {q.key === 'client_avatar' && 'Чем он занимается?'}
                    {!['niches', 'client_avatar'].includes(q.key) && 'Расскажи подробнее'}
                  </p>
                  <VoiceTextarea
                    value={answers[(q as any).textKey] || ''}
                    onChange={(v) => setAnswers({ ...answers, [(q as any).textKey]: v })}
                    placeholder={(q as any).textPlaceholder}
                    minHeight={100}
                  />
                </div>
              )}

              {/* 4. Дополнительная сетка опций (уточнение) */}
              {((q as any).optionsKey || (q as any).singleKey) && (
                <div className="pt-6 mt-6 border-t border-gray-100">
                  <p className="font-bold text-brand-text mb-4 text-lg">
                    {q.type === 'text_and_single' ? 'И как к тебе обращаться?' :
                      (q as any).singleKey === 'price' ? 'А сколько стоит сессия?' :
                      (q as any).singleKey === 'current_followers' ? 'И сколько сейчас подписчиков?' :
                      'Уточни:'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {((q as any).singleOptions || (q as any).options || []).map((opt: string) => {
                      const tgtKey = (q as any).optionsKey || (q as any).singleKey!
                      const isSelected = answers[tgtKey] === opt

                      return (
                        <button
                          key={opt}
                          onClick={() => setAnswers({ ...answers, [tgtKey]: opt })}
                          className={`p-4 rounded-xl border-2 font-medium transition cursor-pointer text-left flex items-start gap-3 ${isSelected ? 'border-brand-accent bg-brand-soft text-brand-text' : 'border-gray-200 hover:bg-brand-bg'}`}
                        >
                          <div className={`w-5 h-5 mt-0.5 rounded-full flex items-center justify-center shrink-0 border ${isSelected ? 'bg-brand-accent border-brand-accent' : 'border-gray-200'}`}>
                            {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                          </div>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 5. Тумблер видео (подэлемент экрана площадок, необязателен) */}
              {(q as any).videoToggle && (
                <div className="pt-6 mt-6 border-t border-gray-100">
                  <p className="font-bold text-brand-text mb-1 text-lg">Снимаешь видео?</p>
                  <p className="text-brand-text-secondary mb-4">Рилс, шортс, кружочки. Если да, в темах появятся сценарии под камеру.</p>
                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    {[{ v: VIDEO_YES, label: 'Да' }, { v: VIDEO_NO, label: 'Нет' }].map((opt) => {
                      const isSelected = answers.video_attitude === opt.v
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setAnswers({ ...answers, video_attitude: isSelected ? '' : opt.v })}
                          className={`p-4 rounded-xl border-2 font-medium transition cursor-pointer text-center ${isSelected ? 'border-brand-accent bg-brand-soft text-brand-text' : 'border-gray-200 bg-white hover:border-brand-border'}`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* FOOTER НАВИГАЦИЯ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-brand-border py-4 px-6 z-50">
        {saveError && (
          <div className="max-w-3xl mx-auto mb-3 rounded-xl bg-brand-soft border border-brand-border-soft px-4 py-2.5 text-sm text-brand-text">
            Не сохранилось, связь подвела. Ответы на месте, попробуй еще раз.
          </div>
        )}
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className={`flex items-center gap-2 font-semibold transition cursor-pointer px-4 py-2 rounded-xl border-2 ${step === 0 ? 'text-gray-300 border-transparent' : 'text-gray-500 border-gray-200 hover:text-black hover:bg-gray-50'}`}
          >
            <ArrowLeft className="w-5 h-5" /> Назад
          </button>

          <button
            onClick={handleNext}
            disabled={!canProceed() || saving}
            className={`px-8 py-3 rounded-full font-bold flex items-center gap-2 transition shadow-lg cursor-pointer
              ${canProceed() && !saving ? 'bg-brand-accent hover:bg-brand-accent-hover text-white shadow-brand-accent/20' : 'bg-gray-100 text-gray-400 shadow-none'}`}
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Сохраняется...
              </>
            ) : step === questions.length - 1 ? (
              'Сохранить изменения'
            ) : (
              <>Дальше <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
