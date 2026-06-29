// Разделение сгенерированного поста на заголовок-вывеску и тело.
//
// Движок (generate-post) для формата «пост» выводит строго: первая строка это
// заголовок, потом пустая строка, потом тело. Здесь мы это разбираем для рендера
// (заголовок жирным + Squiggle, тело отдельно), как в демо на лендинге.
//
// Заголовок принимается только если выглядит как вывеска, а не как первая строка
// сцены-хука. Старые посты (без структуры) и кривой вывод сами падают в режим
// «без заголовка»: тело отдается целиком, ничего не ломается.
//
// Для сторис (там [Экран N]) и любого не-post формата заголовок не выделяется.

export type SplitPost = { title: string | null; body: string }

export function splitPostTitle(content: string, format?: string): SplitPost {
  const raw = typeof content === 'string' ? content : ''
  const normalized = raw.replace(/\r\n/g, '\n').trim()

  // Заголовок-вывеску выделяем только для текстового поста.
  if (format !== 'post') {
    return { title: null, body: normalized }
  }

  // Структура: первая строка, пустая строка, тело. Без пустой строки-разделителя
  // не трогаем (старый пост без заголовка).
  const m = normalized.match(/^(.+?)\n\s*\n([\s\S]+)$/)
  if (!m) {
    return { title: null, body: normalized }
  }

  const head = m[1].trim()
  const body = m[2].trim()

  const words = head.split(/\s+/).filter(Boolean).length
  const looksLikeTitle =
    head.length > 0 &&
    body.length > 0 &&
    words <= 7 &&
    head.length <= 70 &&
    !/[.!?…]$/.test(head) &&        // у живого заголовка нет терминальной пунктуации
    !/^[«"'\[(]/.test(head) &&      // цитата-хук или маркер экрана, не заголовок
    !/^\[?\s*экран/i.test(head)     // двойная страховка от [Экран N]

  if (!looksLikeTitle) {
    return { title: null, body: normalized }
  }

  return { title: head, body }
}
