// ───────────────────────────────────────────────────────────────────────────
// ОБЕЗЛИЧИВАНИЕ ПЕРЕД AI (152-ФЗ). ВРЕМЕННАЯ версия на JS-правилах.
// ⚠️ К ЗАПУСКУ обязательно spaCy (ru_core_news_lg) — JS-правила ловят контакты
// надёжно и частые имена, но не все фамилии/редкие имена/сложные склонения.
// На живых психологах с реальными данными клиентов на одних JS-правилах нельзя.
//
// Идея: перед отправкой в OpenAI заменяем личные данные на заглушки
// ([ИМЯ-1], [ТЕЛЕФОН-1], [ПОЧТА-1], [КОНТАКТ-1]); после ответа возвращаем обратно
// (и психолога, и клиентов) — готовый текст видит только психолог.
// ───────────────────────────────────────────────────────────────────────────

export interface AnonMap { [placeholder: string]: string }

// Частые русские имена (муж/жен). Список заведомо неполный — это старт.
const RU_NAMES = [
  'Александр', 'Александра', 'Алексей', 'Анатолий', 'Андрей', 'Анна', 'Антон',
  'Анастасия', 'Алла', 'Алёна', 'Алина', 'Артём', 'Артем', 'Борис', 'Вадим',
  'Валентина', 'Валерий', 'Валерия', 'Варвара', 'Василий', 'Вера', 'Виктор',
  'Виктория', 'Виталий', 'Владимир', 'Владислав', 'Галина', 'Геннадий', 'Глеб',
  'Григорий', 'Дарья', 'Денис', 'Дмитрий', 'Евгений', 'Евгения', 'Егор',
  'Екатерина', 'Елена', 'Елизавета', 'Жанна', 'Зинаида', 'Иван', 'Игорь',
  'Илья', 'Инна', 'Ирина', 'Камила', 'Карина', 'Кирилл', 'Клавдия', 'Константин',
  'Кристина', 'Ксения', 'Лариса', 'Леонид', 'Лидия', 'Любовь', 'Людмила',
  'Максим', 'Маргарита', 'Марина', 'Мария', 'Марк', 'Матвей', 'Михаил',
  'Надежда', 'Наталья', 'Наталия', 'Никита', 'Николай', 'Нина', 'Олег', 'Ольга',
  'Оксана', 'Павел', 'Пётр', 'Петр', 'Полина', 'Раиса', 'Роман', 'Руслан',
  'Светлана', 'Семён', 'Семен', 'Сергей', 'София', 'Софья', 'Станислав',
  'Степан', 'Тамара', 'Татьяна', 'Тимофей', 'Тимур', 'Ульяна', 'Фёдор', 'Федор',
  'Эдуард', 'Юлия', 'Юрий', 'Яна', 'Ярослав',
]

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Корень имени (для ловли склонений: Анна → Анн → Анны/Анне/Анну/Анной).
function nameStem(n: string): string {
  const s = n.replace(/[аяйь]$/i, '')
  return s.length >= 3 ? s : n
}

const NAME_STEMS = Array.from(new Set(RU_NAMES.map(nameStem)))
  .filter(s => s.length >= 3)
  .sort((a, b) => b.length - a.length)

// ВАЖНО: в JS \b не работает с кириллицей, поэтому границы слова задаём явно
// через lookbehind/lookahead (нет буквы/цифры по краям). Регистр учитываем:
// имена всегда с заглавной, нарицательные в нижнем регистре не трогаем.
const BOUND = '[А-Яа-яЁёA-Za-z0-9_]'
// Имя + опционально следующее слово с заглавной (фамилия): «Анна Соколова».
const NAME_RE = new RegExp(
  '(?<!' + BOUND + ')(' + NAME_STEMS.map(escapeRe).join('|') + ')[а-яё]{0,3}(?:\\s+[А-ЯЁ][а-яё]+)?(?!' + BOUND + ')',
  'g'
)
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE_RE = /(?:\+7|8|7)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/g
const LINK_RE = /\b(?:t\.me|instagram\.com|vk\.com|wa\.me|wb\.ru|youtube\.com|youtu\.be|tiktok\.com)\/[^\s]+/gi
const HANDLE_RE = /(^|[\s(])@[A-Za-z0-9_.]{2,}/g

const LABEL: Record<string, string> = { name: 'ИМЯ', phone: 'ТЕЛЕФОН', email: 'ПОЧТА', handle: 'КОНТАКТ' }

export function anonymize(text: string): { masked: string; map: AnonMap } {
  if (!text || typeof text !== 'string') return { masked: text, map: {} }
  const map: AnonMap = {}
  const counters: Record<string, number> = {}

  const put = (kind: string, value: string): string => {
    const found = Object.entries(map).find(([, v]) => v === value)
    if (found) return found[0]
    counters[kind] = (counters[kind] || 0) + 1
    const ph = `[${LABEL[kind]}-${counters[kind]}]`
    map[ph] = value
    return ph
  }

  let masked = text
  // Сначала контакты (надёжно), потом имена.
  masked = masked.replace(EMAIL_RE, m => put('email', m))
  masked = masked.replace(LINK_RE, m => put('handle', m))
  masked = masked.replace(PHONE_RE, m => put('phone', m))
  masked = masked.replace(HANDLE_RE, (m, pre) => pre + put('handle', m.slice(pre.length)))
  // Имена — только с заглавной буквы (нарицательные в нижнем регистре не трогаем).
  masked = masked.replace(NAME_RE, m => (/^[А-ЯЁ]/.test(m) ? put('name', m) : m))

  return { masked, map }
}

export function deanonymize(text: string, map: AnonMap): string {
  if (!text || !map) return text
  let out = text
  for (const [ph, val] of Object.entries(map)) {
    out = out.split(ph).join(val)
  }
  return out
}

// Для потокового ответа: вернуть восстановленный текст, НЕ отдавая «хвост» с
// недописанной заглушкой (например «...[ИМ» в конце ещё не пришедшего куска).
export function safeRestoredPrefix(maskedSoFar: string, map: AnonMap): string {
  const restored = deanonymize(maskedSoFar, map)
  const lastOpen = restored.lastIndexOf('[')
  if (lastOpen === -1) return restored
  const closeAfter = restored.indexOf(']', lastOpen)
  if (closeAfter === -1) return restored.slice(0, lastOpen) // придержать недописанную заглушку
  return restored
}
