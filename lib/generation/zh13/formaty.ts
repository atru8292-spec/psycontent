// zh13 (19.11, опыт ~/Downloads/psy-zh7, отчеты ZH11-ZH13-OTCHET.md): форматы, которые правда снимают живые психологи
// (разбор 104 рилсов), и подачи каруселей и постов из каталога находок. У каждого формата: имя для психолога, как он
// устроен словами для писателя (дословно из опыта zh11), подачи каталога, откуда берутся 2-3 живых образца, вид ответа.
// В базе generated_posts.format пишется старый код (reels_monolog, reels_scenka, reels_bez_slov, carousel, post), чтобы
// «Мои тексты», карусели и обложки работали как раньше; код формата zh13 лежит в check_result.zh13.kod.

export type Vid = 'reels' | 'carousel' | 'post'

export type Format13 = {
  kod: string
  vid: Vid
  imya: string            // как видит психолог
  korotko: string         // одна строка в «Все форматы»
  kak: string             // как устроен, для писателя
  podachi: string[]       // подачи каталога для образцов, по порядку предпочтения
  vyvod: 'reels' | 'sessiya' | 'scenka' | 'ekran' | 'carousel' | 'post'
  bazaFormat: string      // код для generated_posts.format
}

// хук «Просто мысли в камеру» по кругу: три живых начала из разбора (тезис против ожидания, «Если вы...», вопрос)
export const HUKI_MYSLI = [
  'Первая фраза: тезис против ожидания, с которым зритель не согласен с первой секунды; та же фраза крупно на экране в начале.',
  'Первая фраза начинается с «Если вы...» (или «Если ты...»): условие, в котором зритель узнает себя; она же крупно на экране в начале.',
  'Первая фраза: вопрос, который зритель задает себе сам; он же крупно на экране в начале. Дальше ответ.',
]

export const FORMATY: Format13[] = [
  { kod: 'mysl', vid: 'reels', imya: 'Просто мысль в камеру', korotko: 'Одна мысль, интересно поданная, без ролей и сценок',
    kak: 'монолог в камеру с одной мыслью. {huk} Дальше объясняешь одну эту мысль, без сценок и ролей',
    podachi: ['парадокс', 'разоблачение', 'миф и правда', 'признание', 'сравнение'], vyvod: 'reels', bazaFormat: 'reels_monolog' },
  { kod: 'sessiya', vid: 'reels', imya: 'Сессия на два окна', korotko: 'Кусок сессии: ты сверху, клиент снизу',
    kak: 'кусок сессии на экране из двух окон: психолог сверху, клиент снизу. Диалог по репликам. Психолог говорит мало и ведет вопросами, клиент говорит своими словами',
    podachi: ['сессия по ролям'], vyvod: 'sessiya', bazaFormat: 'reels_scenka' },
  { kod: 'scenka', vid: 'reels', imya: 'Сценка в двух ролях', korotko: 'Играешь двух людей из жизни, смена на каждую реплику',
    kak: 'сценка, где ты один играешь двух людей из жизни (не психолога и клиента), смена кадра на каждую реплику. Реплики сразу, без вступления; в конце резкая реплика, шутка или вопрос без ответа',
    podachi: ['сценка'], vyvod: 'scenka', bazaFormat: 'reels_scenka' },
  { kod: 'perevod', vid: 'reels', imya: 'Перевожу на человеческий', korotko: 'Фраза, которую говорят, и что она значит на самом деле',
    kak: 'рубрика «Перевожу с ... на человеческий»: фраза, которую говорят, и что она значит на самом деле. Несколько фраз по очереди',
    podachi: ['перевод «говорит / на самом деле»'], vyvod: 'reels', bazaFormat: 'reels_monolog' },
  { kod: 'voprosy', vid: 'reels', imya: 'Неудобные вопросы', korotko: 'Вопросы по одному, последний с переворотом',
    kak: 'рубрика сверху на весь ролик: «Задаю неудобные вопросы ... за вас» (кому, решаешь сам). Вопросы по одному, каждый с номером на экране, 5-7 вопросов разного устройства; последний вопрос с переворотом на себя',
    podachi: ['неудобные вопросы'], vyvod: 'reels', bazaFormat: 'reels_monolog' },
  { kod: 'kommentariy', vid: 'reels', imya: 'Ответ на комментарий', korotko: 'Вопрос из комментария на плашке и ответ в камеру',
    kak: 'ответ на комментарий подписчика: вопрос из комментария на плашке сверху (придумай вопрос, который правда пишут под такими роликами), дальше ответ в камеру',
    podachi: ['ответ на комментарий'], vyvod: 'reels', bazaFormat: 'reels_monolog' },
  { kod: 'ekran', vid: 'reels', imya: 'Текст на экране, без слов', korotko: 'Только надписи по очереди, говорить не нужно',
    kak: 'рилс без речи: только текст на экране по кадрам (карточки или мем). На кадре текста столько, сколько читается за 2-3 секунды, до 12 слов',
    podachi: ['текст на экране'], vyvod: 'ekran', bazaFormat: 'reels_bez_slov' },

  { kod: 'k_priznaki', vid: 'carousel', imya: 'Карусель: список признаков', korotko: 'Признаки, по которым человек узнает себя',
    kak: 'список признаков: по которым человек узнает себя', podachi: ['список признаков'], vyvod: 'carousel', bazaFormat: 'carousel' },
  { kod: 'k_nazvanie', vid: 'carousel', imya: 'Карусель: у этого есть название', korotko: 'Описываешь знакомое и называешь это',
    kak: '«у этого есть название»: описываешь то, что человек знает по себе, и называешь это', podachi: ['у этого есть название', 'список признаков'], vyvod: 'carousel', bazaFormat: 'carousel' },
  { kod: 'k_mif', vid: 'carousel', imya: 'Карусель: миф и правда', korotko: 'Расхожее мнение и как на самом деле',
    kak: 'миф и правда', podachi: ['миф и правда', 'сравнение', 'разоблачение'], vyvod: 'carousel', bazaFormat: 'carousel' },
  { kod: 'k_tak', vid: 'carousel', imya: 'Карусель: так не стоит / так стоит', korotko: 'Как обычно делают и как можно иначе',
    kak: '«так не стоит / так стоит»: две колонки, слева как обычно делают, справа как можно иначе', podachi: ['сравнение', 'миф и правда'], vyvod: 'carousel', bazaFormat: 'carousel' },
  { kod: 'k_tipy', vid: 'carousel', imya: 'Карусель: типы людей', korotko: 'Несколько узнаваемых типов',
    kak: 'типы людей: несколько узнаваемых типов', podachi: ['типы людей', 'список признаков'], vyvod: 'carousel', bazaFormat: 'carousel' },
  { kod: 'k_komiks', vid: 'carousel', imya: 'Карусель: комикс', korotko: 'Кадры с репликами героев',
    kak: 'комикс текстом: кадры с репликами героев', podachi: ['комикс', 'сценка'], vyvod: 'carousel', bazaFormat: 'carousel' },

  { kod: 'p_priznanie', vid: 'post', imya: 'Пост: признание', korotko: 'Честно о том, что психологу неловко сказать вслух',
    kak: 'признание: честно говоришь то, что психологу неловко сказать вслух (о профессии или о своем взгляде, без фактов своей жизни)', podachi: ['признание', 'парадокс'], vyvod: 'post', bazaFormat: 'post' },
  { kod: 'p_razoblachenie', vid: 'post', imya: 'Пост: разоблачение', korotko: 'Разбираешь расхожую фразу или совет',
    kak: 'разоблачение расхожей фразы или совета', podachi: ['разоблачение', 'парадокс'], vyvod: 'post', bazaFormat: 'post' },
  { kod: 'p_paradoks', vid: 'post', imya: 'Пост: парадокс', korotko: 'Мысль против ожидания и объяснение',
    kak: 'парадоксальная мысль и объяснение', podachi: ['парадокс'], vyvod: 'post', bazaFormat: 'post' },
  { kod: 'p_perevod', vid: 'post', imya: 'Пост: говорит и на самом деле', korotko: 'Что человек говорит и что это значит',
    kak: 'перевод: что говорит человек и что это значит на самом деле', podachi: ['перевод «говорит / на самом деле»', 'разоблачение', 'парадокс'], vyvod: 'post', bazaFormat: 'post' },
  { kod: 'p_antisovet', vid: 'post', imya: 'Пост: вредный совет', korotko: 'Вредный совет всерьез, по которому видно, как не надо',
    kak: 'антисовет: вредный совет всерьез, по которому видно, как не надо', podachi: ['антисовет', 'разоблачение', 'парадокс'], vyvod: 'post', bazaFormat: 'post' },
  { kod: 'p_voprosy', vid: 'post', imya: 'Пост: вопросы к себе', korotko: 'Несколько вопросов, которые читатель задаст себе',
    kak: 'вопросы к себе: несколько вопросов, которые читатель может задать себе', podachi: ['вопросы к себе', 'неудобные вопросы'], vyvod: 'post', bazaFormat: 'post' },
]

export const formatPo = (kod: string): Format13 | undefined => FORMATY.find(f => f.kod === kod)
export const KODY = FORMATY.map(f => f.kod)

// «Подбери сам»: по кругу, как в опыте zh11 (на 16 текстов 10 рилсов, 3 карусели, 3 поста); два последних формата
// психолога пропускаются
export const KRUG_AUTO = ['mysl', 'sessiya', 'k_priznaki', 'scenka', 'perevod', 'p_paradoks', 'mysl', 'voprosy', 'k_nazvanie',
  'kommentariy', 'sessiya', 'p_priznanie', 'ekran', 'mysl', 'k_mif', 'perevod', 'p_razoblachenie', 'scenka']
export function vybratAuto(n: number, poslednie: string[]): string {
  for (let i = 0; i < KRUG_AUTO.length; i++) {
    const k = KRUG_AUTO[(n + i) % KRUG_AUTO.length]
    if (!poslednie.slice(0, 2).includes(k)) return k
  }
  return 'mysl'
}

// запасная тройка «Подойдет еще», если модель не дала своей: соседи по виду
export const ZAPAS: Record<string, string[]> = {
  reels: ['sessiya', 'k_priznaki', 'perevod', 'mysl', 'scenka'],
  carousel: ['mysl', 'p_paradoks', 'sessiya', 'k_priznaki'],
  post: ['mysl', 'k_priznaki', 'sessiya', 'p_paradoks'],
}
