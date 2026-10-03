'use client'
/** @jsxRuntime automatic */
import type { ReactNode } from 'react'
// Выбор вида Reels на экране «Сделать». Психолог не блогер, поэтому каждый вид показан картинкой
// «что будет в кадре» (маленький телефон), одной фразой о том, что она делает, и двумя метками:
// нужно ли лицо и нужен ли монтаж. Виды из разбора 71 рилса (карточки в 03-PROMPTY.md).

export type ReelsMode = {
  id: string
  label: string
  what: string
  face: string
  edit: string
}

export const REELS_MODES: ReelsMode[] = [
  { id: 'reels', label: 'Подбери сама', what: 'Выберу по смыслу и так, чтобы ролики в ленте не повторялись.', face: '', edit: '' },
  { id: 'reels_otvet', label: 'Отвечаю на вопрос', what: 'Вопрос, который тебе часто задают, и твой ответ. С него проще всего начать.', face: '', edit: '' },
  { id: 'reels_monolog', label: 'Объясняю одну вещь', what: 'Фраза, которую говорят клиенты, и что за ней стоит. Как кусочек консультации.', face: '', edit: '' },
  { id: 'reels_spisok', label: 'Перечисляю приметы', what: '3-5 примет «как это бывает», в конце «сколько совпало». Их пересылают близким.', face: '', edit: '' },
  { id: 'reels_istoriya', label: 'Рассказываю о себе', what: 'Случай из твоей жизни или работы и что ты поняла. Только то, что ты сама рассказала в профиле.', face: '', edit: '' },
  { id: 'reels_poslanie', label: 'Говорю важные слова', what: 'Обращаешься к зрителю, как к клиенту в трудный вечер. Такие сохраняют и пересматривают.', face: '', edit: '' },
  { id: 'reels_scenka', label: 'Сценка на двоих', what: 'Играешь обе роли: ты и клиентка, ты и твой внутренний критик. Для второй роли надеваешь очки или кофту.', face: 'Две роли', edit: 'Склеить куски' },
  { id: 'reels_rol', label: 'Играю персонажа', what: 'Одна роль всерьез до абсурда: учительница на родительском собрании, оператор службы поддержки.', face: 'Лицо в кадре', edit: 'Без монтажа' },
  { id: 'reels_doska', label: 'Рисую и объясняю', what: 'Говоришь и рисуешь маркером на листе: кружки и стрелки. Рисовать уметь не надо.', face: 'Можно без лица', edit: 'Без монтажа' },
  { id: 'reels_bez_slov', label: 'Видео без лица, с надписями', what: 'Снимаешь чашку, окно или руки, а смысл идет надписями поверх. Говорить ничего не нужно.', face: 'Без лица', edit: 'Надписи в Instagram' },
]

export const REELS_GROUPS: { title: string; note: string; ids: string[] }[] = [
  { title: 'Просто говоришь в камеру', note: 'Ставишь телефон и говоришь, как на консультации. Монтаж не нужен', ids: ['reels_otvet', 'reels_monolog', 'reels_spisok', 'reels_istoriya', 'reels_poslanie'] },
  { title: 'Играешь роль', note: 'Смешнее, такие чаще пересылают', ids: ['reels_scenka', 'reels_rol'] },
  { title: 'Если не хочется говорить в камеру', note: '', ids: ['reels_doska', 'reels_bez_slov'] },
]

// ---------- картинки: что будет в кадре ----------
const C = { bg: '#F7F3EC', ink: '#2E2A45', acc: '#5B4FA0', soft: '#E7E2F2', sage: '#8F9D68', line: '#D8D0E4' }

function Person({ x = 30, y = 58, r = 9, glasses = false }: { x?: number; y?: number; r?: number; glasses?: boolean }) {
  return (
    <g>
      <path d={`M${x - r * 2} ${y + r * 3.2} Q${x - r * 2} ${y + r * 1.3} ${x} ${y + r * 1.3} Q${x + r * 2} ${y + r * 1.3} ${x + r * 2} ${y + r * 3.2} Z`} fill={C.acc} opacity={0.85} />
      <circle cx={x} cy={y} r={r} fill={C.soft} stroke={C.ink} strokeWidth={1.2} />
      {glasses && (
        <g stroke={C.ink} strokeWidth={1} fill="none">
          <circle cx={x - r * 0.4} cy={y} r={r * 0.28} />
          <circle cx={x + r * 0.4} cy={y} r={r * 0.28} />
          <path d={`M${x - r * 0.12} ${y} H${x + r * 0.12}`} />
        </g>
      )}
    </g>
  )
}

const Subs = ({ y = 84 }: { y?: number }) => (
  <g fill={C.ink} opacity={0.55}>
    <rect x={14} y={y} width={32} height={2.5} rx={1.2} />
    <rect x={18} y={y + 5} width={24} height={2.5} rx={1.2} />
  </g>
)

const Plate = ({ w = 36, y = 12, fill = C.acc }: { w?: number; y?: number; fill?: string }) => (
  <g>
    <rect x={30 - w / 2} y={y} width={w} height={11} rx={3} fill={fill} />
    <rect x={30 - w / 2 + 4} y={y + 3} width={w - 8} height={2} rx={1} fill="#fff" />
    <rect x={30 - w / 2 + 4} y={y + 6.5} width={(w - 8) * 0.6} height={2} rx={1} fill="#fff" />
  </g>
)

const SCENES: Record<string, ReactNode> = {
  reels: (
    <g>
      <path d="M30 30 L33 42 L45 45 L33 48 L30 60 L27 48 L15 45 L27 42 Z" fill={C.acc} />
      <path d="M44 22 L45.5 27 L50 28.5 L45.5 30 L44 35 L42.5 30 L38 28.5 L42.5 27 Z" fill={C.sage} />
      <path d="M17 64 L18 67.5 L21.5 68.5 L18 69.5 L17 73 L16 69.5 L12.5 68.5 L16 67.5 Z" fill={C.sage} />
    </g>
  ),
  reels_otvet: (
    <g>
      <rect x={10} y={12} width={40} height={16} rx={5} fill="#fff" stroke={C.line} />
      <path d="M22 28 L20 33 L27 28 Z" fill="#fff" stroke={C.line} />
      <text x={30} y={24} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.acc}>?</text>
      <Person y={50} />
      <Subs />
    </g>
  ),
  reels_monolog: (
    <g>
      <Plate />
      <Person y={48} />
      <Subs />
    </g>
  ),
  reels_spisok: (
    <g>
      <Plate w={30} />
      <Person x={24} y={48} r={8} />
      {[0, 1, 2].map(i => (
        <g key={i}>
          <circle cx={47} cy={40 + i * 12} r={4.5} fill={i === 2 ? C.acc : C.soft} stroke={C.acc} strokeWidth={1} />
          <text x={47} y={42.3 + i * 12} textAnchor="middle" fontSize={6} fontWeight={700} fill={i === 2 ? '#fff' : C.acc}>{i + 1}</text>
        </g>
      ))}
      <Subs />
    </g>
  ),
  reels_istoriya: (
    <g>
      <Plate fill={C.sage} />
      <Person y={48} />
      <text x={45} y={42} fontSize={14} fontWeight={700} fill={C.acc}>«</text>
      <Subs />
    </g>
  ),
  reels_poslanie: (
    <g>
      <Person y={46} r={12} />
      <rect x={10} y={76} width={40} height={14} rx={4} fill={C.soft} />
      <rect x={14} y={80} width={32} height={2.2} rx={1} fill={C.acc} />
      <rect x={14} y={84.5} width={22} height={2.2} rx={1} fill={C.acc} />
      <path d="M44 12 h7 v10 l-3.5 -2.5 l-3.5 2.5 Z" fill={C.sage} />
    </g>
  ),
  reels_scenka: (
    <g>
      <Person x={18} y={46} r={7} />
      <Person x={42} y={46} r={7} glasses />
      <path d="M26 30 h8 M31 27 l3 3 l-3 3" stroke={C.ink} strokeWidth={1.2} fill="none" />
      <text x={18} y={33} textAnchor="middle" fontSize={7} fontWeight={700} fill={C.acc}>А</text>
      <text x={42} y={33} textAnchor="middle" fontSize={7} fontWeight={700} fill={C.acc}>Б</text>
      <Subs y={80} />
    </g>
  ),
  reels_rol: (
    <g>
      <rect x={12} y={12} width={36} height={11} rx={2} fill={C.ink} />
      <rect x={16} y={16} width={28} height={2.2} rx={1} fill="#fff" />
      <Person y={50} />
      <path d="M20 51 A10 10 0 0 1 40 51" stroke={C.ink} strokeWidth={1.6} fill="none" />
      <rect x={18} y={48} width={4} height={7} rx={1.5} fill={C.ink} />
      <rect x={38} y={48} width={4} height={7} rx={1.5} fill={C.ink} />
      <path d="M20 55 Q21 60 26 60" stroke={C.ink} strokeWidth={1.2} fill="none" />
      <circle cx={26.5} cy={60} r={1.4} fill={C.ink} />
      <Subs />
    </g>
  ),
  reels_doska: (
    <g>
      <rect x={9} y={20} width={42} height={52} rx={2} fill="#fff" stroke={C.line} />
      <circle cx={22} cy={34} r={6} fill="none" stroke={C.acc} strokeWidth={1.4} />
      <circle cx={39} cy={54} r={6} fill="none" stroke={C.acc} strokeWidth={1.4} />
      <path d="M26 39 L34 49 M34 49 l-4 -0.5 M34 49 l-0.5 -4" stroke={C.ink} strokeWidth={1.3} fill="none" />
      <path d="M44 62 L54 80" stroke={C.sage} strokeWidth={3} strokeLinecap="round" />
      <Subs y={84} />
    </g>
  ),
  reels_bez_slov: (
    <g>
      <rect x={10} y={14} width={40} height={12} rx={3} fill="#fff" stroke={C.line} />
      <rect x={14} y={17.5} width={30} height={2.2} rx={1} fill={C.ink} />
      <rect x={14} y={21} width={20} height={2.2} rx={1} fill={C.ink} />
      <path d="M20 50 h18 v16 a6 6 0 0 1 -6 6 h-6 a6 6 0 0 1 -6 -6 Z" fill={C.soft} stroke={C.ink} strokeWidth={1.2} />
      <path d="M38 54 h3 a4 4 0 0 1 0 8 h-3" fill="none" stroke={C.ink} strokeWidth={1.2} />
      <path d="M25 44 q2 -3 0 -6 M31 44 q2 -3 0 -6" stroke={C.ink} strokeWidth={1} fill="none" opacity={0.5} />
      <rect x={10} y={80} width={40} height={10} rx={3} fill={C.acc} />
      <rect x={14} y={84} width={28} height={2.2} rx={1} fill="#fff" />
    </g>
  ),
}

export function ReelsScene({ id, className = '' }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 60 100" className={className} aria-hidden="true">
      <rect x={1} y={1} width={58} height={98} rx={8} fill={C.bg} stroke={C.ink} strokeWidth={1.5} />
      {SCENES[id] || SCENES.reels}
    </svg>
  )
}

export default function ReelsFormatPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const card = (id: string) => {
    const m = REELS_MODES.find(x => x.id === id)!
    const on = value === id
    return (
      <button type="button" key={id} onClick={() => onChange(id)} aria-pressed={on}
        className={`flex items-start gap-3 text-left rounded-2xl border p-2.5 transition cursor-pointer ${on ? 'border-brand-accent bg-brand-soft ring-1 ring-brand-accent' : 'border-brand-border bg-white hover:border-brand-accent'}`}>
        <ReelsScene id={id} className="w-[46px] h-[77px] shrink-0" />
        <span className="min-w-0 pt-0.5">
          <span className={`block text-sm font-semibold leading-snug ${on ? 'text-brand-accent' : 'text-brand-text'}`}>{m.label}</span>
          <span className="block text-xs text-brand-muted leading-snug mt-1">{m.what}</span>
          {(m.face || m.edit) && (
            <span className="flex flex-wrap gap-1 mt-1.5">
              {[m.face, m.edit].filter(Boolean).map(t => (
                <span key={t} className="px-1.5 py-0.5 rounded-md bg-brand-bg text-[11px] text-brand-muted border border-brand-border">{t}</span>
              ))}
            </span>
          )}
        </span>
      </button>
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-brand-text">Как тебе удобнее снять? Не знаешь, оставь «Подбери сама».</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{card('reels')}</div>
      {REELS_GROUPS.map(g => (
        <div key={g.title} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
            {g.title}{g.note && <span className="normal-case tracking-normal font-normal">, {g.note.charAt(0).toLowerCase() + g.note.slice(1)}</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{g.ids.map(id => card(id))}</div>
        </div>
      ))}
    </div>
  )
}
