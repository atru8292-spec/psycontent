// Выделение слова плашкой-маркером (решение Арины 16.11: маркер вместо рукописной линии, сила «обычная»).
// Полоса закрывает нижнюю часть слова: тень внутрь (без градиента), ровно от первой до последней буквы (без отступов),
// в соседние строки не выходит (рисуется внутри строки слова), при переносе каждая строка получает свою целую полосу
// (box-decoration-break: clone), концы чуть скруглены (border-radius). Текст поверх шоколадный.
// На креме (заголовок первого экрана): сирень знака brand-lilac, полоса на нижние 42% строки, текст на ней 6.4:1.
// На сиреневом фоне (подписи манер и другие места на сирени): шалфей brand-sage, текст на нем 4.7:1 (не ниже 4.5);
// полоса толще, нижние 55%: шрифт там мелкий (17 px), иначе на глаз тоньше, чем в заголовке.
// Темно-зеленый brand-accent под текстом не использовать (решение Арины 16.11).
// span, а не mark: выделение чисто визуальное, mark скринридеры зачитывают как «выделено» прямо в заголовке.
const STYLE = {
  cream: { color: 'var(--color-brand-lilac)', height: '0.42em' },
  lilac: { color: 'var(--color-brand-sage)', height: '0.55em' },
}

export default function Accent({ children, on }: { children: React.ReactNode; on: 'cream' | 'lilac' }) {
  const s = STYLE[on]
  return (
    <span className="rounded-[0.18em] bg-transparent text-brand-text [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
      style={{ boxShadow: `inset 0 -${s.height} 0 ${s.color}` }}>{children}</span>
  )
}
