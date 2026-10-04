'use client'

// Один формат в результате «Сделать» (вкладка). Текст своего формата и те же действия, что у результата нового
// мозга: правка руками, «Поправить» (теплее, короче, живее, без клише, другой заход), «Это мое / Не похоже»,
// вставка своего вместо [добавь: ...], «Опубликовала». Липкая панель над таб-баром: Скопировать, Поправить, •••.
// Обучение голосу: правки перед копированием уходят в /api/voice-events (как на старом экране).

import { useState } from 'react'
import { Check, Copy, PenTool, MoreHorizontal, Loader2 } from 'lucide-react'
import { splitPostTitle } from '@/lib/post-format'
import Squiggle from '@/components/Squiggle'
import ReelsScript from '@/components/ReelsScript'
import CaptionBlock, { splitCaption } from '@/components/CaptionBlock'
import CarouselDesigner from '@/components/CarouselDesigner'
import PostCover from '@/components/PostCover'
import BottomSheet from './BottomSheet'
import { useDashboardMe } from '@/lib/dashboard-me'

export type PaneItem = {
  format: string          // формат экрана: reels, carousel, post, post_tg, stories
  code: string            // код материала: reels_monolog, post_tg...
  postId: string | null
  text: string
  baseline: string        // последняя версия от сервиса (для обучения на правках)
  publishedAt: string | null
}

const ADJUST = [
  { id: 'теплее', label: 'Сделать теплее' },
  { id: 'короче', label: 'Сделать короче' },
  { id: 'живее', label: 'Сделать живее' },
  { id: 'без клише', label: 'Убрать клише' },
]
const NOT_LIKE_REASONS = ['слишком умно', 'слишком сладко', 'не мои слова', 'длинно', 'не та тема']
const PLACEHOLDER_RE = /\[добавь:[^\]]*\]/g

const sendVoiceEvent = (payload: Record<string, unknown>) =>
  fetch('/api/voice-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})

function replaceFirstLine(text: string, line: string): string {
  const lines = text.split('\n')
  const i = lines.findIndex(l => l.trim())
  if (i < 0) return text
  const m = lines[i].match(/^(\s*\[?(?:Слайд|Экран)\s*\d+\]?\s*:?\s*)/i)
  lines[i] = (m ? m[1] : '') + line
  return lines.join('\n')
}

// Серия сторис: «Экран N:», под ним «Снять:», «Надпись:», «Стикер:»; в конце «Что делать с ответами:»
function StoriesView({ text }: { text: string }) {
  const blocks: { n: string; rows: [string, string][] }[] = []
  let tail = ''
  for (const raw of text.split('\n')) {
    const l = raw.trim()
    if (!l) continue
    const scr = l.match(/^Экран\s*(\d+)\s*:?\s*(.*)$/iu)
    if (scr) { blocks.push({ n: scr[1], rows: scr[2] ? [['Надпись', scr[2]]] : [] }); continue }
    const lab = l.match(/^(Снять|Надпись|Стикер)\s*:\s*(.*)$/iu)
    if (lab && blocks.length) { blocks[blocks.length - 1].rows.push([lab[1], lab[2]]); continue }
    const fin = l.match(/^Что делать с ответами\s*:\s*(.*)$/iu)
    if (fin) { tail = fin[1]; continue }
    if (blocks.length) blocks[blocks.length - 1].rows.push(['', l])
  }
  if (!blocks.length) return <p className="text-[16px] leading-[26px] text-brand-text whitespace-pre-wrap break-words">{text}</p>
  return (
    <div className="space-y-3">
      {blocks.map(b => (
        <div key={b.n} className="rounded-2xl bg-brand-soft-2 px-4 py-3">
          <p className="text-[13px] font-semibold text-brand-muted">Экран {b.n}</p>
          {b.rows.map(([k, v], i) => (
            <p key={i} className={`mt-1 text-[15px] leading-6 break-words ${k === 'Надпись' ? 'text-brand-text font-semibold' : 'text-brand-text-secondary'}`}>
              {k && k !== 'Надпись' && <span className="text-brand-muted">{k}: </span>}{v}
            </p>
          ))}
        </div>
      ))}
      {tail && <p className="text-[15px] leading-6 text-brand-text-secondary"><span className="text-brand-muted">Что делать с ответами: </span>{tail}</p>}
    </div>
  )
}

export default function FormatPane({ item, onChange, onPublished, onMore }: {
  item: PaneItem
  onChange: (patch: Partial<PaneItem>) => void
  onPublished: (at: string | null) => void
  onMore: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [fixOpen, setFixOpen] = useState(false)
  const [adjusting, setAdjusting] = useState<string | null>(null)
  const [hooks, setHooks] = useState<{ hook_type: string; text: string; why: string }[] | null>(null)
  const [reaction, setReaction] = useState<'mine' | 'not_like' | null>(null)
  const [notLikeOpen, setNotLikeOpen] = useState(false)
  const [reasons, setReasons] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [phValues, setPhValues] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastReported, setLastReported] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // пока поле в фокусе (таб-бар уехал под клавиатуру), липкую панель тоже прячем, иначе она висит в воздухе
  const { typing } = useDashboardMe()

  const { text, code, postId } = item
  const parsed = splitPostTitle(text, code)
  const body = parsed?.body ?? text
  const placeholders = Array.from(new Set(text.match(PLACEHOLDER_RE) || []))

  const copy = () => {
    if (postId && item.baseline && lastReported !== text) {
      setLastReported(text)
      sendVoiceEvent({ action: 'copy', postId, generated: item.baseline, copied: text })
    }
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => { setError('Не получилось скопировать. Нажми на текст и выдели вручную') })
  }

  const adjust = async (action: string) => {
    if (!postId || adjusting) return
    setAdjusting(action); setError(null)
    try {
      const r = await fetch('/api/generate-post/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, action, text }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error()
      if (action === 'hooks') { if (Array.isArray(d.hooks)) setHooks(d.hooks) }
      else if (typeof d.post === 'string') onChange({ text: d.post, baseline: d.post })
      if (action !== 'hooks') { setFixOpen(false); setDone('Поправила'); setTimeout(() => setDone(null), 2500) }
    } catch {
      setError('Не получилось поправить. Текст на месте, попробуй еще раз')
    } finally { setAdjusting(null) }
  }

  const pickHook = (h: { hook_type: string; text: string }) => {
    const first = text.split('\n').find(l => l.trim()) || ''
    sendVoiceEvent({ action: 'hook_pick', postId, before: first, after: h.text, hookType: h.hook_type })
    onChange({ text: replaceFirstLine(text, h.text), baseline: replaceFirstLine(item.baseline, h.text) })
    setHooks(null); setFixOpen(false)
  }

  const react = (kind: 'mine' | 'not_like') => {
    if (!postId) return
    setReaction(kind); setNotLikeOpen(false)
    sendVoiceEvent({ action: kind, postId, reasons: kind === 'not_like' ? reasons : [], note: kind === 'not_like' ? note : '' })
  }

  const togglePublished = async () => {
    if (!postId) return
    const undo = !!item.publishedAt
    const at = undo ? null : new Date().toISOString()
    onPublished(at)
    try {
      const r = await fetch('/api/generate-post/published', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, undo }) })
      if (!r.ok) onPublished(item.publishedAt)
    } catch { onPublished(item.publishedAt) }
  }

  const pubDate = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : ''

  return (
    <div className="pb-4">
      <div className="rounded-2xl bg-brand-card border border-brand-border p-4 sm:p-5">
        {editing ? (
          <textarea value={text} onChange={e => onChange({ text: e.target.value })} autoFocus aria-label="Текст"
            rows={Math.min(24, Math.max(8, text.split('\n').length + 2))}
            className="w-full px-3 py-2.5 rounded-xl border border-brand-border bg-white text-brand-text text-[16px] leading-relaxed focus:outline-none focus:border-brand-accent resize-y" />
        ) : (
          <>
            {parsed?.title && (
              <div className="mb-3">
                <h3 className="text-lg font-bold text-brand-text leading-snug break-words">{parsed.title}</h3>
                <Squiggle variant={0} width="140px" />
              </div>
            )}
            {code.startsWith('reels') ? (
              <ReelsScript text={text} format={code} mark={t => t} />
            ) : code === 'stories' ? (
              <StoriesView text={text} />
            ) : (
              <div className="space-y-3">
                {splitCaption(body).body.split(/\n{2,}/).map((p, i) => (
                  <p key={i} className="text-[16px] leading-[26px] text-brand-text whitespace-pre-wrap break-words">{p}</p>
                ))}
                <CaptionBlock caption={splitCaption(body).caption} title={code === 'carousel' ? 'Описание под каруселью' : 'Описание к публикации'} />
              </div>
            )}
          </>
        )}

        {editing && (
          <button type="button" onClick={() => setEditing(false)} className="mt-3 h-11 px-5 rounded-xl bg-brand-accent text-white font-semibold cursor-pointer">Готово</button>
        )}

        {placeholders.length > 0 && !editing && (
          <div className="mt-4 rounded-xl bg-brand-soft px-3 py-3 space-y-2">
            <p className="text-[14px] text-brand-text">Тут нужно твое, я не стала выдумывать. Впиши, и я вставлю в текст:</p>
            {placeholders.map(ph => (
              <div key={ph} className="flex gap-2">
                <input value={phValues[ph] || ''} onChange={e => setPhValues({ ...phValues, [ph]: e.target.value })}
                  placeholder={ph.replace(/^\[добавь:\s*/, '').replace(/\]$/, '')}
                  className="min-w-0 flex-1 h-11 px-3 rounded-lg border border-brand-border bg-white text-[16px] text-brand-text focus:outline-none focus:border-brand-accent" />
                <button type="button" onClick={() => { const v = (phValues[ph] || '').trim(); if (v) onChange({ text: text.split(ph).join(v) }) }}
                  className="h-11 px-3 rounded-lg text-[14px] font-semibold text-brand-accent border border-brand-accent/40 cursor-pointer shrink-0">Вставить</button>
              </div>
            ))}
          </div>
        )}

        {error && !fixOpen && <p className="mt-3 text-[14px] text-brand-text" role="status">{error}</p>}
        {done && <p className="mt-3 text-[14px] text-brand-muted" role="status">{done}</p>}

        {/* Опубликовала: у каждого формата своя отметка */}
        {postId && !editing && (
          <button type="button" role="switch" aria-checked={!!item.publishedAt} onClick={togglePublished}
            className="mt-4 h-11 inline-flex items-center gap-2 text-[15px] text-brand-text cursor-pointer">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${item.publishedAt ? 'bg-brand-accent border-brand-accent' : 'border-brand-muted'}`}>
              {item.publishedAt && <Check className="w-3.5 h-3.5 text-white" />}
            </span>
            {item.publishedAt ? `Опубликовала ${pubDate}` : 'Опубликовала'}
          </button>
        )}

        {postId && !editing && (
          reaction ? (
            <p className="mt-2 text-[13px] text-brand-muted">{reaction === 'mine' ? 'Отлично, беру такие за образец.' : 'Поняла, учту в следующих текстах.'}</p>
          ) : (
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-x-4 text-[14px]">
                <button type="button" onClick={() => react('mine')} className="h-11 text-brand-text-secondary hover:text-brand-accent cursor-pointer">Это мое</button>
                <button type="button" onClick={() => setNotLikeOpen(!notLikeOpen)} className="h-11 text-brand-text-secondary hover:text-brand-accent cursor-pointer">Не похоже на меня</button>
              </div>
              {notLikeOpen && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {NOT_LIKE_REASONS.map(r => (
                      <button key={r} type="button" aria-pressed={reasons.includes(r)} onClick={() => setReasons(reasons.includes(r) ? reasons.filter(x => x !== r) : [...reasons, r])}
                        className={`h-11 px-4 rounded-full text-[14px] cursor-pointer ${reasons.includes(r) ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text-secondary'}`}>{r}</button>
                    ))}
                  </div>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Или своими словами, что не так"
                    className="w-full h-11 px-3 rounded-lg border border-brand-border bg-white text-[16px] text-brand-text focus:outline-none focus:border-brand-accent" />
                  <button type="button" disabled={!reasons.length && !note.trim()} onClick={() => react('not_like')}
                    className="h-11 px-5 rounded-xl text-[14px] font-semibold text-white bg-brand-accent disabled:opacity-40 cursor-pointer">Учесть</button>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* оформление карусели и обложка поста, как на старом экране */}
      {postId && !editing && code === 'carousel' && <div className="mt-4"><CarouselDesigner postId={postId} text={text} onTextChange={t => onChange({ text: t })} /></div>}
      {postId && !editing && code === 'post' && <div className="mt-4"><PostCover key={postId} postId={postId} text={text} /></div>}

      {/* липкая панель над таб-баром; пока текст правится, ее нет */}
      {!editing && !typing && (
        <div className="fixed inset-x-0 z-30 bottom-[calc(56px+env(safe-area-inset-bottom))] bg-brand-card border-t border-brand-border lg:sticky lg:bottom-0 lg:mt-4 lg:border lg:rounded-2xl">
          <div className="max-w-[560px] mx-auto flex items-center gap-2 p-2">
            <button type="button" onClick={copy} className="flex-1 h-12 rounded-2xl bg-brand-accent text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Скопировала' : 'Скопировать'}
            </button>
            <button type="button" onClick={() => setFixOpen(true)} disabled={!postId} className="flex-1 h-12 rounded-2xl border border-brand-border text-brand-text font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40">
              <PenTool className="w-4 h-4" />Поправить
            </button>
            <button type="button" onClick={onMore} aria-label="Еще действия" className="w-12 h-12 rounded-2xl border border-brand-border text-brand-text inline-flex items-center justify-center cursor-pointer shrink-0">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <BottomSheet open={fixOpen} onClose={() => { setFixOpen(false); setHooks(null) }} title="Поправить">
        {hooks ? (
          <div className="space-y-2 pt-1">
            <p className="text-[14px] text-brand-muted">Выбери первую строку, я поставлю ее вместо текущей:</p>
            {hooks.map((h, i) => (
              <button key={i} type="button" onClick={() => pickHook(h)} className="w-full text-left px-4 py-3 rounded-xl border border-brand-border bg-white hover:border-brand-accent cursor-pointer">
                <span className="block text-[15px] text-brand-text break-words">{h.text}</span>
                {h.why && <span className="block text-[13px] text-brand-muted mt-0.5">{h.why}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="pt-1">
            {/* действия строками, как в листе «•••»: пилюли тут читались бы как выбор */}
            {ADJUST.map(a => (
              <button key={a.id} type="button" disabled={!!adjusting} onClick={() => adjust(a.id)}
                className="w-full h-[52px] flex items-center gap-2 text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-50">
                {adjusting === a.id && <Loader2 className="w-4 h-4 animate-spin" />}{a.label}
              </button>
            ))}
            {!code.startsWith('reels_scenka') && (
              <button type="button" disabled={!!adjusting} onClick={() => adjust('hooks')}
                className="w-full h-[52px] flex items-center gap-2 text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-50">
                {adjusting === 'hooks' && <Loader2 className="w-4 h-4 animate-spin" />}Другой заход
              </button>
            )}
            {error && <p className="py-2 text-[14px] text-brand-text" role="status">{error}</p>}
            <button type="button" onClick={() => { setFixOpen(false); setEditing(true) }} className="mt-2 w-full h-12 rounded-2xl border border-brand-border text-[16px] text-brand-text cursor-pointer">Править руками</button>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
