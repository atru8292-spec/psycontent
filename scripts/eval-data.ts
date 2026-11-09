// Данные для массового прогона (scripts/eval-batch.ts): три тестовых психолога и набор тем.
// Темы покрывают все форматы и смыслы. Фразы клиентов и истории выдуманы для теста,
// это не реальные клиенты (152-ФЗ: живые данные сюда не класть).

import type { FormatCode } from '../lib/generation/text-guard'

export type Who = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'

export const PERSONAS: Record<Who, any> = {
  A: {
    full_name: 'Юлия', author_gender: 'female', reader_address: 'ty', profanity: 'no', disclosure: 2,
    approaches: ['Психоанализ'], one_niche: 'одиночество и отношения у женщин 30-45', audience: 'в основном женщины 30-45',
    client_pain_phrases: '«я вроде все делаю правильно, а рядом никого»; «опять выбрала того, кто не выбирает меня»; «с ним скучно, а без него страшно»; «мне тридцать восемь, и я все еще жду, что мама скажет, что я молодец»',
    position_text: 'Злит, когда психологи обещают, что после терапии вы станете счастливыми. Терапия про то, чтобы жить свою жизнь, а не про счастье по заказу.',
    story_bank: [{ text: 'Когда я сама первый раз пришла в анализ, я два месяца рассказывала аналитику, как у меня все хорошо. Потом он спросил, зачем я тогда плачу в машине перед каждой сессией.', level: 'work' }],
    booking_info: 'ссылка на запись в шапке профиля',
    // смешная или странная рабочая деталь (zh3, 20.10, 01-NOVYE-PRAVILA-zh3.md раздел 4), вымышленная; в промпт идет только в zh3
    // «про что мой блог» одной строкой (zh4, 21.10): для подписи с подпиской и визитки; в базе такого поля пока нет
    blog_about: 'почему умные и самостоятельные женщины остаются одни и как перестать выбирать тех, кто не выбирает тебя',
    work_detail: 'У меня в кабинете стоит коробка салфеток, и клиенты по ней меряют сессию: если вытащила три, значит, хорошо поработали. Одна клиентка однажды принесла свою, потому что мои слишком жесткие.',
  },
  B: {
    full_name: 'Ольга', author_gender: 'female', reader_address: 'vy_devochki', profanity: 'free', intensity: 'hot', disclosure: 1,
    approaches: ['Системная семейная терапия'], one_niche: 'мамы, уставшие от быта и мужа', audience: 'в основном женщины, мамы 28-45',
    client_pain_phrases: '«я одна тащу весь дом»; «он говорит: ну скажи, что сделать, я сделаю»; «я кричу на детей, а потом ненавижу себя»; «хочу просто полежать, чтобы никто ничего не хотел»',
    position_text: 'Бесят советы «а ты попроси мужа помочь». Помогают в гостях. А муж в этом доме живет, и ужин, уроки и стирка такие же его дела, как ваши. Если каждое дело ему надо сначала поручить, объяснить и проверить, вы все равно работаете, просто чужими руками.',
    story_bank: [{ text: 'Однажды я на детском празднике поймала себя на том, что считаю, сколько раз муж посмотрел в телефон. Одиннадцать. Я психолог, у меня супервизия, а я сижу и считаю.', level: 'personal' }],
    booking_info: 'пишите в директ слово «разбор»',
    blog_about: 'про маму, которая все тащит сама, мужа, который «помогает», и злость, за которую потом стыдно',
    work_detail: 'Половина моих онлайн-сессий идет под звуки чужого мультика: мамы прячутся от детей в машине, в ванной, один раз в кладовке с пылесосом. Я уже по звуку узнаю «Синий трактор».',
  },
  C: {
    full_name: 'Михаил', author_gender: 'male', reader_address: 'vy', profanity: 'no', disclosure: 3,
    approaches: ['КПТ'], one_niche: 'тревога, неуверенность, отношения', audience: 'мужчины и женщины 25-45',
    client_pain_phrases: '«я все время думаю, что обо мне подумают»; «не могу отказать, потом злюсь на себя»; «жду, когда станет не страшно, и тогда начну»',
    position_text: 'Не люблю, когда самооценку лечат аффирмациями у зеркала. Уверенность появляется от поступков, а не от слов.',
    story_bank: [],
    booking_info: 'запись через личные сообщения',
    blog_about: 'про тревогу, неловкость и то, как жить, когда все время думаешь, что о тебе подумают',
    work_detail: 'Клиенты с тревогой приходят на сессию минут за двадцать и сидят в машине у подъезда. Я это вижу из окна и молчу. Один раз клиент так просидел все пятьдесят минут и написал: «Сегодня хорошо поработали».',
  },
  // zh5d (26.10): три выдуманных автора с разной подачей, по типам из разбора 26.10. Имена, ниши и истории придуманы,
  // ничего не взято у реальных людей. Слепки голоса для прогона написаны вручную (test/eval/voice_core_<D|E|F>*.json).
  D: {
    full_name: 'Артем', author_gender: 'male', reader_address: 'ty', profanity: 'no', intensity: 'live', disclosure: 1,
    approaches: ['Гештальт'], one_niche: 'женщины после тяжелых расставаний и отношений, где их не выбирали', audience: 'в основном женщины 25-40',
    client_pain_phrases: '«я знаю, что он не вернется, но каждый вечер открываю его страницу»; «вроде сама ушла, а чувствую себя брошенной»; «все говорят отпусти, а я не понимаю, как это»',
    position_text: 'Не люблю, когда расставание через неделю называют новой главой. Сначала это просто больно, и это надо прожить, а не украсить.',
    story_bank: [],
    booking_info: 'слово в директ',
    blog_about: 'про женщин, которые ушли из отношений, где их не выбирали, и теперь учатся не возвращаться',
    // гайд, который автор правда отправляет за слово (поля в базе пока нет, предложение: onboarding_profiles.gayd)
    gayd: 'гайд «Не возвращайся»: почему тянет назад и что делать в тот вечер, когда хочется написать',
    risuet: false,
  },
  E: {
    full_name: 'Ника', author_gender: 'female', reader_address: 'ty', profanity: 'free', intensity: 'live', disclosure: 2, tone_serious: 25,
    approaches: ['Транзактный анализ'], one_niche: 'отношения и границы у женщин 25-35', audience: 'в основном женщины 23-35',
    client_pain_phrases: '«я опять сказала да, хотя хотела сказать иди ты»; «мне неудобно напомнить ему про долг»; «вроде мелочь, а я третий день злюсь»',
    position_text: 'Бесит, когда границы продают как бетонную стену и холод. Границы это когда ты можешь сказать нет и остаться в отношениях.',
    story_bank: [{ text: 'Я три года вела в заметках телефона список «на что я зря согласилась». Там есть переезд чужого дивана на пятый этаж и свадьба, где я была фотографом бесплатно.', level: 'personal' }],
    booking_info: 'запись по ссылке в шапке',
    blog_about: 'рисую комиксы про отношения, границы и то, как мы соглашаемся на то, что нам не нравится',
    gayd: '',
    // рисует сама (поля в базе пока нет, предложение: onboarding_profiles.risuet)
    risuet: true,
  },
  F: {
    full_name: 'Марина', author_gender: 'female', reader_address: 'vy', profanity: 'no', intensity: 'calm', disclosure: 3, tone_serious: 80,
    approaches: ['КПТ', 'ACT'], one_niche: 'тревога и бессонница у взрослых', audience: 'мужчины и женщины 25-50',
    client_pain_phrases: '«лежу и прокручиваю завтрашний разговор»; «прочитала про симптом и теперь проверяю пульс»; «устаю от того, что все время себя успокаиваю»',
    position_text: 'Не люблю советы без механизма. Если я говорю, что что-то работает, я могу объяснить почему и на ком это проверяли. Опираюсь на КПТ бессонницы (CBT-I) и книгу Кларка и Бека о когнитивной терапии тревожных расстройств.',
    story_bank: [],
    booking_info: 'запись через сайт',
    blog_about: 'объясняю, как устроены тревога и бессонница и что с ними правда помогает, со ссылками на исследования',
    gayd: '',
    risuet: false,
    // свои источники автора (уровень «в» правила источников; поля в базе пока нет, предложение: onboarding_profiles.istochniki)
    istochniki: [
      'Д. Кларк, А. Бек, «Когнитивная терапия тревожных расстройств» (Clark D. A., Beck A. T., Cognitive Therapy of Anxiety Disorders, 2010)',
      'Ч. Морин, К. Эспи, «Бессонница: клиническое руководство» (Morin C. M., Espie C. A., Insomnia: A Clinical Guide to Assessment and Treatment, 2003)',
    ],
  },
  // Новые ниши для планов тем (07.11): ниши выбраны по стоку (счет в ОТЧЕТ-2026-11-07.md), имена по первой букве ниши,
  // фразы клиентов и позиции придуманы, ничего не взято у реальных людей и из живых тем стока. Сессии онлайн.
  G: {
    full_name: 'Нина', author_gender: 'female', reader_address: 'ty', profanity: 'light', intensity: 'live', disclosure: 2,
    approaches: ['Психодинамическая терапия'], one_niche: 'когда самооценка держится на чужой похвале: стыд, зависть, страх оказаться обычной',
    audience: 'в основном женщины 25-40, которые много добиваются и мало этому радуются', formats: ['Онлайн'],
    client_pain_phrases: '«если меня не похвалили, значит, я сделала плохо»; «подруга купила квартиру, а я весь вечер не могу есть»; «одно замечание начальника, и я неделю прокручиваю его в голове»; «боюсь, что внутри я самая обыкновенная»',
    position_text: 'Не люблю совет «просто полюби себя». Человеку, у которого без чужого одобрения внутри пусто, он только добавляет еще одну оценку, которую никак не получить.',
    story_bank: [{ text: 'До тридцати лет я помнила наизусть единственный плохой отзыв на свою дипломную работу. Хорошие не помнила ни одного.', level: 'personal' }],
    booking_info: 'ссылка на запись в шапке профиля',
    blog_about: 'почему похвала греет до вечера, а одно замечание помнится годами, и как жить без постоянной проверки «я достаточно хороша?»',
  },
  H: {
    full_name: 'Таисия', author_gender: 'female', reader_address: 'vy', profanity: 'no', intensity: 'calm', disclosure: 2,
    approaches: ['Схема-терапия'], one_niche: 'тревога в быту у женщин 25-45: накручивание, контроль, паника', audience: 'в основном женщины 25-45', formats: ['Онлайн'],
    client_pain_phrases: '«муж два раза не взял трубку, а я уже мысленно обзваниваю больницы»; «проверяю утюг, выхожу из подъезда и возвращаюсь проверить еще раз»; «если я все не держу под контролем, все развалится»; «ночью сердце колотится, и я уверена, что это инфаркт»',
    position_text: 'Злит, когда тревожным людям говорят «не накручивай». Если бы человек умел не накручивать, он бы так и делал. Сначала надо понять, от чего тревога его бережет.',
    story_bank: [],
    booking_info: 'запись по ссылке в шапке',
    blog_about: 'про тревогу в обычной жизни: почему мы накручиваем, держим все под контролем и ждем плохого',
  },
  I: {
    full_name: 'Захар', author_gender: 'male', reader_address: 'ty', profanity: 'free', intensity: 'hot', disclosure: 2,
    approaches: ['Гештальт'], one_niche: 'злость и раздражение у взрослых: копят, срываются на близких, не умеют злиться спокойно', audience: 'мужчины и женщины 25-45', formats: ['Онлайн'],
    client_pain_phrases: '«я терплю, терплю, а потом ору из-за немытой чашки»; «после работы меня бесит любой звук дома»; «злюсь, а вслух говорю, что все нормально»; «наорал на жену из-за ерунды, а злился на начальника»',
    position_text: 'Не люблю, когда злость называют плохим чувством, которое надо отпустить. Злость сообщает, что что-то не так. Беда начинается, когда ее годами глотают, и она выходит на тех, кто рядом.',
    story_bank: [{ text: 'Я долго считал себя спокойным человеком, пока однажды не сломал дверцу шкафа, потому что она второй раз не закрылась.', level: 'personal' }],
    booking_info: 'запись через личные сообщения',
    blog_about: 'про злость, которую копят и потом срываются на своих, и как злиться так, чтобы никого не разрушать',
  },
}

// vid: какой вид карусели ждем (11-KAK-USTROENY-KARUSELI.md), по нему сравнение подмешивает живую карусель того же вида
export type EvalRow = { id: string; who: Who; intent: string; format: FormatCode; topic: string; dlya?: string; vid?: string; label?: string }

// id: формат_номер. Порядок внутри формата важен только для --n (берется равномерно по форматам).
export const TOPICS: EvalRow[] = [
  // Reels: отвечаю на вопрос
  { id: 'otvet_1', who: 'C', intent: 'kak_v_terapii', format: 'reels_otvet', topic: '«а если психолог мне не поможет?»' },
  { id: 'otvet_2', who: 'A', intent: 'mif', format: 'reels_otvet', topic: '«почему я все понимаю про себя, а ничего не меняется»' },
  { id: 'otvet_3', who: 'B', intent: 'perevod_repliki', format: 'reels_otvet', topic: '«это нормально, что я иногда не хочу видеть своих детей?»' },
  // Reels: объясняю одну вещь
  { id: 'monolog_1', who: 'C', intent: 'mif', format: 'reels_monolog', topic: '«уверенность надо в себе воспитать»' },
  { id: 'monolog_2', who: 'A', intent: 'uznavanie', format: 'reels_monolog', topic: 'опять выбрала того, кто не выбирает меня' },
  { id: 'monolog_3', who: 'B', intent: 'mehanizm', format: 'reels_monolog', topic: 'почему срываюсь на детей именно вечером' },
  // Reels: приметы
  { id: 'spisok_1', who: 'B', intent: 'uznavanie', format: 'reels_spisok', topic: 'мама кричит на детей, а потом себя ненавидит' },
  { id: 'spisok_2', who: 'C', intent: 'dlya_blizkih', format: 'reels_spisok', topic: 'как понять человека с тревогой, если живешь с ним' },
  { id: 'spisok_3', who: 'A', intent: 'uznavanie', format: 'reels_spisok', topic: 'женщина, которая всегда сильная и ни у кого не просит' },
  // Reels: о себе
  { id: 'istoriya_1', who: 'A', intent: 'svoya_istoriya', format: 'reels_istoriya', topic: 'как я сама пришла в анализ и говорила, что все хорошо' },
  { id: 'istoriya_2', who: 'B', intent: 'svoya_istoriya', format: 'reels_istoriya', topic: 'как я считала, сколько раз муж посмотрел в телефон' },
  // Reels: важные слова
  { id: 'poslanie_1', who: 'B', intent: 'podderzhka', format: 'reels_poslanie', topic: 'мама, которая вечером считает, что опять ничего не успела' },
  { id: 'poslanie_2', who: 'A', intent: 'razreshenie', format: 'reels_poslanie', topic: 'можно уйти из отношений, где просто не плохо' },
  // Reels: сценки
  { id: 'scenka_1', who: 'A', intent: 'kak_v_terapii', format: 'reels_scenka', topic: 'первые месяцы терапии, когда «все хорошо»' },
  { id: 'scenka_2', who: 'C', intent: 'mehanizm', format: 'reels_scenka', topic: 'не могу отказать коллеге, потом злюсь' },
  { id: 'scenka_3', who: 'B', intent: 'yumor', format: 'reels_scenka', topic: 'муж спрашивает, что приготовить, когда я уже все приготовила' },
  // Reels: роль
  { id: 'rol_1', who: 'B', intent: 'yumor', format: 'reels_rol', topic: 'муж «помогает» по дому' },
  { id: 'rol_2', who: 'C', intent: 'mif', format: 'reels_rol', topic: 'марафон уверенности за 7 дней' },
  // Reels: доска
  { id: 'doska_1', who: 'C', intent: 'mehanizm', format: 'reels_doska', topic: 'почему трудно отказать' },
  { id: 'doska_2', who: 'A', intent: 'obyasnenie', format: 'reels_doska', topic: 'чем одиночество отличается от уединения' },
  // Reels: без лица
  { id: 'bezslov_1', who: 'B', intent: 'yumor', format: 'reels_bez_slov', topic: 'хочу просто полежать, чтобы никто ничего не хотел' },
  { id: 'bezslov_2', who: 'A', intent: 'uznavanie', format: 'reels_bez_slov', topic: 'он не ответил на сообщение три часа' },
  // Reels: подбери сама
  { id: 'auto_1', who: 'A', intent: 'podderzhka', format: 'reels_auto', topic: 'выходные в одиночестве' },
  { id: 'auto_2', who: 'C', intent: 'obyasnenie', format: 'reels_auto', topic: 'тревога перед звонком незнакомому человеку' },
  // Пост в Instagram
  { id: 'post_1', who: 'B', intent: 'podderzhka', format: 'post', topic: 'крикнула на ребенка и ненавижу себя' },
  { id: 'post_2', who: 'A', intent: 'uznavanie', format: 'post', topic: 'с ним скучно, а без него страшно' },
  { id: 'post_3', who: 'C', intent: 'malenkiy_shag', format: 'post', topic: 'как отказать, не оправдываясь' },
  { id: 'post_4', who: 'A', intent: 'poziciya', format: 'post', topic: 'терапия не делает счастливой' },
  { id: 'post_5', who: 'B', intent: 'priglashenie', format: 'post', topic: 'консультации для уставших мам' },
  // Пост в Telegram
  { id: 'tg_1', who: 'C', intent: 'mehanizm', format: 'post_tg', topic: 'жду, когда станет не страшно, и тогда начну' },
  { id: 'tg_2', who: 'A', intent: 'svoya_istoriya', format: 'post_tg', topic: 'как я два месяца рассказывала аналитику, что все хорошо' },
  { id: 'tg_3', who: 'B', intent: 'obyasnenie', format: 'post_tg', topic: 'чем усталость отличается от выгорания у мамы' },
  // Карусели
  { id: 'carousel_1', who: 'C', intent: 'dlya_blizkih', format: 'carousel', topic: 'тревожный близкий' },
  { id: 'carousel_2', who: 'B', intent: 'razreshenie', format: 'carousel', topic: 'можно не быть веселой мамой' },
  { id: 'carousel_3', who: 'A', intent: 'perevod_repliki', format: 'carousel', topic: 'что мы говорим себе, когда боимся остаться одни' },
  { id: 'carousel_4', who: 'C', intent: 'obyasnenie', format: 'carousel', topic: 'чем волнение отличается от тревоги' },
  // Сторис
  { id: 'stories_1', who: 'B', intent: 'uznavanie', format: 'stories', topic: 'вечер после того, как дети уснули' },
  { id: 'stories_2', who: 'A', intent: 'priglashenie', format: 'stories', topic: 'как проходит первая встреча' },
]

// Разные темы и разная аудитория (01.10, просьба Арины «не только мамы и достигаторы»): мифы, вопросы
// «а зачем мне психолог», отношения, родители, деньги, работа, тело, мужчины, родители подростков.
// dlya заменяет аудиторию тестового психолога, его фразы клиентов, позиция и истории тогда не идут.
// Запуск: eval-batch.ts --set=raznye [--n=12] --golosa=rilsy
export const TOPICS_RAZNYE: EvalRow[] = [
  { id: 'r_mif_1', who: 'C', intent: 'mif', format: 'reels_auto', topic: '«психолог просто слушает и кивает за мои деньги»', dlya: 'люди 25-40, которые ни разу не были у психолога' },
  { id: 'r_vopros_1', who: 'B', intent: 'obyasnenie', format: 'reels_auto', topic: '«а зачем мне психолог, если у меня есть подруги»', dlya: 'девушки и женщины 22-35' },
  { id: 'r_post_1', who: 'A', intent: 'uznavanie', format: 'post', topic: 'он не пишет первым, а я весь вечер жду и проверяю телефон', dlya: 'девушки 20-30 в начале отношений' },
  { id: 'r_tg_1', who: 'C', intent: 'mehanizm', format: 'post_tg', topic: 'боюсь, что на работе меня раскусят и поймут, что я ничего не умею', dlya: 'специалисты 25-35 в офисе и на удаленке' },
  { id: 'r_car_1', who: 'B', intent: 'dlya_blizkih', format: 'carousel', topic: 'как поддержать подругу с депрессией и не сделать хуже', dlya: 'девушки и женщины 20-40' },
  { id: 'r_mif_2', who: 'A', intent: 'mif', format: 'post', topic: '«тревогу надо просто перестать накручивать»', dlya: 'тревожные люди 20-40' },
  { id: 'r_rod_1', who: 'B', intent: 'uznavanie', format: 'reels_auto', topic: 'мама обижается, если я не звоню каждый день', dlya: 'взрослые дети 25-40, которые живут отдельно' },
  { id: 'r_men_1', who: 'C', intent: 'uznavanie', format: 'reels_auto', topic: 'мужчины не плачут, а потом срываются на детей', dlya: 'мужчины 30-45, отцы' },
  { id: 'r_vopros_2', who: 'A', intent: 'kak_v_terapii', format: 'reels_auto', topic: '«а о чем вообще говорить на первой сессии?»', dlya: 'люди, которые думают пойти к психологу впервые' },
  { id: 'r_money_1', who: 'B', intent: 'mehanizm', format: 'post', topic: 'стыдно просить повышение, хотя работаю больше всех', dlya: 'женщины 25-40, работают в найме' },
  { id: 'r_body_1', who: 'A', intent: 'podderzhka', format: 'reels_auto', topic: 'ненавижу себя в зеркале перед отпуском', dlya: 'девушки и женщины 20-40' },
  { id: 'r_teen_1', who: 'C', intent: 'dlya_blizkih', format: 'carousel', topic: 'подросток закрылся в комнате и не разговаривает', dlya: 'родители подростков 12-17' },
  { id: 'r_vybor_1', who: 'B', intent: 'mehanizm', format: 'reels_auto', topic: 'почему я снова выбираю тех, кто меня не выбирает', dlya: 'девушки и женщины 22-35' },
  { id: 'r_zlost_1', who: 'A', intent: 'razreshenie', format: 'post_tg', topic: '«я вообще никогда не злюсь»', dlya: 'девушки и женщины 25-40, удобные и хорошие' },
  { id: 'r_humor_1', who: 'B', intent: 'yumor', format: 'reels_auto', topic: 'когда ты психолог, а подруги приходят «просто поговорить»', dlya: 'девушки и женщины 22-40' },
  { id: 'r_malysh_1', who: 'B', intent: 'mehanizm', format: 'reels_malysh', topic: 'почему так страшно сказать «нет»', dlya: 'девушки и женщины 22-40, удобные' },
  { id: 'r_malysh_2', who: 'A', intent: 'podderzhka', format: 'reels_malysh', topic: 'обида на маму, которую стыдно признать', dlya: 'взрослые дочери 25-40' },
  { id: 'r_drug_1', who: 'C', intent: 'uznavanie', format: 'post', topic: 'друзья пропадают, когда у них все хорошо, и появляются, когда плохо', dlya: 'люди 25-40' },
  // добавлены 01.10 для проверки на новых аудиториях (круг 3)
  { id: 'r_mama_1', who: 'B', intent: 'uznavanie', format: 'post', topic: 'я злюсь на ребенка, а потом ненавижу себя за это', dlya: 'мамы детей до 3 лет, декрет' },
  { id: 'r_stud_1', who: 'A', intent: 'mehanizm', format: 'reels_auto', topic: 'не могу сесть за диплом, хотя времени почти нет', dlya: 'студенты 18-23' },
  { id: 'r_gnezdo_1', who: 'C', intent: 'podderzhka', format: 'post_tg', topic: 'дети выросли и уехали, а я не знаю, зачем теперь вставать утром', dlya: 'женщины и мужчины 45-60' },
  { id: 'r_razvod_1', who: 'B', intent: 'mif', format: 'carousel', topic: '«ради детей надо сохранить семью»', dlya: 'женщины 30-45, думают о разводе или уже развелись' },
  { id: 'r_pereezd_1', who: 'A', intent: 'uznavanie', format: 'reels_auto', topic: 'переехала в другой город и за год ни с кем не подружилась', dlya: 'люди 25-35 после переезда' },
  { id: 'r_dengi_1', who: 'C', intent: 'mehanizm', format: 'post', topic: 'зарабатываю нормально, но все равно постоянно боюсь, что денег не хватит', dlya: 'мужчины 30-45' },
]

// Роли постов (Арина 02.10: контент работает на охват, доверие и запись). Охват уже в TOPICS_RAZNYE,
// здесь доверие (как я работаю, позиция, что бывает в терапии) и запись (прямо зову). --set=roli
export const TOPICS_ROLI: EvalRow[] = [
  { id: 'd_rabota_1', who: 'C', intent: 'kak_v_terapii', format: 'reels_auto', topic: 'что на самом деле происходит на первой консультации у меня', dlya: 'люди 25-40, которые ни разу не были у психолога' },
  { id: 'd_poziciya_1', who: 'A', intent: 'poziciya', format: 'reels_auto', topic: 'почему я не обещаю, что после терапии вы станете счастливой', dlya: 'женщины 30-45' },
  { id: 'd_sovety_1', who: 'B', intent: 'poziciya', format: 'post_tg', topic: 'почему я не даю советов «просто уйди от него»', dlya: 'женщины, мамы 28-45' },
  { id: 'd_ne_podhodit_1', who: 'C', intent: 'kak_v_terapii', format: 'post', topic: 'что делать, если психолог вам не подошел', dlya: 'люди 25-45, которые уже пробовали терапию' },
  { id: 'z_zapis_1', who: 'B', intent: 'priglashenie', format: 'reels_auto', topic: 'зову на консультацию тех, кто устал тащить весь дом на себе', dlya: 'женщины, мамы 28-45' },
  { id: 'z_zapis_2', who: 'A', intent: 'priglashenie', format: 'post', topic: 'открываю запись на осень: с чем ко мне можно прийти', dlya: 'женщины 30-45, одиночество и отношения' },
  { id: 'z_zapis_3', who: 'C', intent: 'priglashenie', format: 'reels_auto', topic: 'приходите, если тревога мешает жить, а «просто успокойся» не работает', dlya: 'мужчины и женщины 25-45' },
]

// Карусели (задача karuseli-tekst, 03.10): 14 тем, по две под каждый вид. Вид выбирает модель (ход hod_karusel),
// vid здесь только ожидание для сравнения с живой каруселью того же вида. Все три автора.
// Запуск только после слова Арины про баланс: eval-batch.ts --set=karuseli
export const TOPICS_KARUSELI: EvalRow[] = [
  { id: 'k_nabor_1', who: 'B', intent: 'uznavanie', format: 'carousel', vid: 'nabor', topic: 'виды усталости, от которых отпуск не спасает', dlya: 'женщины 25-40, работают и тянут дом' },
  { id: 'k_nabor_2', who: 'C', intent: 'uznavanie', format: 'carousel', vid: 'nabor', topic: 'какие бывают внутренние критики', dlya: 'люди 25-40, которые все время себя ругают' },
  { id: 'k_perevod_1', who: 'A', intent: 'perevod_repliki', format: 'carousel', vid: 'perevod', topic: '«у меня низкая самооценка»: как это выглядит в обычном дне', dlya: 'девушки и женщины 20-35' },
  { id: 'k_perevod_2', who: 'B', intent: 'obyasnenie', format: 'carousel', vid: 'perevod', topic: 'границы, созависимость, выгорание: как эти слова выглядят дома и на работе', dlya: 'люди 25-40, которые слышат эти слова в соцсетях' },
  { id: 'k_golos_1', who: 'C', intent: 'uznavanie', format: 'carousel', vid: 'golos_iznutri', topic: 'что думает человек, который всем отвечает «все нормально»', dlya: 'люди 25-40' },
  { id: 'k_golos_2', who: 'A', intent: 'podderzhka', format: 'carousel', vid: 'golos_iznutri', topic: 'тревога в три часа ночи', dlya: 'тревожные люди 20-40' },
  { id: 'k_mysl_1', who: 'B', intent: 'poziciya', format: 'carousel', vid: 'odna_mysl', topic: 'что я поняла про отношения за годы работы психологом', dlya: 'женщины 25-40' },
  { id: 'k_mysl_2', who: 'A', intent: 'podderzhka', format: 'carousel', vid: 'odna_mysl', topic: 'слова для той, кто устала быть сильной', dlya: 'женщины 28-45' },
  { id: 'k_obzor_1', who: 'C', intent: 'obyasnenie', format: 'carousel', vid: 'obzor', topic: 'популярные способы успокоиться: что правда помогает, а что только обещает', dlya: 'тревожные люди 20-40' },
  { id: 'k_obzor_2', who: 'B', intent: 'dlya_blizkih', format: 'carousel', vid: 'obzor', topic: 'фильмы про отношения с мамой, которые стоит посмотреть взрослой дочери', dlya: 'взрослые дочери 25-40' },
  { id: 'k_dialog_1', who: 'A', intent: 'kak_v_terapii', format: 'carousel', vid: 'dialog', topic: 'первая сессия глазами клиентки', dlya: 'люди, которые думают пойти к психологу впервые' },
  { id: 'k_dialog_2', who: 'C', intent: 'uznavanie', format: 'carousel', vid: 'dialog', topic: 'разговор с внутренним критиком перед важной встречей', dlya: 'специалисты 25-35' },
  { id: 'k_prod_1', who: 'C', intent: 'priglashenie', format: 'carousel', vid: 'prodayushaya', topic: 'как проходит работа со мной: первая встреча и что дальше', dlya: 'люди, которые думают пойти к психологу' },
  { id: 'k_prod_2', who: 'B', intent: 'priglashenie', format: 'carousel', vid: 'prodayushaya', topic: 'кому подойдет консультация для пар и как к ней прийти', dlya: 'пары 25-40, которые часто ссорятся' },
]

// Мера одинаковости между авторами (zh4, 21.10): шесть тем из TOPICS_RAZNYE рилсом пишут все три автора.
// В основном прогоне (--set=raznye --per=2 --only-reels) тему уже написал ее автор, здесь только двое других,
// та же аудитория (dlya). scripts/sameness.ts сводит три текста на тему. --set=odinakovost
const SAME_IDS = ['r_rod_1', 'r_men_1', 'r_vybor_1', 'r_body_1', 'r_post_1', 'r_drug_1']
export const TOPICS_ODINAKOVOST: EvalRow[] = SAME_IDS.flatMap(id => {
  const t = TOPICS_RAZNYE.find(r => r.id === id)!
  return (['A', 'B', 'C'] as Who[]).filter(w => w !== t.who).map(w => ({ ...t, id: `s_${id}_${w}`, who: w, format: 'reels_auto' as FormatCode }))
})

// Глубокие темы (23.10, ТП6): боль с корнем и названием явления (label из lib/generation/rubriki.ts), заход через
// конкретную фразу или поступок. По четыре у каждого тестового автора вокруг его ниши, разные форматы. --set=glubokie
export const TOPICS_GLUBOKIE: EvalRow[] = [
  { id: 'g_A1', who: 'A', intent: 'uznavanie', format: 'reels_auto', label: 'избегающая привязанность', topic: 'он пишет «мне нужно пространство» через месяц после «я такого никогда не чувствовал»' },
  { id: 'g_A2', who: 'A', intent: 'mehanizm', format: 'carousel', label: 'выбираю тех, кто не выбирает меня', topic: 'ей скучно с тем, кто пишет сразу, и интересно с тем, кто отвечает через день' },
  { id: 'g_A3', who: 'A', intent: 'obyasnenie', format: 'post', label: 'холодная мама', topic: 'мама ни разу не сказала «я тобой горжусь», и вы ждете этого от каждого мужчины' },
  { id: 'g_A4', who: 'A', intent: 'uznavanie', format: 'reels_portret', label: 'тревожная привязанность', topic: 'проверяет, когда он был онлайн, и пишет второе сообщение подряд' },
  { id: 'g_B1', who: 'B', intent: 'mehanizm', format: 'reels_auto', label: 'гиперответственность', topic: 'она помнит про сменку, прививки и день рождения свекрови, а муж спрашивает «а что купить?»' },
  { id: 'g_B2', who: 'B', intent: 'obyasnenie', format: 'post_tg', label: 'запрет на злость', topic: 'в детстве за крик ставили в угол, а теперь она орет на детей и потом ненавидит себя' },
  { id: 'g_B3', who: 'B', intent: 'uznavanie', format: 'carousel', label: 'вечное чувство вины', topic: 'покупает себе кофе и сразу считает, сколько это пачек подгузников' },
  { id: 'g_B4', who: 'B', intent: 'uznavanie', format: 'reels_portret', label: 'мамина мама', topic: 'мама звонит пожаловаться на отца, и она с десяти лет ее утешает' },
  { id: 'g_C1', who: 'C', intent: 'uznavanie', format: 'reels_auto', label: 'страх оценки', topic: 'перед звонком в банк он пишет себе текст разговора, чтобы не показаться глупым' },
  { id: 'g_C2', who: 'C', intent: 'mif', format: 'post', label: 'тревожность', topic: '«просто не думай о плохом» и почему от этого совета тревоги только больше' },
  { id: 'g_C3', who: 'C', intent: 'mehanizm', format: 'carousel', label: 'не могу отказать', topic: 'соглашается подменить коллегу и всю дорогу домой злится на себя' },
  { id: 'g_C4', who: 'C', intent: 'dlya_blizkih', format: 'post_tg', label: 'газлайтинг', topic: 'жена говорит «тебе показалось», и он перестает верить своей памяти' },
]

// zh5d (26.10): по 4 темы новым авторам, разные форматы, глубокие и бытовые. --set=zh5d
export const TOPICS_ZH5D: EvalRow[] = [
  { id: 'd_D1', who: 'D', intent: 'uznavanie', format: 'carousel', label: 'после расставания тянет назад', topic: 'каждый вечер открывает его страницу, хотя знает, что он не вернется' },
  { id: 'd_D2', who: 'D', intent: 'mehanizm', format: 'reels_auto', label: 'отношения с нарциссом', topic: 'вроде сама ушла, а чувствует себя брошенной' },
  { id: 'd_D3', who: 'D', intent: 'podderzhka', format: 'post', topic: 'в выходные без него вдруг не знает, чем себя занять' },
  { id: 'd_D4', who: 'D', intent: 'mif', format: 'post_tg', topic: '«найди себе нового, клин клином» и почему от этого только хуже' },
  { id: 'd_E1', who: 'E', intent: 'uznavanie', format: 'carousel', label: 'синдром хорошей девочки', topic: 'сказала «да ладно, мне не сложно» и три дня злится' },
  { id: 'd_E2', who: 'E', intent: 'mehanizm', format: 'carousel', label: 'обесценивание в дружбе', topic: 'подруга пропадает на месяц, а потом пишет «никто никому ничего не должен»' },
  { id: 'd_E3', who: 'E', intent: 'uznavanie', format: 'reels_auto', topic: 'неудобно напомнить ему про долг в пятьсот рублей' },
  { id: 'd_E4', who: 'E', intent: 'obyasnenie', format: 'post', label: 'ярлык «слишком сложная»', topic: 'ей говорят «ты слишком сложная», когда она просит о простом' },
  { id: 'd_F1', who: 'F', intent: 'mif', format: 'carousel', label: 'тревожность', topic: '«просто подумай о хорошем» и что на самом деле происходит с тревогой' },
  { id: 'd_F2', who: 'F', intent: 'obyasnenie', format: 'carousel', topic: 'лежит ночью и прокручивает завтрашний разговор' },
  { id: 'd_F3', who: 'F', intent: 'mehanizm', format: 'reels_auto', label: 'тревожность', topic: 'прочитала про симптом и теперь проверяет пульс по десять раз в день' },
  { id: 'd_F4', who: 'F', intent: 'obyasnenie', format: 'post_tg', topic: 'почему после бессонной ночи кажется, что жизнь рушится' },
]

// Одни и те же темы у всех шести авторов (zh5d, мера одинаковости): у каждого автора своя подача и свой голос.
// Две карусели и рилс (в прогоне run-zh5d.ts; темы годятся и для поста). --set=shest
const SHEST: { id: string; intent: string; format: FormatCode; topic: string }[] = [
  { id: 's6_nagruzka', intent: 'uznavanie', format: 'carousel', topic: 'она держит в голове все дела семьи, а партнер говорит «ну скажи, что сделать»' },
  { id: 's6_status', intent: 'mehanizm', format: 'carousel', topic: 'встречаются полгода, а она до сих пор не знает, кто она ему' },
  { id: 's6_otkaz', intent: 'uznavanie', format: 'reels_auto', topic: 'не может отказать, а потом злится на себя весь вечер' },
]
export const TOPICS_SHEST: EvalRow[] = SHEST.flatMap(t => (['A', 'B', 'C', 'D', 'E', 'F'] as Who[]).map(who => ({ ...t, id: `${t.id}_${who}`, who })))
