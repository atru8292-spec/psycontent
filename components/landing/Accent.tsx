// Выделение слова плашкой-маркером (решение Арины 16.11: маркер вместо рукописной линии, сила «обычная»).
// Полоса закрывает нижнюю часть слова: тень внутрь (без градиента), ровно от первой до последней буквы (без отступов),
// в соседние строки не выходит (рисуется внутри строки слова), при переносе каждая строка получает свою целую полосу
// (box-decoration-break: clone), концы чуть скруглены (border-radius). Текст поверх шоколадный.
// Заголовок на креме: сирень знака, полоса на нижние 42% строки (текст на ней 6.4:1).
// Подписи манер на бледной сирени: сирень темнее (токен brand-lilac-mid, текст 5.4:1) и полоса толще, нижние 55%:
// шрифт там мелкий (17 px), и с той же долей полоса читалась тоньше, чем в заголовке.
const STYLE = {
  title: { color: 'var(--color-brand-lilac)', height: '0.42em' },
  label: { color: 'var(--color-brand-lilac-mid)', height: '0.55em' },
}

export default function Accent({ children, where }: { children: React.ReactNode; where: 'title' | 'label' }) {
  const s = STYLE[where]
  return (
    <mark className="rounded-[0.18em] bg-transparent text-brand-text [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
      style={{ boxShadow: `inset 0 -${s.height} 0 ${s.color}` }}>{children}</mark>
  )
}
