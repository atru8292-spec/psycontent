'use client'
// zh6-prod: клиентская часть страницы предпросмотра /dev/zh6 (только разработка). Секция выбирается ?s=..., чтобы снимать
// каждый экран отдельно: composer, plan, golova, scenka, bezslov, karusel, post, post_tg, stories, popravit, zhh7
import { useSearchParams } from 'next/navigation'
import Composer from '@/components/make/Composer'
import FormatPane, { type PaneItem } from '@/components/make/FormatPane'
import { formatByCode } from '@/lib/generation/zh6/formaty'

const TIP: Record<string, string> = { reels_monolog: 'reels', reels_scenka: 'reels', reels_bez_slov: 'reels', post: 'post', post_tg: 'post_tg', carousel: 'carousel', stories: 'stories' }

// постоянный массив, как useMemo в MakeFlow: новый массив на каждый рендер сбрасывал бы выбор форматов
const REELS = ['reels' as const]

export default function Preview({ data }: { data: any }) {
  const s = useSearchParams().get('s') || 'golova'
  const pane = (code: string, text: string, formatName?: string, vid?: string) => {
    const item: PaneItem = { format: TIP[code] || 'post', code, postId: null, text, baseline: text, publishedAt: null, formatName, vid }
    return <FormatPane item={item} onChange={() => {}} onPublished={() => {}} onMore={() => {}} />
  }
  return (
    <main className="min-h-[100dvh] bg-brand-bg px-4 pt-4 pb-[calc(56px+88px)] lg:pb-8 max-w-2xl mx-auto">
      {s === 'composer' && (
        <Composer firstTime={false} topics={[]} busy={false} onSubmit={s => { (window as any).__zh6Submit = s }} initialText={data.plan[1]?.tema} initialFormats={REELS} plan={{ formatKod: data.plan[1]?.format, forFormat: 'reels', rol: data.plan[1]?.zadacha, reakciya: data.plan[1]?.reakciya }} />
      )}
      {s === 'plan' && (
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-brand-text">План тем</h1>
          {data.plan.map((t: any) => (
            <div key={t.n} className="rounded-2xl bg-white border border-brand-border p-3">
              <p className="text-[13px] text-brand-text-secondary">День {t.n} · {formatByCode(t.format)?.name || t.format}</p>
              <p className="text-[15px] text-brand-text">{t.tema}</p>
            </div>
          ))}
        </div>
      )}
      {['golova', 'scenka', 'bezslov', 'karusel', 'post', 'post_tg', 'stories'].includes(s) && data.materialy[s] && pane(data.materialy[s].format, data.materialy[s].text, data.materialy[s].formatName, data.materialy[s].formatKod)}
      {s === 'popravit' && data.popravit && pane('reels_scenka', data.popravit.posle, 'Сценка: я и мой внутренний голос (после «Поправить»)')}
      {s === 'zhh7' && data.zhh7 && pane(data.zhh7.format, data.zhh7.text)}
    </main>
  )
}
