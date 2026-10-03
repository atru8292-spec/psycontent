'use client'
// Обложка к текстовому посту в Instagram: картинка идет первой, текст поста в подписи.
// П8 дает три надписи, психолог выбирает или правит, код рисует ее в шаблоне карусели одним слайдом.
// Цвета и узор берутся из ее настроек каруселей (профиль), как у каруселей.
import { useState } from 'react'
import { Loader2, Download, Shuffle, ImageIcon } from 'lucide-react'
import { STYLES, TEMPLATE_STYLES, VARIANTS, type TemplateStyle } from '@/lib/carousel/styles'

type Cover = { text: string; why: string }

export default function PostCover({ postId, text }: { postId: string; text: string }) {
  const [covers, setCovers] = useState<Cover[] | null>(null)
  const [coverText, setCoverText] = useState('')
  const [style, setStyle] = useState<TemplateStyle>('t_redakciya')
  const [variant, setVariant] = useState(0)
  const [loading, setLoading] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/generate-post/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action: 'cover', text }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Не получилось')
      setCovers(d.covers)
      setCoverText(d.covers[0]?.text || '')
      setImgLoading(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const clean = coverText.replace(/\s+/g, ' ').trim().slice(0, 120)
  const url = (dl = false) =>
    `/api/carousel/preview?style=${style}&single=1&variant=${variant}&cover=${encodeURIComponent(clean)}${dl ? '&dl=1' : ''}`

  if (!covers) {
    return (
      <div className="rounded-2xl border border-brand-border bg-white p-4 sm:p-5 space-y-2">
        <p className="text-sm font-semibold text-brand-text">Обложка к посту</p>
        <p className="text-xs text-brand-muted">В Instagram пост идет с картинкой, и по ней решают, читать ли дальше. Придумаю надпись и нарисую обложку в твоих цветах.</p>
        <button type="button" onClick={ask} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-60 cursor-pointer">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />} {loading ? 'Придумываю' : 'Сделать обложку'}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4 sm:p-5 space-y-4">
      <p className="text-sm font-semibold text-brand-text">Обложка к посту</p>

      <div className="space-y-2">
        <p className="text-xs text-brand-muted">Надпись: выбери или поправь</p>
        <div className="flex flex-wrap gap-2">
          {covers.map(c => (
            <button key={c.text} type="button" title={c.why} onClick={() => { setCoverText(c.text); setImgLoading(true) }}
              className={`px-3 py-1.5 rounded-full text-sm border transition cursor-pointer text-left ${clean === c.text ? 'bg-brand-accent text-white border-brand-accent' : 'bg-white text-brand-text-secondary border-brand-border hover:border-brand-accent'}`}
            >{c.text}</button>
          ))}
        </div>
        <input value={coverText} onChange={e => setCoverText(e.target.value)} onBlur={() => setImgLoading(true)} maxLength={120}
          className="w-full px-3 py-2 rounded-xl border border-brand-border text-sm text-brand-text focus:outline-none focus:border-brand-accent" />
      </div>

      <div className="space-y-2">
        <p className="text-xs text-brand-muted">Стиль</p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_STYLES.map(s => (
            <button key={s} type="button" onClick={() => { setStyle(s); setImgLoading(true) }}
              className={`px-2.5 py-1 rounded-full text-xs border transition cursor-pointer ${style === s ? 'border-brand-text text-brand-text bg-brand-soft' : 'border-brand-border text-brand-text-secondary hover:border-brand-accent'}`}
            >{STYLES[s].label}</button>
          ))}
        </div>
      </div>

      {clean && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="relative w-full max-w-[260px] aspect-[3/4] rounded-xl overflow-hidden border border-brand-border bg-brand-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url()} alt="Обложка" className="w-full h-full object-cover" onLoad={() => setImgLoading(false)} onError={() => setImgLoading(false)} />
            {imgLoading && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="w-5 h-5 animate-spin text-brand-muted" /></div>}
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => { setVariant((variant + 1) % VARIANTS); setImgLoading(true) }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border border-brand-border text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent cursor-pointer">
              <Shuffle className="w-4 h-4" /> Другая компоновка
            </button>
            <a href={url(true)} download="oblozhka.png"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover cursor-pointer">
              <Download className="w-4 h-4" /> Скачать PNG
            </a>
            <p className="text-xs text-brand-muted max-w-[220px]">Цвета и фон как в твоих каруселях, поменять их можно в оформлении любой карусели.</p>
          </div>
        </div>
      )}
    </div>
  )
}
