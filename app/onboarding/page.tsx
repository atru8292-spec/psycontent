'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ArrowRight, ArrowLeft, CheckCircle, User, MessageCircle, Heart, MapPin, Flag, Star
} from 'lucide-react'
import Squiggle from '@/components/Squiggle'

// БЛОКИ РАСПАКОВКИ
const blocks = [
  { id: 'who', title: 'Кто вы', icon: User, color: 'text-brand-accent bg-brand-soft' },
  { id: 'voice', title: 'Ваш голос', icon: MessageCircle, color: 'text-brand-accent bg-brand-soft' },
  { id: 'client', title: 'Идеальный клиент', icon: Heart, color: 'text-brand-accent bg-brand-soft' },
  { id: 'current', title: 'Где вы сейчас', icon: MapPin, color: 'text-brand-sage bg-brand-bg' },
  { id: 'goal', title: 'Куда хотите', icon: Flag, color: 'text-brand-sage bg-brand-bg' },
  { id: 'final', title: 'Финальный штрих', icon: Star, color: 'text-brand-accent bg-brand-soft' },
]

// ВОПРОСЫ
const questions = [
  // --- БЛОК 1: Кто вы ---
  {
    block: 0,
    key: 'full_name',
    title: 'Как вас зовут? И как клиенты к вам обращаются?',
    subtitle: 'Это влияет на тон ваших постов, будут они на "вы" или на "ты", формальные или дружеские.',
    type: 'text_and_single',
    placeholder: 'Например: Анна Петрова',
    options: ['По имени (Анна)', 'По имени-отчеству (Анна Сергеевна)', 'На «ты» по имени'],
    optionsKey: 'appeal',
    secondLabel: 'Как к вам обращаться?'
  },
  {
    block: 0,
    key: 'approaches',
    title: 'В каком подходе вы работаете?',
    subtitle: 'Какой подход ОСНОВНОЙ, тот, через который вы смотрите на мир?',
    type: 'multi',
    options: [
      'КПТ (когнитивно-поведенческая)', 'Гештальт-терапия', 'Психоанализ',
      'Экзистенциальная терапия', 'Системная семейная терапия', 'Арт-терапия',
      'ACT (терапия принятия)', 'Схема-терапия', 'EMDR',
      'Телесно-ориентированная терапия', 'Эклектика / интегративный'
    ]
  },
  {
    block: 0,
    key: 'niches',
    title: 'С чем вы работаете чаще всего?',
    subtitle: 'А если бы вы могли работать ТОЛЬКО с одной проблемой до конца жизни, какая бы это была?',
    type: 'multi_and_text',
    options: [
      'Тревожные расстройства (ГТР, паника, ОКР)', 'Депрессия и апатия', 'Отношения и привязанность',
      'Травма и ПТСР', 'Выгорание и стресс', 'Самооценка и синдром самозванца',
      'Расстройства пищевого поведения', 'Зависимости', 'Горевание и утрата',
      'Детская/подростковая психология', 'Психосоматика'
    ],
    textKey: 'one_niche',
    textPlaceholder: 'Моя единственная проблема для работы, это... потому что...'
  },
  {
    block: 0,
    key: 'experience',
    title: 'Ваш опыт и путь в профессию',
    subtitle: 'Как вы пришли в психологию? Не биография, а момент.',
    type: 'single_and_text',
    options: ['Меньше года (только начинаю)', '1-3 года', '3-5 лет', '5-10 лет', '10+ лет'],
    textKey: 'path_to_profession',
    textPlaceholder: 'Например: Мне было 28, я сидела в офисе и поняла что ненавижу каждый понедельник...'
  },
  {
    block: 0,
    key: 'formats',
    title: 'В каких форматах вы работаете?',
    subtitle: 'Выберите все подходящие форматы и укажите стоимость сессии.',
    type: 'multi_and_single',
    options: ['Индивидуально (взрослые)', 'Индивидуально (подростки)', 'Детская', 'Семейная/парная', 'Групповая', 'Онлайн', 'Очно', 'Супервизия'],
    singleKey: 'price',
    singleOptions: ['до 3000₽', '3000-5000₽', '5000-7000₽', '7000-10000₽', '10000₽+'],
    secondLabel: 'Примерная стоимость вашей сессии:'
  },

  // --- БЛОК 2: Ваш голос ---
  {
    block: 1,
    key: 'tone_sliders',
    title: 'Какой у вас тон общения?',
    subtitle: 'Представьте что вы пишете пост. Двигайте ползунки.',
    type: 'sliders',
    sliders: [
      { key: 'tone_formal', left: 'Формальный', right: 'Разговорный' },
      { key: 'tone_serious', left: 'Серьезный', right: 'С юмором' },
      { key: 'tone_cautious', left: 'Осторожный', right: 'Прямой' },
    ]
  },
  {
    block: 1,
    key: 'tone_verbal',
    title: 'Как вы обычно разговариваете с клиентами?',
    subtitle: 'Выберите самый близкий стиль.',
    type: 'single',
    options: [
      'Как мудрый старший друг, тепло и с заботой',
      'Как ученый, четко и с опорой на факты',
      'Как честный собеседник, прямо, без оберток',
      'Как бережный проводник, мягко, без давления',
      'Как провокатор, через вопросы которые «щелкают»'
    ],
  },
  {
    block: 1,
    key: 'values',
    title: 'Что для вас САМОЕ важное в работе?',
    subtitle: 'Выберите до 3-х ценностей и допишите, что вы делаете не так, как другие.',
    type: 'multi_and_text',
    maxChoice: 3,
    options: [
      'Честность, говорить правду', 'Безоценочность', 'Научность, опора на факты',
      'Глубина, докопаться до сути', 'Бережность, не торопить', 'Практичность, дать инструменты',
      'Человечность, быть живым', 'Свобода выбора', 'Этичность'
    ],
    textKey: 'values_custom',
    textPlaceholder: 'Я делаю не так как другие вот что...'
  },
  {
    block: 1,
    key: 'anti_values',
    title: 'Что вас раздражает в индустрии?',
    subtitle: 'Ваши антиценности, золото для контента.',
    type: 'multi_and_text',
    options: [
      'Инфоцыганство («вылечу за 1 сессию»)', 'Попсовая психология («мысли позитивно»)',
      'Обесценивание («поговори с подругой»)', 'Гонка за подписчиками',
      'Нарушение этики', 'Диагнозы через экран', 'Шаблонные советы («подыши»)'
    ],
    textKey: 'anti_values_custom',
    textPlaceholder: 'Если бы я мог(ла) сказать ОДНУ вещь всем коллегам, я бы сказал(а)...'
  },
  {
    block: 1,
    key: 'superpowers',
    title: 'Что вам говорят клиенты? За что ценят?',
    subtitle: 'Ваши суперсилы в глазах клиентов.',
    type: 'multi',
    options: [
      '«Вы объясняете сложное просто»', '«С вами я чувствую что меня слышат»',
      '«Вы даете конкретные инструменты»', '«Вы задаете вопросы от которых мурашки»',
      '«Вы не боитесь говорить прямо»', '«После вас я вижу все по-другому»'
    ]
  },
  {
    block: 1,
    key: 'content_struggles',
    title: 'Что СЛОЖНО в ведении блога?',
    subtitle: 'Честно, это поможет нам подобрать правильные инструменты.',
    type: 'multi',
    options: [
      'Не знаю о чем писать (ступор)', 'Пишу слишком сложно', 'Стыдно продвигаться',
      'Нет регулярности', 'Лайки есть, клиентов нет', 'Камера пугает', 'Не знаю позиционирования'
    ]
  },
  {
    block: 1,
    key: 'live_voice',
    title: 'Самый важный вопрос, ваш живой голос',
    subtitle: 'Представьте: вы на вечеринке. Друг спрашивает: «А чем ты занимаешься? И чем отличаешься от других психологов?»',
    type: 'textarea',
    placeholder: 'Говорите как есть. Без "оказание психологической помощи". Просто, кто вы и почему вам не все равно. Например: "Я работаю с людьми которые выгорели. Знаешь, те которые на работе, звезды..."'
  },

  // --- БЛОК 3: Идеальный клиент ---
  {
    block: 2,
    key: 'client_avatar',
    title: 'Кто ваш идеальный клиент?',
    subtitle: 'Тот, после сессии с которым вы думаете: «вот ради этого я в профессии».',
    type: 'single_and_text',
    options: ['Женщина 25-35 лет', 'Женщина 35-45 лет', 'Мужчина 25-35 лет', 'Мужчина 35-45 лет', 'Подросток 14-18 лет', 'Пара', 'Семья'],
    textKey: 'client_job',
    textPlaceholder: 'Чем этот человек занимается? (Например: IT-менеджер, мама в декрете, предприниматель)'
  },
  {
    block: 2,
    key: 'client_pain_phrases',
    title: 'Как ОН описывает свою боль?',
    subtitle: 'Не диагноз, а 2-3 прямые фразы, которые вы слышите на первых сессиях.',
    type: 'textarea',
    placeholder: 'Например: "Я устала быть сильной", "Мозг не выключается", "Мы с мужем живем как соседи"...'
  },
  {
    block: 2,
    key: 'client_tried',
    title: 'Что клиент уже пробовал ДО вас?',
    subtitle: 'Что он делал, чтобы справиться самостоятельно?',
    type: 'multi',
    options: [
      'Читал книги', 'Смотрел YouTube', 'Другой психолог', 'Таблетки', 'Пытался "не думать"', 'Медитации/Йога', 'Обращается впервые'
    ]
  },
  {
    block: 2,
    key: 'client_fear',
    title: 'Какой у него главный страх перед терапией?',
    subtitle: 'Что мешает записаться?',
    type: 'multi',
    options: [
      '«Другим хуже, мне не положено»', '«Психолог, это для сумасшедших»', '«Дорого»', '«Не поможет»', '«Копаться в прошлом страшно»', '«Стыдно рассказывать»'
    ]
  },
  {
    block: 2,
    key: 'client_result',
    title: 'Результат работы. Что клиент ДЕЛАЕТ по-другому?',
    subtitle: 'Не «становится лучше», а конкретное изменение в поведении.',
    type: 'textarea',
    placeholder: 'Например: "Перестала звонить бывшему в 3 часа ночи", "Впервые взял отпуск и не проверял почту", "Сказала маме «нет» и мир не рухнул"...'
  },

  // --- БЛОК 4: Где вы сейчас ---
  {
    block: 3,
    key: 'platforms',
    title: 'Где вы ведете (или хотите вести) блог?',
    subtitle: 'Выберите платформы и укажите текущее количество подписчиков.',
    type: 'multi_and_single',
    options: ['Instagram', 'Telegram', 'Пока нигде'],
    singleKey: 'current_followers',
    singleOptions: ['0', 'до 500', '500-2000', '2000-5000', '5000+'],
    secondLabel: 'Сколько у вас подписчиков сейчас?'
  },
  {
    block: 3,
    key: 'client_source',
    title: 'Откуда сейчас приходят клиенты?',
    subtitle: 'Выберите источники и укажите примерное количество клиентов в месяц.',
    type: 'multi_and_single',
    options: ['Сарафан', 'Соцсети', 'Агрегаторы (Профи.ру и т.д.)', 'Реклама', 'Рекомендации коллег', 'Пока нет клиентов'],
    singleKey: 'current_clients',
    singleOptions: ['0-3', '3-8', '8-15', '15-25', '25+'],
    secondLabel: 'Сколько клиентов в месяц?'
  },
  {
    block: 3,
    key: 'content_pain',
    title: 'ОДНА главная проблема с контентом прямо сейчас?',
    subtitle: 'Выберите и опишите подробнее, как это проявляется.',
    type: 'single_and_text',
    options: [
      'Не знаю о чем писать', 'Никто не читает', 'Забрасываю через неделю', 'Пишу как учебник', 'Стыдно себя продвигать', 'Нет времени'
    ],
    textKey: 'content_pain_detail',
    textPlaceholder: 'Например: Я могу сидеть перед пустым листом 3 часа, потом пишу сухой текст, выкладываю, и 2 лайка от мамы...'
  },

  // --- БЛОК 5: Куда хотите ---
  {
    block: 4,
    key: 'desired_clients',
    title: 'Сколько клиентов вы ХОТИТЕ в месяц?',
    subtitle: 'Ваша цель по загрузке.',
    type: 'single',
    options: ['5-10 (начать стабильный поток)', '10-20 (стабильная практика)', '20-30 (полная запись)', 'Повысить чек (запись уже полная)']
  },
  {
    block: 4,
    key: 'goal_3_months',
    title: 'Главная цель на 3 месяца',
    subtitle: 'Выберите цель и укажите сколько времени готовы тратить на контент.',
    type: 'single_and_single',
    options1: [
      'Первые клиенты из соцсетей', 'Увеличить поток в 2 раза', 'Выйти на полную запись',
      'Запустить курс/марафон', 'Стать узнаваемым в нише', 'Начать вести супервизии'
    ],
    options2: ['15-30 минут в день', '30-60 минут в день', '1-2 часа в день', 'Один день в неделю (3+ часа)'],
    single2Key: 'time_available',
    secondLabel: 'Сколько времени готовы тратить на контент?'
  },
  {
    block: 4,
    key: 'video_attitude',
    title: 'Как относитесь к видео (Reels / Shorts)?',
    subtitle: 'Мы не будем заставлять, просто хотим понять.',
    type: 'single',
    options: [
      'Нормально, нужны скрипты', 'Готов(а), но нужен телесуфлер', 'Пугает, но готов(а) попробовать', 'Категорически нет, только текст и картинки'
    ]
  },
  {
    block: 4,
    key: 'dream_blog',
    title: 'Представьте идеальную картину через год.',
    subtitle: 'Что вы чувствуете, открывая телефон утром?',
    type: 'textarea',
    placeholder: 'Мечтайте конкретно: "Открываю директ, 3 заявки на консультацию, все по моей теме, я выбираю с кем работать. Подписчиков 5000, и каждый пост собирает живые комментарии..."'
  },

  // --- БЛОК 6: Финальный штрих ---
  {
    block: 5,
    key: 'idols',
    title: 'Чей контент вам нравится?',
    subtitle: 'Есть психологи или блогеры, которыми восхищаетесь? И что именно нравится?',
    type: 'text_and_multi',
    placeholder: 'Имена или ссылки (необязательно)',
    options: ['Пишут просто о сложном', 'Не боятся быть собой', 'Красивое оформление', 'Глубокие тексты', 'Живое комьюнити', 'Мягкие продажи'],
    optionsKey: 'idols_why',
    secondLabel: 'Что именно вам нравится в их контенте?'
  },
  {
    block: 5,
    key: 'something_else',
    title: 'Что-то еще, что мы должны знать?',
    subtitle: 'Необычный опыт, хобби, нестандартный путь, все что делает вас уникальным.',
    type: 'textarea',
    placeholder: 'Это может стать вашей отстройкой. Психолог-скалолаз. Психолог который 10 лет работал в бизнесе. Психолог-мама четверых...'
  }
]


// ═══════ ДЕМО ДАННЫЕ ═══════
const DEMO_DATA: Record<string, any> = {
  full_name: "Анна Соколова",
  appeal: "По имени (Анна)",
  approaches: ["Гештальт-терапия", "ACT (терапия принятия)"],
  niches: ["Тревожные расстройства (ГТР, паника, ОКР)", "Выгорание и стресс", "Самооценка и синдром самозванца"],
  one_niche: "Тревога, потому что за ней почти всегда прячется что-то важное про то как человек живет. Это не симптом, это сигнал.",
  experience: "5-10 лет",
  path_to_profession: "Мне было 27, я работала маркетологом в крупном агентстве. Все было хорошо, зарплата, карьера, путешествия. Только по ночам я лежала и думала: зачем это все. Я пошла к психологу и после третьей сессии поняла, вот что хочу делать.",
  formats: ["Индивидуально (взрослые)", "Онлайн"],
  price: "5000-7000₽",
  tone_formal: 30,
  tone_serious: 40,
  tone_cautious: 70,
  tone_verbal: "Как честный собеседник, прямо, без оберток",
  values: ["Честность, говорить правду", "Глубина, докопаться до сути", "Человечность, быть живым"],
  values_custom: "Я не делаю вид что у меня все под контролем. Иногда говорю клиентам что сама прохожу терапию. Это не слабость, это честность.",
  anti_values: ["Попсовая психология («мысли позитивно»)", "Инфоцыганство («вылечу за 1 сессию»)", "Шаблонные советы («подыши»)"],
  anti_values_custom: "Перестаньте продавать людям быстрые результаты. Психика, не зуб вылечить. Кто обещает избавить от тревоги навсегда за 8 сессий, либо не понимает что делает, либо врет.",
  superpowers: ["«Вы объясняете сложное просто»", "«Вы задаете вопросы от которых мурашки»", "«После вас я вижу все по-другому»"],
  content_struggles: ["Стыдно продвигаться", "Нет регулярности", "Лайки есть, клиентов нет"],
  live_voice: "Я работаю с людьми которые устали от своей тревоги. Не с теми кто просто немного нервничает перед презентацией, а с теми, кто просыпается в 4 утра и час лежит с мыслью что если все рухнет. Гештальт для меня это не техника, это способ слышать человека. Я не лечу, я помогаю разобраться.",
  client_avatar: "Женщина 35-45 лет",
  client_job: "Чаще всего, умная, достигающая женщина. IT, маркетинг, управление. Снаружи, успешная. Внутри, постоянное ощущение что вот-вот облажается.",
  client_pain_phrases: "«Я устала контролировать все»\n«Мозг не выключается даже в отпуске»\n«Не понимаю почему мне плохо, объективно же все хорошо»",
  client_tried: ["Читал книги", "Смотрел YouTube", "Медитации/Йога"],
  client_fear: ["«Другим хуже, мне не положено»", "«Копаться в прошлом страшно»"],
  client_result: "Клиентка перестала извиняться за каждое свое слово на работе. Другая впервые сказала маме «нет», и не поехала на дачу когда не хотела. Один мужчина взял отпуск и не открыл ноутбук ни разу.",
  platforms: ["Instagram", "Telegram"],
  current_followers: "500-2000",
  current_clients: "3-8",
  client_source: ["Сарафан", "Соцсети"],
  content_pain: "Пишу раз в месяц и теряю импульс",
  content_pain_detail: "Садлюсь писать, и все кажется банальным. Ощущение что это уже тысячу раз написали до меня.",
  desired_clients: "15-25",
  goal_3_months: "Хочу чтобы блог работал без меня, писать пост и получать запросы. Сейчас это не связано вообще.",
  time_available: "3-5 часов в неделю",
  video_attitude: "Сторис могу, reels пугают",
  dream_blog: "Хочу чтобы люди читали и думали она про меня написала. Не массовый блог, а такой где каждый пост что-то меняет в голове.",
  idols: "Адриана Имж, Нурия Гатауллина",
  idols_why: ["Пишут просто о сложном", "Не боятся быть собой"],
  something_else: "",
}

export default function Onboarding() {
  const [step, setStep] = useState(-1)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [alreadyHasProfile, setAlreadyHasProfile] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('onboarding_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      // Анти-цикл: профиль уже есть → НЕ делаем слепой авто-push в дашборд
      // (иначе при ложном редиректе сюда получается пинг-понг онбординг↔кабинет).
      // Показываем экран с ручным переходом — авто-редиректа нет, цикл невозможен.
      if (data) setAlreadyHasProfile(true)
    }
    checkUser()
  }, [router])


  const handleDemoFill = async () => {
    if (!userId) return
    setLoading(true)
    const profileData = {
      user_id: userId,
      ...DEMO_DATA,
    }
    const { error } = await supabase
      .from('onboarding_profiles')
      .upsert(profileData, { onConflict: 'user_id' })
    if (error) {
      alert('Ошибка: ' + error.message)
      setLoading(false)
      return
    }
    setCompleted(true)
    setLoading(false)
  }

  const handleStart = () => setStep(0)

  const currentQuestion = step >= 0 ? questions[step] : null
  const currentBlock = currentQuestion ? blocks[currentQuestion.block] : null
  const progress = ((step) / questions.length) * 100

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
    if (!currentQuestion) return false
    const { key, type, textKey, singleKey, optionsKey, single2Key } = currentQuestion

    if (type === 'text' || type === 'textarea') return (answers[key]?.length > 2)
    if (type === 'single') return !!answers[key]
    if (type === 'multi') return (answers[key]?.length > 0)

    if (type === 'text_and_single') return (answers[key]?.length > 2 && !!answers[optionsKey!])
    if (type === 'multi_and_text') return (answers[key]?.length > 0 && answers[textKey!]?.length > 2)
    if (type === 'single_and_text') return (answers[key] && answers[textKey!]?.length > 2)
    if (type === 'multi_and_single') return (answers[key]?.length > 0 && !!answers[singleKey!])
    if (type === 'single_and_single') return (answers[key] && !!answers[single2Key!])
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
    setLoading(true)

    const t_form = answers.tone_formal || 50
    const t_ser = answers.tone_serious || 50
    const t_cau = answers.tone_cautious || 50

    const profileData = {
      user_id: userId,
      full_name: answers.full_name || '',
      appeal: answers.appeal || '',
      approaches: answers.approaches || [],
      niches: answers.niches || [],
      one_niche: answers.one_niche || '',
      experience: answers.experience || '',
      path_to_profession: answers.path_to_profession || '',
      formats: answers.formats || [],
      price: answers.price || '',

      tone_formal: t_form,
      tone_serious: t_ser,
      tone_cautious: t_cau,
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
      .upsert(profileData, { onConflict: 'user_id' })

    if (error) {
      console.error('Save error:', error)
      alert('Ошибка при сохранении. Проверьте добавлены ли новые колонки в Supabase.')
      setLoading(false)
      return
    }

    setCompleted(true)
  }

  // --- ЭКРАН «ПРОФИЛЬ УЖЕ ЕСТЬ» (анти-цикл: без авто-редиректа) ---
  if (alreadyHasProfile) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 sm:p-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-lg w-full rounded-2xl p-5 sm:p-8 border border-brand-border text-center shadow-xl">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-brand-accent" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-text mb-3 sm:mb-4">Ваш профиль уже заполнен</h1>
          <p className="text-sm sm:text-base text-brand-text-secondary mb-6 sm:mb-8 leading-relaxed">
            Распаковка пройдена, все на месте. Можно сразу создавать контент.
          </p>
          <button onClick={() => router.push('/dashboard')} className="w-full py-3.5 sm:py-4 bg-brand-accent hover:bg-brand-accent-hover text-white rounded-xl font-bold text-sm sm:text-base transition flex items-center justify-center gap-2 shadow-lg cursor-pointer">
            В кабинет <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </motion.div>
      </div>
    )
  }

  // --- ЭКРАН ЗАВЕРШЕНИЯ ---
  if (completed) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 sm:p-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-lg w-full rounded-2xl p-5 sm:p-8 border border-brand-border text-center shadow-xl">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-5">
            <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-brand-accent" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-text mb-1">Готово. Твой голос у нас есть</h1>
          <div className="flex justify-center mb-3 sm:mb-4"><Squiggle variant={1} width="180px" /></div>
          <p className="text-sm sm:text-base text-brand-text-secondary mb-6 sm:mb-8 leading-relaxed">
            Теперь соберем из твоей мысли первый пост. Это пара минут.
          </p>
          <button onClick={() => router.push('/dashboard/post-generator?first=1')} className="w-full py-3.5 sm:py-4 bg-brand-accent hover:bg-brand-accent-hover text-white rounded-xl font-bold text-sm sm:text-base transition flex items-center justify-center gap-2 shadow-lg cursor-pointer">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" /> Написать первый пост <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button onClick={() => router.push('/dashboard/brand-passport')} className="mt-4 text-sm text-brand-muted hover:text-brand-text transition cursor-pointer">
            Сначала заглянуть в карту бренда
          </button>
        </motion.div>
      </div>
    )
  }

  // --- ЭКРАН ПРИВЕТСТВИЯ ---
  if (step === -1) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 sm:p-6">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="max-w-2xl bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 border border-brand-border shadow-2xl">
          <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-xs sm:text-sm font-bold mb-4 sm:mb-6">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Глубокая распаковка
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-brand-text mb-2">Давайте познакомимся. По-настоящему.</h1>
          <Squiggle variant={1} width="60%" className="mb-4 sm:mb-6" />

          <div className="text-sm sm:text-base text-brand-text-secondary mb-6 sm:mb-8 leading-relaxed space-y-3 sm:space-y-4">
            <p>Сейчас будет 22 вопроса, это займет около <strong>25 минут</strong>. Заварите чай ☕</p>
            <p>Почему так долго? Потому что мы не делаем шаблонный контент. Мы создаем ВАШ голос. Чем больше мы о вас узнаем, тем точнее будут посты. Они будут звучать как вы.</p>

            <div className="bg-brand-soft border border-brand-border-soft p-3.5 sm:p-5 rounded-2xl text-xs sm:text-base">
              <span className="font-bold text-brand-text">Три совета:</span>
              <ul className="mt-2 space-y-1.5 sm:space-y-2 text-brand-muted">
                <li>1. Отвечайте честно, а не «правильно».</li>
                <li>2. Пишите <b>как говорите</b>. Без «оказание психологической помощи».</li>
                <li>3. Если вопрос вызывает ступор, первое что пришло в голову обычно самое точное.</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button onClick={handleStart} className="flex-1 sm:flex-none px-6 sm:px-8 py-3.5 sm:py-4 bg-brand-accent hover:bg-brand-accent-hover text-white rounded-2xl font-bold text-base sm:text-lg transition flex items-center justify-center gap-2 sm:gap-3 cursor-pointer">
              Начать распаковку <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button
              onClick={handleDemoFill}
              disabled={loading}
              className="flex-1 sm:flex-none px-5 sm:px-6 py-3.5 sm:py-4 border-2 border-dashed border-brand-border-soft text-brand-muted hover:bg-brand-soft rounded-2xl font-semibold text-sm sm:text-base transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-brand-muted border-t-transparent rounded-full animate-spin" /> Заполняю...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Демо-режим</>
              )}
            </button>
          </div>
          <p className="text-xs text-brand-text-secondary mt-2 opacity-60">Демо-режим заполнит анкету готовыми данными, можно сразу посмотреть как работает генерация</p>
        </motion.div>
      </div>
    )
  }

  // --- ОНБОРДИНГ ШАГИ ---
  const q = currentQuestion!

  return (
    <div className="min-h-screen bg-brand-bg pb-24">
      {/* HEADER ПРОГРЕСС */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-brand-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold mb-2 sm:mb-3">
            <span className={currentBlock?.color + ' px-2.5 sm:px-3 py-1 rounded-full flex items-center gap-1 sm:gap-1.5'}>
              {currentBlock && <currentBlock.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              {currentBlock?.title}
            </span>
            <span className="text-brand-text-secondary">{step + 1} / {questions.length}</span>
          </div>
          <div className="w-full bg-brand-soft rounded-full h-1 sm:h-1.5 overflow-hidden">
            <motion.div className="bg-brand-accent h-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
          </div>
        </div>
      </div>

      {/* ВОПРОС */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3 }}>

            <h2 className="text-xl sm:text-2xl md:text-4xl font-bold text-brand-text mb-3 sm:mb-4 leading-tight">
              {q.title}
            </h2>
            {q.subtitle && <p className="text-sm sm:text-lg text-brand-text-secondary mb-6 sm:mb-10">{q.subtitle}</p>}

            <div className="space-y-4 sm:space-y-6">

              {/* 1. Текстовый ввод (text, textarea, text_and_single, text_and_multi) */}
              {(q.type === 'text' || q.type === 'textarea' || q.type === 'text_and_single' || q.type === 'text_and_multi') && (
                <div>
                  {q.type === 'textarea' ? (
                    <textarea
                      value={answers[q.key] || ''} onChange={e => setAnswers({...answers, [q.key]: e.target.value})}
                      placeholder={q.placeholder} rows={3}
                      className="w-full p-3.5 sm:p-5 rounded-2xl border-2 border-brand-border focus:border-brand-accent outline-none text-sm sm:text-lg resize-none"
                    />
                  ) : (
                    <input
                      type="text" value={answers[q.key] || ''} onChange={e => setAnswers({...answers, [q.key]: e.target.value})}
                      placeholder={q.placeholder}
                      className="w-full p-3.5 sm:p-5 rounded-2xl border-2 border-brand-border focus:border-brand-accent outline-none text-sm sm:text-lg"
                    />
                  )}
                </div>
              )}

              {/* 2. Основная сетка опций */}
              {(q.type === 'single' || q.type === 'multi' || q.type === 'multi_and_text' || q.type === 'single_and_text' || q.type === 'multi_and_single' || q.type === 'single_and_single') && (q.options || q.options1) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 mt-3 sm:mt-4">
                  {(q.options1 || q.options || []).map(opt => {
                    const isMulti = q.type.includes('multi')
                    const isSelected = isMulti ? (answers[q.key] || []).includes(opt) : answers[q.key] === opt

                    return (
                      <button
                        key={opt} onClick={() => isMulti ? toggleArrayItem(q.key, opt, q.maxChoice) : setAnswers({...answers, [q.key]: opt})}
                        className={`text-left p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 transition font-medium cursor-pointer flex items-start gap-2.5 sm:gap-3 text-sm sm:text-base
                          ${isSelected ? 'border-brand-accent bg-brand-soft text-brand-text' : 'border-brand-border bg-brand-card hover:border-brand-accent/40'}`}
                      >
                        <div className={`w-4 h-4 sm:w-5 sm:h-5 mt-0.5 rounded flex items-center justify-center shrink-0 border ${isSelected ? 'bg-brand-accent border-brand-accent' : 'border-brand-border'}`}>
                          {isSelected && <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                        </div>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* 3. Дополнительный текстовый ввод (textKey) */}
              {q.textKey && (
                <div className="pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-gray-100">
                  <textarea
                    value={answers[q.textKey] || ''} onChange={e => setAnswers({...answers, [q.textKey]: e.target.value})}
                    placeholder={q.textPlaceholder} rows={3}
                    className="w-full p-3.5 sm:p-5 rounded-2xl border-2 border-brand-border focus:border-brand-accent outline-none text-sm sm:text-lg resize-none"
                  />
                </div>
              )}

              {/* 4. Дополнительная сетка опций (optionsKey / singleKey / single2Key) */}
              {(q.optionsKey || q.singleKey || q.single2Key) && (
                <div className="pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-gray-100">
                  <p className="font-bold text-brand-text mb-3 sm:mb-4 text-sm sm:text-lg">
                    {q.secondLabel || 'Укажите дополнительно:'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                    {(q.singleOptions || q.options2 || q.options || []).map(opt => {
                      const tgtKey = q.optionsKey || q.singleKey || q.single2Key!
                      const isMulti = q.type.includes('multi') && !!q.optionsKey
                      const isSelected = isMulti ? (answers[tgtKey] || []).includes(opt) : answers[tgtKey] === opt

                      return (
                        <button key={opt} onClick={() => isMulti ? toggleArrayItem(tgtKey, opt) : setAnswers({...answers, [tgtKey]: opt})}
                          className={`p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 font-medium transition cursor-pointer text-left flex items-start gap-2.5 sm:gap-3 text-sm sm:text-base
                            ${isSelected ? 'border-brand-accent bg-brand-soft text-brand-text' : 'border-brand-border hover:bg-brand-bg'}`}
                        >
                          <div className={`w-4 h-4 sm:w-5 sm:h-5 mt-0.5 rounded-full flex items-center justify-center shrink-0 border ${isSelected ? 'bg-brand-accent border-brand-accent' : 'border-brand-border'}`}>
                            {isSelected && <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-white rounded-full" />}
                          </div>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 5. Слайдеры */}
              {q.type === 'sliders' && q.sliders && (
                <div className="space-y-8 sm:space-y-10 bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-gray-100 mt-4 sm:mt-6 shadow-sm">
                  {q.sliders.map(slider => (
                    <div key={slider.key}>
                      <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-400 mb-3 sm:mb-4 px-1 sm:px-2 uppercase tracking-wide">
                        <span className={answers[slider.key] < 50 ? 'text-brand-accent' : ''}>{slider.left}</span>
                        <span className={answers[slider.key] > 50 ? 'text-brand-accent' : ''}>{slider.right}</span>
                      </div>
                      <input
                        type="range" min="0" max="100"
                        value={answers[slider.key] || 50}
                        onChange={e => setAnswers({...answers, [slider.key]: Number(e.target.value)})}
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
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-brand-border py-3 sm:py-4 px-4 sm:px-6 z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setStep(step - 1)} disabled={step === 0}
            className={`flex items-center gap-1.5 sm:gap-2 font-semibold transition cursor-pointer px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl border-2 text-sm sm:text-base ${step === 0 ? 'text-gray-300 border-transparent' : 'text-gray-500 border-gray-200 hover:text-black hover:bg-gray-50'}`}
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" /> Назад
          </button>

          <button
            onClick={handleNext} disabled={!canProceed() || loading}
            className={`px-5 sm:px-8 py-2.5 sm:py-3 rounded-2xl font-bold flex items-center gap-1.5 sm:gap-2 transition shadow-lg cursor-pointer text-sm sm:text-base
              ${canProceed() && !loading ? 'bg-brand-accent hover:bg-brand-accent-hover text-white shadow-brand-accent/20' : 'bg-brand-soft text-brand-muted shadow-none'}`}
          >
            {loading ? 'Сохраняем...' : step === questions.length - 1 ? 'Завершить 🎉' : <>Далее <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5"/></>}
          </button>
        </div>
      </div>
    </div>
  )
}
