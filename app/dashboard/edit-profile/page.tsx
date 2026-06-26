// app/dashboard/edit-profile/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ArrowRight, ArrowLeft, CheckCircle, User, MessageCircle, 
  Heart, MapPin, Flag, Star, Loader2, AlertTriangle
} from 'lucide-react'

const blocks = [
  { id: 'who', title: 'Кто вы', icon: User, color: 'text-brand-accent bg-brand-soft' },
  { id: 'voice', title: 'Ваш голос', icon: MessageCircle, color: 'text-brand-accent bg-brand-soft' },
  { id: 'client', title: 'Идеальный клиент', icon: Heart, color: 'text-brand-accent bg-brand-soft' },
  { id: 'current', title: 'Где вы сейчас', icon: MapPin, color: 'text-brand-accent bg-brand-soft' },
  { id: 'goal', title: 'Куда хотите', icon: Flag, color: 'text-brand-sage bg-brand-soft' },
  { id: 'final', title: 'Финальный штрих', icon: Star, color: 'text-brand-sage bg-brand-soft' },
]

const questions = [
  // --- БЛОК 1: КТО ВЫ ---
  {
    block: 0, key: 'full_name',
    title: 'Как вас зовут? И как клиенты к вам обращаются?',
    subtitle: 'Это влияет на тон ваших постов — будут они на "вы" или на "ты", формальные или дружеские.',
    type: 'text_and_single',
    placeholder: 'Например: Анна Петрова',
    options: ['По имени (Анна)', 'По имени-отчеству (Анна Сергеевна)', 'На «ты» по имени'],
    optionsKey: 'appeal'
  },
  {
    block: 0, key: 'approaches',
    title: 'В каком подходе вы работаете?',
    subtitle: 'Какой подход ОСНОВНОЙ — тот, через который вы смотрите на мир?',
    type: 'multi',
    options: [
      'КПТ (когнитивно-поведенческая)', 'Гештальт-терапия', 'Психоанализ',
      'Экзистенциальная терапия', 'Системная семейная терапия', 'Арт-терапия',
      'ACT (терапия принятия)', 'Схема-терапия', 'EMDR',
      'Телесно-ориентированная терапия', 'Эклектика / интегративный'
    ]
  },
  {
    block: 0, key: 'niches',
    title: 'С чем вы работаете чаще всего?',
    subtitle: 'А если бы вы могли работать ТОЛЬКО с одной проблемой до конца жизни — какая бы это была?',
    type: 'multi_and_text',
    options: [
      'Тревожные расстройства (ГТР, паника, ОКР)', 'Депрессия и апатия', 'Отношения и привязанность',
      'Травма и ПТСР', 'Выгорание и стресс', 'Самооценка и синдром самозванца',
      'Расстройства пищевого поведения', 'Зависимости', 'Горевание и утрата',
      'Детская/подростковая психология', 'Психосоматика'
    ],
    textKey: 'one_niche',
    textPlaceholder: 'Моя единственная проблема для работы — это... потому что...'
  },
  {
    block: 0, key: 'experience',
    title: 'Ваш опыт и путь в профессию',
    subtitle: 'Как вы пришли в психологию? Не биография, а момент.',
    type: 'single_and_text',
    options: ['Меньше года (только начинаю)', '1-3 года', '3-5 лет', '5-10 лет', '10+ лет'],
    textKey: 'path_to_profession',
    textPlaceholder: 'Например: Мне было 28, я сидела в офисе и поняла что ненавижу каждый понедельник...'
  },
  {
    block: 0, key: 'formats',
    title: 'Как вы работаете и стоимость сессии?',
    subtitle: 'Форматы работы и примерная цена.',
    type: 'multi_and_single',
    options: ['Индивидуально (взрослые)', 'Индивидуально (подростки)', 'Детская', 'Семейная/парная', 'Групповая', 'Онлайн', 'Очно', 'Супервизия'],
    singleKey: 'price',
    singleOptions: ['до 3000₽', '3000-5000₽', '5000-7000₽', '7000-10000₽', '10000₽+']
  },

  // --- БЛОК 2: ВАШ ГОЛОС ---
  {
    block: 1, key: 'tone_sliders',
    title: 'Какой у вас тон общения?',
    subtitle: 'Представьте что вы пишете пост.',
    type: 'sliders',
    sliders: [
      { key: 'tone_formal', left: 'Формальный', right: 'Разговорный' },
      { key: 'tone_serious', left: 'Серьёзный', right: 'С юмором' },
      { key: 'tone_cautious', left: 'Осторожный', right: 'Прямой' },
    ]
  },
  {
    block: 1, key: 'tone_verbal',
    title: 'Как вы обычно разговариваете с клиентами?',
    subtitle: 'Выберите самый близкий стиль',
    type: 'single',
    options: [
      'Как мудрый старший друг — тепло и с заботой',
      'Как учёный — чётко и с опорой на факты',
      'Как честный собеседник — прямо, без обёрток',
      'Как бережный проводник — мягко, без давления',
      'Как провокатор — через вопросы которые «щёлкают»'
    ],
  },
  {
    block: 1, key: 'values',
    title: 'Что для вас САМОЕ важное в работе?',
    subtitle: 'И что делаете не так, как другие? (допишите текстом)',
    type: 'multi_and_text',
    maxChoice: 3,
    options: [
      'Честность — говорить правду', 'Безоценочность', 'Научность — опора на факты',
      'Глубина — докопаться до сути', 'Бережность — не торопить', 'Практичность — дать инструменты',
      'Человечность — быть живым', 'Свобода выбора', 'Этичность'
    ],
    textKey: 'values_custom',
    textPlaceholder: 'Я делаю не так как другие вот что...'
  },
  {
    block: 1, key: 'anti_values',
    title: 'Что вас раздражает в индустрии?',
    subtitle: 'Ваши антиценности — золото для контента.',
    type: 'multi_and_text',
    options: [
      'Инфоцыганство («вылечу за 1 сессию»)', 'Попсовая психология («мысли позитивно»)',
      'Обесценивание («поговори с подругой»)', 'Гонка за подписчиками',
      'Нарушение этики', 'Диагнозы через экран', 'Шаблонные советы («подыши»)'
    ],
    textKey: 'anti_values_custom',
    textPlaceholder: 'Если бы я мог(ла) сказать ОДНУ вещь всем коллегам — я бы сказал(а)...'
  },
  {
    block: 1, key: 'superpowers',
    title: 'Что вам говорят клиенты? За что ценят?',
    subtitle: 'Ваши суперсилы в глазах клиентов',
    type: 'multi',
    options: [
      '«Вы объясняете сложное просто»', '«С вами я чувствую что меня слышат»',
      '«Вы даёте конкретные инструменты»', '«Вы задаёте вопросы от которых мурашки»',
      '«Вы не боитесь говорить прямо»', '«После вас я вижу всё по-другому»'
    ]
  },
  {
    block: 1, key: 'content_struggles',
    title: 'Что СЛОЖНО в ведении блога?',
    subtitle: 'Честно — это поможет подобрать инструменты.',
    type: 'multi',
    options: [
      'Не знаю о чём писать (ступор)', 'Пишу слишком сложно', 'Стыдно продвигаться',
      'Нет регулярности', 'Лайки есть, клиентов нет', 'Камера пугает', 'Не знаю позиционирования'
    ]
  },
  {
    block: 1, key: 'live_voice',
    title: 'Самый важный вопрос — ваш живой голос',
    subtitle: 'Представьте: вы на вечеринке. Друг: «А чем вы занимаетесь? И чем отличаетесь от других?»',
    type: 'textarea',
    placeholder: 'Говорите как есть. Без "оказание психологической помощи". Просто — кто вы и почему вам не всё равно.'
  },

  // --- БЛОК 3: ИДЕАЛЬНЫЙ КЛИЕНТ ---
  {
    block: 2, key: 'client_avatar',
    title: 'Кто ваш идеальный клиент?',
    subtitle: 'После сессии с которым вы думаете "вот ради этого я в профессии".',
    type: 'single_and_text',
    options: ['Женщина 25-35 лет', 'Женщина 35-45 лет', 'Мужчина 25-35 лет', 'Мужчина 35-45 лет', 'Подросток 14-18 лет', 'Пара', 'Семья'],
    textKey: 'client_job',
    textPlaceholder: 'Чем этот человек занимается? (Например: IT-менеджер, мама в декрете, предприниматель)'
  },
  {
    block: 2, key: 'client_pain_phrases',
    title: 'Как ОН описывает свою боль?',
    subtitle: 'Не диагноз, а 2-3 прямые фразы, которые вы слышите на первых сессиях.',
    type: 'textarea',
    placeholder: 'Например: "Я устала быть сильной", "Мозг не выключается", "Мы с мужем живём как соседи"...'
  },
  {
    block: 2, key: 'client_tried',
    title: 'Что клиент уже пробовал ДО вас?',
    subtitle: 'И что ему мешает прийти (главный страх)?',
    type: 'multi',
    options: [
      'Читал книги', 'Смотрел YouTube', 'Другой психолог', 'Таблетки', 'Пытался "не думать"', 'Медитации/Йога', 'Обращается впервые'
    ]
  },
  {
    block: 2, key: 'client_fear',
    title: 'Какой у него главный страх перед терапией?',
    subtitle: 'Что мешает записаться?',
    type: 'multi',
    options: [
      '«Другим хуже»', '«Психолог для сумасшедших»', '«Дорого»', '«Не поможет»', '«Копаться в прошлом страшно»', '«Стыдно»'
    ]
  },
  {
    block: 2, key: 'client_result',
    title: 'Результат работы. Что он ДЕЛАЕТ по-другому?',
    subtitle: 'Не «становится лучше», а конкретика.',
    type: 'textarea',
    placeholder: 'Например: "Перестала звонить бывшему в 3 часа ночи", "Впервые взял отпуск и не проверял почту"...'
  },

  // --- БЛОК 4: ГДЕ ВЫ СЕЙЧАС ---
  {
    block: 3, key: 'platforms',
    title: 'Где ведёте (или хотите) блог?',
    subtitle: 'И сколько у вас подписчиков сегодня?',
    type: 'multi_and_single',
    options: ['Instagram', 'Telegram', 'Пока нигде'],
    singleKey: 'current_followers',
    singleOptions: ['0', 'до 500', '500-2000', '2000-5000', '5000+']
  },
  {
    block: 3, key: 'client_source',
    title: 'Откуда сейчас приходят клиенты?',
    subtitle: 'И сколько их в месяц?',
    type: 'multi_and_single',
    options: ['Сарафан', 'Соцсети', 'Агрегаторы', 'Реклама', 'Рекомендации', 'Пока нет'],
    singleKey: 'current_clients',
    singleOptions: ['0-3', '3-8', '8-15', '15-25', '25+']
  },
  {
    block: 3, key: 'content_pain',
    title: 'ОДНА главная проблема с контентом прямо сейчас',
    subtitle: 'Опишите подробнее как это проявляется в жизни.',
    type: 'single_and_text',
    options: [
      'Не знаю о чём писать', 'Никто не читает', 'Забрасываю', 'Пишу как учебник', 'Стыдно', 'Нет времени'
    ],
    textKey: 'content_pain_detail',
    textPlaceholder: 'Например: Я могу сидеть перед пустым листом 3 часа, потом пишу сухой текст, выкладываю — и 2 лайка...'
  },

  // --- БЛОК 5: КУДА ХОТИТЕ ---
  {
    block: 4, key: 'desired_clients',
    title: 'Сколько клиентов вы ХОТИТЕ?',
    subtitle: 'Ваша цель',
    type: 'single',
    options: ['5-10/мес (начать поток)', '10-20 (стабильно)', '20-30 (полная запись)', 'Повысить чек (запись полная)']
  },
  {
    block: 4, key: 'goal_3_months',
    title: 'Цель на 3 месяца и время на контент',
    subtitle: 'Выберите главную цель и сколько ресурса есть.',
    type: 'single_and_single',
    options1: [
      'Первые клиенты из соцсетей', 'Увеличить поток в 2 раза', 'Выйти на полную запись',
      'Запустить курс/марафон', 'Узнаваемость', 'Супервизия'
    ],
    options2: ['15-30 минут в день', '30-60 минут в день', '1-2 часа', 'Один день в неделю (3+ ч)'],
    single2Key: 'time_available'
  },
  {
    block: 4, key: 'video_attitude',
    title: 'Как относитесь к видео (Reels / Shorts)?',
    subtitle: 'Мы не будем заставлять.',
    type: 'single',
    options: [
      'Нормально — нужны скрипты', 'Готов(а), но нужен телесуфлер', 'Пугает — но попробую', 'Категорически нет (только текст)'
    ]
  },
  {
    block: 4, key: 'dream_blog',
    title: 'Представьте идеальную картину через год.',
    subtitle: 'Что вы чувствуете открывая директ утром?',
    type: 'textarea',
    placeholder: 'Мечтайте конкретно: "открываю директ — 3 заявки, все по моей специализации, я выбираю с кем работать..."'
  },

  // --- БЛОК 6: ФИНАЛЬНЫЙ ШТРИХ ---
  {
    block: 5, key: 'idols',
    title: 'Чей контент вам нравится?',
    subtitle: 'Есть психологи, которыми восхищаетесь?',
    type: 'text_and_multi',
    placeholder: 'Имена или ссылки (необязательно)',
    options: ['Пишут просто о сложном', 'Быть собой', 'Красивое оформление', 'Глубокие тексты', 'Комьюнити', 'Нативные продажи'],
    optionsKey: 'idols_why'
  },
  {
    block: 5, key: 'something_else',
    title: 'Что-то ещё?',
    subtitle: 'Необычный опыт, хобби, нестандартный путь?',
    type: 'textarea',
    placeholder: 'Это может стать вашей отстройкой. Психолог-скалолаз. Психолог-бывший-бизнесмен...'
  }
]

export default function EditProfile() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()

  // Загрузка существующего профиля
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
        router.push('/onboarding')
        return
      }

      // Заполняем answers из профиля
      setAnswers({
        full_name: profile.full_name || '',
        appeal: profile.appeal || '',
        approaches: profile.approaches || [],
        niches: profile.niches || [],
        one_niche: profile.one_niche || '',
        experience: profile.experience || '',
        path_to_profession: profile.path_to_profession || '',
        formats: profile.formats || [],
        price: profile.price || '',
        tone_formal: profile.tone_formal || 50,
        tone_serious: profile.tone_serious || 50,
        tone_cautious: profile.tone_cautious || 50,
        tone_verbal: profile.tone_verbal || '',
        values: profile.values || [],
        values_custom: profile.values_custom || '',
        anti_values: profile.anti_values || [],
        anti_values_custom: profile.anti_values_custom || '',
        superpowers: profile.superpowers || [],
        content_struggles: profile.content_struggles || [],
        live_voice: profile.live_voice || '',
        client_avatar: profile.client_avatar || '',
        client_job: profile.client_job || '',
        client_pain_phrases: profile.client_pain_phrases || '',
        client_tried: profile.client_tried || [],
        client_fear: profile.client_fear || [],
        client_result: profile.client_result || '',
        platforms: profile.platforms || [],
        current_followers: profile.current_followers || '',
        current_clients: profile.current_clients || '',
        client_source: profile.client_source || [],
        content_pain: profile.content_pain || '',
        content_pain_detail: profile.content_pain_detail || '',
        desired_clients: profile.desired_clients || '',
        goal_3_months: profile.goal_3_months || '',
        time_available: profile.time_available || '',
        video_attitude: profile.video_attitude || '',
        dream_blog: profile.dream_blog || '',
        idols: profile.idols || '',
        idols_why: profile.idols_why || [],
        something_else: profile.something_else || '',
      })
      setLoading(false)
    }
    loadProfile()
  }, [router])

  const currentQuestion = questions[step]
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
    const single2Key = (currentQuestion as any).single2Key

    if (type === 'text' || type === 'textarea') return (answers[key]?.length > 2)
    if (type === 'single') return !!answers[key]
    if (type === 'multi') return (answers[key]?.length > 0)
    if (type === 'text_and_single') return (answers[key]?.length > 2 && !!answers[optionsKey])
    if (type === 'multi_and_text') return (answers[key]?.length > 0 && answers[textKey]?.length > 2)
    if (type === 'single_and_text') return (answers[key] && answers[textKey]?.length > 2)
    if (type === 'multi_and_single') return (answers[key]?.length > 0 && !!answers[singleKey])
    if (type === 'single_and_single') return (answers[key] && !!answers[single2Key])
    if (type === 'text_and_multi') return true
    if (type === 'sliders') return true
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

    const profileData = {
      full_name: answers.full_name || '',
      appeal: answers.appeal || '',
      approaches: answers.approaches || [],
      niches: answers.niches || [],
      one_niche: answers.one_niche || '',
      experience: answers.experience || '',
      path_to_profession: answers.path_to_profession || '',
      formats: answers.formats || [],
      price: answers.price || '',
      tone_formal: answers.tone_formal || 50,
      tone_serious: answers.tone_serious || 50,
      tone_cautious: answers.tone_cautious || 50,
      tone_verbal: answers.tone_verbal || '',
      values: answers.values || [],
      values_custom: answers.values_custom || '',
      anti_values: answers.anti_values || [],
      anti_values_custom: answers.anti_values_custom || '',
      superpowers: answers.superpowers || [],
      content_struggles: answers.content_struggles || [],
      live_voice: answers.live_voice || '',
      client_avatar: answers.client_avatar || '',
      client_job: answers.client_job || '',
      client_pain_phrases: answers.client_pain_phrases || '',
      client_tried: answers.client_tried || [],
      client_fear: answers.client_fear || [],
      client_result: answers.client_result || '',
      platforms: answers.platforms || [],
      current_followers: answers.current_followers || '',
      current_clients: answers.current_clients || '',
      client_source: answers.client_source || [],
      content_pain: answers.content_pain || '',
      content_pain_detail: answers.content_pain_detail || '',
      desired_clients: answers.desired_clients || '',
      goal_3_months: answers.goal_3_months || '',
      time_available: answers.time_available || '',
      video_attitude: answers.video_attitude || '',
      dream_blog: answers.dream_blog || '',
      idols: answers.idols || '',
      idols_why: answers.idols_why || [],
      something_else: answers.something_else || '',
    }

    const { error } = await supabase
      .from('onboarding_profiles')
      .update(profileData)
      .eq('user_id', userId)

    if (error) {
      console.error('Update error:', error)
      alert('Ошибка при сохранении')
      setSaving(false)
      return
    }

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
          <h1 className="text-3xl font-bold text-brand-text mb-4">✅ Профиль обновлён!</h1>
          <p className="text-brand-text-secondary mb-6 leading-relaxed">
            Изменения сохранены. Рекомендуем перегенерировать паспорт бренда, чтобы он отражал новые данные.
          </p>
          
          <div className="bg-brand-soft border border-brand-border-soft rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-brand-sage shrink-0 mt-0.5" />
            <p className="text-sm text-brand-text text-left">
              Старый паспорт бренда был создан на основе предыдущих данных. 
              Нажмите «Перегенерировать» на странице паспорта.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => router.push('/dashboard/brand-passport')} 
              className="w-full py-4 bg-brand-accent hover:bg-brand-accent-hover text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              Перегенерировать паспорт <ArrowRight className="w-5 h-5" />
            </button>
                       <button 
              onClick={() => router.push('/dashboard')} 
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-brand-text rounded-xl font-medium transition cursor-pointer"
            >
              Вернуться в дашборд
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
                onClick={() => router.push('/dashboard')}
                className="text-gray-400 hover:text-gray-600 text-sm"
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
            <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-3 py-1 rounded-full text-sm font-medium mb-4">
              ✏️ Режим редактирования
            </div>

            <h2 className="text-2xl md:text-4xl font-extrabold text-brand-text mb-4 leading-tight">
              {q.title}
            </h2>
            {q.subtitle && <p className="text-lg text-brand-text-secondary mb-10">{q.subtitle}</p>}

            <div className="space-y-6">

              {/* 1. Текстовый ввод */}
              {(q.type === 'text' || q.type === 'textarea' || q.type === 'text_and_single' || q.type === 'text_and_multi') && (
                <div>
                  {q.type.includes('textarea') ? (
                    <textarea
                      value={answers[q.key] || ''} 
                      onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })}
                      placeholder={q.placeholder} 
                      rows={3}
                      className="w-full p-5 rounded-2xl border-2 border-gray-200 focus:border-brand-accent outline-none text-lg resize-none"
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
              {(q.type === 'single' || q.type === 'multi' || q.type === 'multi_and_text' || q.type === 'single_and_text' || q.type === 'multi_and_single' || q.type === 'single_and_single') && ((q as any).options || (q as any).options1) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {((q as any).options1 || (q as any).options || []).map((opt: string) => {
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

              {/* 3. Дополнительный textarea */}
              {((q as any).textKey) && (
                <div className="pt-6 mt-6 border-t border-gray-100">
                  <p className="font-bold text-brand-text mb-3 text-lg">
                    {q.key === 'niches' && 'А если бы можно было выбрать только одну проблему — с чем бы вы работали и почему именно с этим? 💭'}
                    {q.key === 'experience' && 'Расскажите, как всё началось. Что в какой-то момент щёлкнуло и вы поняли — хочу в психологию? 🤔'}
                    {q.key === 'values' && 'А вот что интересно — чем вы отличаетесь от коллег? Что делаете по-своему? ✨'}
                    {q.key === 'anti_values' && 'Представьте, что вас слышат все коллеги разом. Что бы вы им сказали? Без цензуры 😄'}
                    {q.key === 'client_avatar' && 'Расскажите про этого человека — кто он, чем занимается, как живёт? 🙂'}
                    {q.key === 'content_pain' && 'Опишите как это обычно происходит. Вот вы садитесь писать пост — и что дальше? 👀'}
                    {!['niches', 'experience', 'values', 'anti_values', 'client_avatar', 'content_pain'].includes(q.key) && 'Расскажите подробнее 🙂'}
                  </p>
                  <textarea
                    value={answers[(q as any).textKey] || ''} 
                    onChange={e => setAnswers({ ...answers, [(q as any).textKey]: e.target.value })}
                    placeholder={(q as any).textPlaceholder} 
                    rows={3}
                    className="w-full p-5 rounded-2xl border-2 border-gray-200 focus:border-brand-accent outline-none text-lg resize-none"
                  />
                </div>
              )}

              {/* 4. Дополнительная сетка опций */}
              {((q as any).optionsKey || (q as any).singleKey || (q as any).single2Key) && (
                <div className="pt-6 mt-6 border-t border-gray-100">
                  <p className="font-bold text-brand-text mb-4 text-lg">
                    {q.type === 'text_and_single' ? 'И как нам к вам обращаться?' :
                      q.type === 'multi_and_single' && (q as any).singleKey === 'price' ? 'А примерная стоимость вашей сессии?' :
                      q.type === 'multi_and_single' && (q as any).singleKey === 'current_followers' ? 'И сколько сейчас подписчиков?' :
                      q.type === 'multi_and_single' && (q as any).singleKey === 'current_clients' ? 'И сколько клиентов в месяц?' :
                      (q as any).single2Key === 'time_available' ? 'Сколько времени готовы уделять блогу?' :
                      'Уточните:'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {((q as any).singleOptions || (q as any).options2 || (q as any).options || []).map((opt: string) => {
                      const tgtKey = (q as any).optionsKey || (q as any).singleKey || (q as any).single2Key!
                      const isMulti = q.type.includes('multi') && !!(q as any).optionsKey
                      const isSelected = isMulti ? (answers[tgtKey] || []).includes(opt) : answers[tgtKey] === opt

                      return (
                        <button
                          key={opt}
                          onClick={() => isMulti ? toggleArrayItem(tgtKey, opt) : setAnswers({ ...answers, [tgtKey]: opt })}
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

              {/* 5. Слайдеры */}
              {q.type === 'sliders' && (q as any).sliders && (
                <div className="space-y-10 bg-white p-8 rounded-3xl border border-gray-100 mt-6 shadow-sm">
                  {(q as any).sliders.map((slider: any) => (
                    <div key={slider.key}>
                      <div className="flex justify-between text-sm font-bold text-gray-400 mb-4 px-2 uppercase tracking-wide">
                        <span className={answers[slider.key] < 50 ? 'text-brand-accent' : ''}>{slider.left}</span>
                        <span className={answers[slider.key] > 50 ? 'text-brand-accent' : ''}>{slider.right}</span>
                      </div>
                      <input
                        type="range" min="0" max="100"
                        value={answers[slider.key] || 50}
                        onChange={e => setAnswers({ ...answers, [slider.key]: Number(e.target.value) })}
                        className="w-full accent-brand-accent h-2 bg-brand-border rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              )}

            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* FOOTER НАВИГАЦИЯ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-brand-border py-4 px-6 z-50">
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
                <Loader2 className="w-5 h-5 animate-spin" /> Сохраняем...
              </>
            ) : step === questions.length - 1 ? (
              'Сохранить изменения ✅'
            ) : (
              <>Далее <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
