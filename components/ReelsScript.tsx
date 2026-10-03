'use client'
// Результат Reels на экране «Сделать»: сначала сам текст (что сказать), потом подсказки к съемке
// и подпись под роликом. Модель отдает сценарий с метками (карточки форматов в 03-PROMPTY.md),
// тут метки переводятся на понятный психологу язык. Правка текста идет как раньше, в textarea целиком.
import { useState, type ReactNode } from 'react'
import { Copy, Check, Video } from 'lucide-react'
import CaptionBlock from './CaptionBlock'

type Line = { label: string | null; text: string }

// Четыре вида, которые выбирает генерация (решение 01.10): в камеру, два голоса, список, роль. Внутренние коды
// говорящих роликов сведены в один вид. Без слов и доска остались только для старых материалов.
const KIND: Record<string, { name: string; how: string }> = {
  reels_monolog: { name: 'Говоришь в камеру', how: 'Смотришь в камеру и говоришь текст ниже. Можно читать с телефона, держа его рядом с камерой.' },
  reels_otvet: { name: 'Говоришь в камеру', how: 'Смотришь в камеру и отвечаешь на вопрос с надписи. Текст можно читать с телефона.' },
  reels_poslanie: { name: 'Говоришь в камеру', how: 'Смотришь в камеру и говоришь зрителю напрямую, спокойно, как подруге. Текст можно читать с телефона.' },
  reels_istoriya: { name: 'Говоришь в камеру', how: 'Рассказываешь свою историю в камеру, одним куском. Текст можно читать с телефона.' },
  reels_spisok: { name: 'Список', how: 'Говоришь в камеру по пунктам. Номер пункта добавь надписью в Instagram, когда начинаешь новый.' },
  reels_rol: { name: 'Играешь роль', how: 'Говоришь от лица персонажа с серьезным лицом, это шутка. Такие ролики чаще пересылают.' },
  reels_malysh: { name: 'Объясняю как маленькому', how: 'Говоришь в камеру ласково и медленно, как ребенку, про взрослую штуку. Серьезное лицо и детские слова, в этом весь эффект. Если в тексте есть «Рисую», рисуй на листе по ходу.' },
  reels_bez_slov: { name: 'Без слов, только надписи', how: 'Говорить не нужно. Сними себя или что угодно рядом, а надписи с экранов ниже ставь по очереди поверх видео.' },
  reels_scenka: { name: 'Два голоса', how: 'Играешь обе роли сама. Сними все реплики А, потом переоденься или надень очки и сними реплики Б. Склей по очереди в CapCut или в Instagram.' },
  reels_doska: { name: 'Рисуешь и объясняешь', how: 'Говоришь и рисуешь схему на листе или доске по подсказкам ниже.' },
}

const LABEL = /^(Текст на экране|Крупно на экране|Итог на схеме|Кадр|Речь|Подпись|Персонажи|Рисую|Экран\s*\d+|[АБAB](?:\s*\([^)]{1,40}\))?)\s*:\s*/u

// Подсказки к съемке, не текст ролика
const HOW_TO: Record<string, string> = {
  'Текст на экране': 'Надпись на весь ролик',  // остальные метки больше не приходят, но старые ролики их содержат
  'Кадр': 'Где и как снять',
  'Крупно на экране': 'Слово крупно на экране',
  'Итог на схеме': 'Что получится на листе',
  'Персонажи': 'Роли',
}

function parse(text: string): Line[] {
  const out: Line[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { out.push({ label: null, text: '' }); continue }
    const m = line.match(LABEL)
    out.push(m ? { label: m[1], text: line.slice(m[0].length) } : { label: null, text: line })
  }
  return out
}

// Текст для копирования: только то, что говорится или пишется на экране по ходу ролика
export function reelsSpeech(text: string): string {
  const lines = parse(text)
  const res: string[] = []
  let inCaption = false
  for (const l of lines) {
    if (l.label === 'Подпись') { inCaption = true; continue }
    if (l.label && (HOW_TO[l.label] || l.label === 'Рисую')) { inCaption = false; continue }
    if (inCaption) continue
    if (l.label && /^[АБAB]/u.test(l.label)) res.push(`${l.label}: ${l.text}`)
    else if (l.label && /^Экран/u.test(l.label)) res.push(l.text)
    else if (l.text) res.push(l.text)
  }
  return res.join('\n').trim()
}

export default function ReelsScript({ text, mark, format }: { text: string; mark: (s: string) => ReactNode; format?: string }) {
  const lines = parse(text)
  const kind = format ? KIND[format] : undefined
  const [copied, setCopied] = useState(false)

  const howTo = lines.filter(l => l.label && HOW_TO[l.label])
  // подпись: строка «Подпись:» и все строки без метки после нее
  const capIdx = lines.findIndex(l => l.label === 'Подпись')
  const caption = capIdx >= 0
    ? [lines[capIdx].text, ...lines.slice(capIdx + 1).filter(l => !l.label).map(l => l.text)].filter(Boolean).join('\n')
    : ''
  const body = lines.filter((l, i) => (capIdx < 0 || i < capIdx) && !(l.label && HOW_TO[l.label]))

  const copySpeech = () => {
    navigator.clipboard.writeText(reelsSpeech(text))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      {kind && (
        <div className="rounded-xl bg-brand-soft/60 px-4 py-3">
          <p className="text-sm font-semibold text-brand-text">{kind.name}</p>
          <p className="text-sm text-brand-text-secondary">{kind.how}</p>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Что сказать</p>
          <button type="button" onClick={copySpeech}
            className="inline-flex items-center gap-1.5 text-xs text-brand-muted hover:text-brand-accent cursor-pointer">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Скопировала' : 'Скопировать только текст'}
          </button>
        </div>
        <div className="space-y-1.5">
          {body.map((l, i) => {
            if (!l.label && !l.text) return <div key={i} className="h-2" />
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
            if (l.label && /^[АБAB]/u.test(l.label)) {
              const who = l.label[0]
              return (
                <p key={i} className={`text-[15px] leading-relaxed ${who === 'Б' || who === 'B' ? 'pl-4 text-brand-text-secondary' : 'text-brand-text'}`}>
                  <span className="mr-2 text-xs font-semibold text-brand-accent">{l.label}</span>{mark(l.text)}
                </p>
              )
            }
            return <p key={i} className="text-[15px] leading-relaxed text-brand-text-secondary">{mark(l.text)}</p>
          })}
        </div>
      </div>

      {howTo.length > 0 && (
        <div className="rounded-xl bg-brand-soft/60 px-4 py-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-muted"><Video className="w-3.5 h-3.5" /> На экране</p>
          {howTo.map((l, i) => (
            <p key={i} className="text-sm text-brand-text">
              <span className="text-brand-muted">{HOW_TO[l.label!]}: </span>{mark(l.text)}
            </p>
          ))}
        </div>
      )}

      <CaptionBlock caption={caption} title="Описание под рилсом" mark={mark} />
    </div>
  )
}
