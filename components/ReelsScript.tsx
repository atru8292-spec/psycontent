'use client'
// Результат Reels на экране «Сделать»: сначала сам текст (что сказать или что написать на экране), потом подсказки
// к съемке и подпись под роликом. Модель отдает сценарий с метками (карточки форматов в 03-PROMPTY.md),
// тут метки переводятся на понятный психологу язык. Правка текста идет как раньше, в textarea целиком.
//
// Виды zh6: reels_monolog (голова в кадре), reels_scenka (в блоке «Речь:» реплики «Я:», «Психолог:»,
// «Внутренний голос:» и т.п., ремарки в скобках), reels_bez_slov («Текст на экране:», экраны разделены строкой
// [смена], потом «Подпись:»). Старые материалы (А:/Б:, «Экран N:», «Кадр:») показываются как раньше.
import { track } from '@/lib/track'
import { useState, type ReactNode } from 'react'
import { Copy, Check, Video, ChevronDown } from 'lucide-react'
import CaptionBlock from './CaptionBlock'
import { gruppaOf } from '@/lib/generation/zh6/gruppy'
import { KARTY } from './make/vid-cards'

type Line = { label: string | null; text: string; role?: string; smena?: boolean }

// Виды, которые выбирает генерация. Внутренние коды говорящих роликов сведены в один вид «Говоришь в камеру».
const KIND: Record<string, { name: string; how: string }> = {
  reels_monolog: { name: 'Говоришь в камеру', how: 'Смотришь в камеру и говоришь текст ниже. Можно читать с телефона, держа его рядом с камерой.' },
  reels_otvet: { name: 'Говоришь в камеру', how: 'Смотришь в камеру и отвечаешь на вопрос с надписи. Текст можно читать с телефона.' },
  reels_poslanie: { name: 'Говоришь в камеру', how: 'Смотришь в камеру и говоришь зрителю напрямую, спокойно, как подруге. Текст можно читать с телефона.' },
  reels_istoriya: { name: 'Говоришь в камеру', how: 'Рассказываешь свою историю в камеру, одним куском. Текст можно читать с телефона.' },
  reels_spisok: { name: 'Список', how: 'Говоришь в камеру по пунктам. Номер пункта добавь надписью в Instagram, когда начинаешь новый.' },
  reels_rol: { name: 'Играешь роль', how: 'Говоришь от лица персонажа с серьезным лицом, это шутка. Такие ролики чаще пересылают.' },
  reels_malysh: { name: 'Объясняю как маленькому', how: 'Говоришь в камеру ласково и медленно, как ребенку, про взрослую штуку. Серьезное лицо и детские слова, в этом весь эффект. Если в тексте есть «Рисую», рисуй на листе по ходу.' },
  reels_bez_slov: { name: 'Только надписи', how: 'Говорить не нужно. Сними, как пьешь чай, идешь по улице или просто смотришь в камеру. Звук убери или поставь музыку, а надписи ниже наложи на видео по очереди.' },
  reels_scenka: { name: 'Сценка', how: 'Все роли твои. Сними реплики каждого героя по очереди: для другой роли хватит повернуться, надеть очки или пересесть. Потом склей по порядку в CapCut или в Instagram.' },
  reels_doska: { name: 'Рисуешь и объясняешь', how: 'Говоришь и рисуешь схему на листе или доске по подсказкам ниже.' },
}

const LABEL = /^(Текст на экране|Крупно на экране|Итог на схеме|Кадр|Речь|Подпись|Персонажи|Рисую|Экран\s*\d+|[АБAB](?:\s*\([^)]{1,40}\))?)\s*:\s*/u
// Роль в сценке: в начале строки, с заглавной, до трех слов, можно с пометкой в скобках («Мама (тихо):»).
// Ищется только внутри блока «Речь» у reels_scenka, чтобы «Знаешь что: ...» посреди монолога не стал ролью.
const ROLE = /^([А-ЯЁA-Z][а-яёa-z-]*(?:\s+[а-яёА-ЯЁa-zA-Z-]+){0,2}(?:\s*\([^)]{1,40}\))?)\s*:\s+(\S.*)$/u
const SMENA = /^\[\s*смена\s*\]$/iu
const SERVICE = new Set(['Текст на экране', 'Крупно на экране', 'Итог на схеме', 'Кадр', 'Речь', 'Подпись', 'Персонажи', 'Рисую'])
const roleKey = (r: string) => r.replace(/\s*\(.*$/u, '')

// Подсказки к съемке, не текст ролика
const HOW_TO: Record<string, string> = {
  'Текст на экране': 'Надпись на весь ролик',  // остальные метки больше не приходят, но старые ролики их содержат
  'Кадр': 'Где и как снять',
  'Крупно на экране': 'Слово крупно на экране',
  'Итог на схеме': 'Что получится на листе',
  'Персонажи': 'Роли',
}

function parse(text: string, format?: string): Line[] {
  const out: Line[] = []
  const scenka = format === 'reels_scenka'
  // у сценки без метки «Речь:» реплики начинаются сразу
  let block: string | null = scenka && !/(^|\n)\s*Речь\s*:/u.test(text) ? 'Речь' : null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { out.push({ label: null, text: '' }); continue }
    if (SMENA.test(line)) { out.push({ label: null, text: '', smena: true }); continue }
    const m = line.match(LABEL)
    let l: Line = m ? { label: m[1], text: line.slice(m[0].length) } : { label: null, text: line }
    if (l.label && SERVICE.has(l.label)) block = l.label
    if (l.label && /^[АБAB]/u.test(l.label)) l = { label: null, text: l.text, role: l.label }
    else if (scenka && block === 'Речь' && (!l.label || l.label === 'Речь')) {
      const r = l.text.match(ROLE)
      if (r && !SERVICE.has(r[1])) l = { label: null, text: r[2], role: r[1] }
    }
    out.push(l)
  }
  return out
}

// Надпись беззвучного рилса: строки после «Текст на экране:» до следующей метки, экраны по [смена]
function screenGroups(lines: Line[]): string[][] | null {
  const start = lines.findIndex(l => l.label === 'Текст на экране')
  if (start < 0) return null
  const groups: string[][] = [[]]
  if (lines[start].text) groups[0].push(lines[start].text)
  for (const l of lines.slice(start + 1)) {
    if (l.label) break
    if (l.smena) { groups.push([]); continue }
    if (l.text) groups[groups.length - 1].push(l.role ? `${l.role}: ${l.text}` : l.text)
  }
  const res = groups.filter(g => g.length)
  return res.length ? res : null
}

// Текст для копирования: только то, что говорится или пишется на экране по ходу ролика.
// У беззвучного рилса это вся надпись, экраны подряд через пустую строку, без [смена].
export function reelsSpeech(text: string, format?: string): string {
  const lines = parse(text, format)
  if (format === 'reels_bez_slov') {
    const g = screenGroups(lines)
    if (g) return g.map(x => x.join('\n')).join('\n\n')
  }
  const res: string[] = []
  let inCaption = false
  for (const l of lines) {
    if (l.label === 'Подпись') { inCaption = true; continue }
    if (l.label && (HOW_TO[l.label] || l.label === 'Рисую')) { inCaption = false; continue }
    if (inCaption || l.smena) continue
    if (l.role) res.push(`${l.role}: ${l.text}`)
    else if (l.label && /^Экран/u.test(l.label)) res.push(l.text)
    else if (l.text) res.push(l.text)
  }
  return res.join('\n').trim()
}

// Ремарки в скобках «(смеется)» тише основного текста
function withRemarks(s: string, mark: (s: string) => ReactNode): ReactNode {
  const parts = s.split(/(\([^()]{1,60}\))/u)
  if (parts.length === 1) return mark(s)
  return parts.map((p, i) => (/^\(.*\)$/u.test(p)
    ? <span key={i} className="italic text-brand-muted">{p}</span>
    : <span key={i}>{mark(p)}</span>))
}

function MoreOnScreen() {
  return (
    <p className="flex items-center gap-2 text-xs text-brand-muted">
      <span className="h-px flex-1 bg-brand-border" />дальше на экране<span className="h-px flex-1 bg-brand-border" />
    </p>
  )
}

export default function ReelsScript({ text, mark, format, postId, title, vid }: {
  text: string
  mark: (s: string) => ReactNode
  format?: string
  postId?: string | null
  title?: string // имя формата от генератора («Сценка: я и мой внутренний голос»), если пришло
  vid?: string   // zh6: код вида каталога; по нему карточка «как снять» та же, что в листе выбора на «Сделать»
}) {
  const lines = parse(text, format)
  const kind = format ? KIND[format] : undefined
  const kv = vid ? gruppaOf(vid) : null
  const karta = kv && kv.tip === 'reels' ? KARTY.reels[kv.g.id] : undefined
  const subName = karta && vid ? karta.sub?.[vid]?.[0] : undefined
  const [copied, setCopied] = useState(false)
  const [kakOpen, setKakOpen] = useState(false)
  const bezSlov = format === 'reels_bez_slov'
  const screens = bezSlov ? screenGroups(lines) : null

  const howTo = lines.filter(l => l.label && HOW_TO[l.label] && !(screens && l.label === 'Текст на экране'))
  // подпись: строка «Подпись:» и все строки без метки после нее
  const capIdx = lines.findIndex(l => l.label === 'Подпись')
  const caption = capIdx >= 0
    ? [lines[capIdx].text, ...lines.slice(capIdx + 1).filter(l => !l.label).map(l => l.text)].filter(Boolean).join('\n')
    : ''
  const body = lines.filter((l, i) => (capIdx < 0 || i < capIdx) && !(l.label && HOW_TO[l.label]))
  // реплики второй, четвертой роли сдвигаются вправо, чтобы смена голоса была видна глазом
  const roleOrder: string[] = []
  for (const l of body) if (l.role && !roleOrder.includes(roleKey(l.role))) roleOrder.push(roleKey(l.role))

  const copySpeech = () => {
    navigator.clipboard.writeText(reelsSpeech(text, format))
    track('material_take', { how: 'copy_text', format: 'reels', ...(postId ? { post: postId } : {}) })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      {karta ? (
        // zh6: тот же «как снять», что в карточке вида на «Сделать». Свернут в одну строку, чтобы сам текст был
        // на первом экране; кремовый, не сиреневый: сиреневая только плашка, которую копируют
        <div className="rounded-xl bg-brand-bg border border-brand-border">
          <button type="button" aria-expanded={kakOpen} onClick={() => setKakOpen(o => !o)}
            className="w-full min-h-11 px-4 py-2 flex items-center gap-2 text-left cursor-pointer">
            <Video className="w-4 h-4 text-brand-muted shrink-0" />
            <span className="min-w-0 flex-1 text-sm text-brand-text break-words">
              <span className="font-semibold">Как снять</span>
              <span className="text-brand-muted"> · {karta.title}{subName ? ` · ${subName.charAt(0).toLowerCase()}${subName.slice(1)}` : ''} · {karta.how.time}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-brand-muted shrink-0 transition ${kakOpen ? 'rotate-180' : ''}`} />
          </button>
          {kakOpen && (
            <div className="px-4 pb-3">
              <ol className="list-decimal pl-5 space-y-1 text-sm text-brand-text marker:text-brand-muted">
                {karta.how.steps.map((st, n) => <li key={n}>{st}</li>)}
              </ol>
              <p className="mt-1.5 text-[13px] text-brand-muted">Понадобится: {karta.how.need.charAt(0).toLowerCase()}{karta.how.need.slice(1)}</p>
            </div>
          )}
        </div>
      ) : (kind || title) && (
        <div className="rounded-xl bg-brand-soft/60 px-4 py-3">
          <p className="text-sm font-semibold text-brand-text break-words">{title || kind?.name}</p>
          {kind && <p className="text-sm text-brand-text-secondary">{kind.how}</p>}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[13px] font-semibold text-brand-muted">{bezSlov && screens ? 'Что написать на экране' : 'Что сказать'}</p>
          <button type="button" onClick={copySpeech}
            className="min-h-11 -my-3 inline-flex items-center gap-1.5 text-xs text-brand-muted hover:text-brand-accent cursor-pointer shrink-0">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Скопировала' : 'Скопировать текст'}
          </button>
        </div>

        {screens ? (
          <div className="space-y-3">
            {/* номер на плашке уже говорит, что это следующая надпись, разделитель между ними не нужен */}
            {screens.map((g, i) => (
              <div key={i} className="rounded-xl bg-brand-soft-2 px-4 py-3">
                {screens.length > 1 && <p className="mb-1 text-xs text-brand-muted">Надпись {i + 1}</p>}
                {g.map((t, j) => <p key={j} className="text-[15px] leading-relaxed text-brand-text break-words">{mark(t)}</p>)}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {body.map((l, i) => {
              if (l.smena) return <MoreOnScreen key={i} />
              if (!l.label && !l.text && !l.role) return <div key={i} className="h-2" />
              if (l.label === 'Рисую') {
                return <p key={i} className="text-sm italic text-brand-accent pl-3 border-l-2 border-brand-soft">рисуешь: {mark(l.text)}</p>
              }
              if (l.label && /^Экран/u.test(l.label)) {
                return (
                  <p key={i} className="text-[15px] leading-relaxed text-brand-text">
                    <span className="mr-2 text-xs font-semibold text-brand-accent">{l.label.replace('Экран', 'Надпись')}</span>{mark(l.text)}
                  </p>
                )
              }
              if (l.role) {
                const idx = roleOrder.indexOf(roleKey(l.role))
                return (
                  <p key={i} className={`text-[15px] leading-relaxed break-words text-brand-text ${idx % 2 === 1 ? 'ml-3 pl-3 border-l-2 border-brand-border' : ''}`}>
                    <span className="mr-1.5 font-semibold text-brand-accent">{l.role}:</span>{withRemarks(l.text, mark)}
                  </p>
                )
              }
              if (l.label === 'Речь' && !l.text) return null
              return <p key={i} className="text-[15px] leading-relaxed text-brand-text-secondary break-words">{withRemarks(l.text, mark)}</p>
            })}
          </div>
        )}
      </div>

      {howTo.length > 0 && (
        <div className="rounded-xl bg-brand-soft/60 px-4 py-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-muted"><Video className="w-3.5 h-3.5" /> Как снять</p>
          {howTo.map((l, i) => (
            <p key={i} className="text-sm text-brand-text break-words">
              <span className="text-brand-muted">{HOW_TO[l.label!]}: </span>{mark(l.text)}
            </p>
          ))}
        </div>
      )}

      <CaptionBlock caption={caption} title="Описание под рилсом" mark={mark} format={format} postId={postId} />
    </div>
  )
}
