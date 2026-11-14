// Главная psycont.ru. Тексты: components/landing/content.ts, примеры генератора: components/landing/examples.ts,
// тарифы: lib/pricing.ts (один источник с витриной в настройках). Интерактив и аналитика лендинга (land_*)
// в клиентских частях components/landing. Демо «впиши мысль» снято: после онбординга «Сделать» открывается
// с темой дня, и мысль из демо до первого поста не доходила (правка в онбординге или MakeFlow, см. отчет 04.10). Страница серверная: первый экран приходит готовым HTML.
// Вид (v2, 05.10, референсы в _знания/lending-refy): соседние блоки всегда разного фона, в каждом блоке
// один «бумажный» прием (components/landing/Paper.tsx), декор только вырезками из public/dekor, 3 предмета на страницу.
import type { Metadata } from 'next'
import Image from 'next/image'
import LandingShell, { CtaButton, HeroCta } from '@/components/landing/LandingShell'
import Header from '@/components/landing/Header'
import ReelCard from '@/components/landing/ReelCard'
import Faq from '@/components/landing/Faq'
import ClampText from '@/components/landing/ClampText'
import PainBoard from '@/components/landing/PainBoard'
import { Wave, HandUnderline, MarginNote, Dekor } from '@/components/landing/Paper'
import { HERO, PAINS, HOW, EXAMPLE, WHY, ETHICS, PRICING, FAQ, FINAL, FOOTER, CONTACT_EMAIL, PRIVACY_URL, OFFER_URL } from '@/components/landing/content'
import { EXAMPLES, COMPARE_TOPIC, COMPARE_CHATGPT, COMPARE_PSYCONT } from '@/components/landing/examples'
import { jsonLdString } from '@/lib/structured-data'
import { PLANS, PLAN_COMMON_LINE, MATERIAL_NOTE, formatRub, planPerks } from '@/lib/pricing'

// Год в подвале берется из даты сборки; пересобираем страницу раз в сутки, чтобы он сменился сам
export const revalidate = 86400

// canonical только у главной (в layout он унаследовался бы всем страницам)
export const metadata: Metadata = { alternates: { canonical: '/' } }

const WRAP = 'mx-auto w-full max-w-[1120px] px-4 md:px-8'
const SECTION = 'py-9 lg:py-24'
const H2 = 'text-[27px] font-bold leading-[1.15] text-brand-text [text-wrap:balance] lg:text-[38px]'
const TEXT = 'text-[17px] leading-[1.55] lg:text-[19px]'

// Шаги по нарастанию тона (крем с рамкой, бледная сирень, зеленый)
const STEP_CARD = [
  'border border-brand-border bg-brand-card text-brand-text',
  'bg-brand-soft text-brand-text lg:mt-12',
  'bg-brand-accent text-brand-bg lg:mt-24',
]

// Карточки подачи: легкие повороты, на десктопе разная высота старта
const MANNER_CARD = [
  'rotate-[-1.2deg] pt-1 lg:pt-2',
  'rotate-[0.8deg] lg:mt-12',
  'rotate-[-0.4deg] lg:mt-5',
]

// Тарифы тоже по нарастанию тона: крем, бледная сирень, белая с зеленой рамкой. Метку «популярный» не ставим, пока нет данных
const PLAN_CARD = [
  'border border-brand-border bg-brand-bg',
  'border border-brand-border-soft bg-brand-soft-2',
  'border-[1.5px] border-brand-accent bg-brand-card',
]

// Снимок во всю ширину рамки, лишнее уходит только снизу: бока экрана не режем
function PhoneShot({ src, alt, w, h }: { src: string; alt: string; w: number; h: number }) {
  return (
    <div className="w-[232px] rounded-[36px] lg:w-full lg:max-w-[280px] border border-brand-border bg-brand-card p-2">
      <div className="aspect-[375/600] overflow-hidden rounded-[28px] border border-brand-border bg-brand-bg">
        <Image src={src} alt={alt} width={w} height={h} sizes="(min-width: 1024px) 264px, 216px" className="block h-auto w-full" />
      </div>
    </div>
  )
}

export default function Home() {
  const year = new Date().getFullYear()
  return (
    <LandingShell>
      {/* JSON-LD для поисковиков и нейросетей: lib/structured-data.ts (цены из lib/pricing.ts, FAQ из того же источника, что на странице) */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString() }} />
      <Header />
      <main className="overflow-x-clip">
        {/* 1. Первый экран, крем: заголовок в два веса с рукописным штрихом на «блогерскую часть», одна кнопка
            (кнопка шапки скрыта, пока эта на экране). На 375 и 390 заголовок, подзаголовок и кнопка видны без прокрутки. Вера ниже кнопки */}
        <section className={`${WRAP} pt-5 lg:grid lg:grid-cols-12 lg:gap-8 lg:pt-14`}>
          <div className="lg:col-span-8 lg:self-center lg:pb-24">
            <h1 className="max-w-[780px] text-[30px] font-medium leading-[1.15] tracking-[-0.01em] text-brand-text min-[390px]:text-[31px] lg:text-[44px]">
              <span className="block font-bold">{HERO.titleBold}</span>
              <span className="relative inline-block whitespace-nowrap">{HERO.titleMark}<HandUnderline draw /></span>{' '}{HERO.title}
            </h1>
            <p className="mt-4 max-w-[640px] text-[16px] leading-[1.5] text-brand-muted min-[390px]:text-[17px] lg:mt-7 lg:max-w-[520px] lg:text-[20px]">{HERO.lead}</p>
            <div className="mt-5 flex flex-col gap-2.5 lg:mt-10 lg:flex-row lg:items-center lg:gap-4">
              <HeroCta>{HERO.cta}</HeroCta>
              <p className="text-[14px] text-brand-muted min-[390px]:text-[15px]">{HERO.note}</p>
            </div>
          </div>
          <figure className="relative z-10 mt-5 flex items-end justify-end gap-3 lg:col-span-4 lg:mt-0 lg:flex-col lg:items-end lg:gap-4 lg:pt-16">
            {/* Реплика-наклейка с хвостиком к Вере. Мобилка: слева от Веры, десктоп: над ней */}
            <figcaption className="relative mb-12 min-w-0 max-w-[230px] flex-1 rotate-[-1.5deg] rounded-2xl border border-brand-border-soft bg-brand-card px-3.5 py-2.5 text-[15px] leading-[1.4] text-brand-text lg:mr-20 lg:mb-0 lg:max-w-[240px] lg:flex-none lg:rotate-[-2deg] lg:px-4 lg:py-3 lg:text-[16px] lg:leading-[1.45]">
              {HERO.veraSays}
              <span aria-hidden className="absolute -right-[7px] bottom-6 h-3.5 w-3.5 rotate-45 border-t border-r border-brand-border-soft bg-brand-card lg:hidden" />
              <span aria-hidden className="absolute -bottom-[7px] right-10 hidden h-3.5 w-3.5 rotate-45 border-r border-b border-brand-border-soft bg-brand-card lg:block" />
            </figcaption>
            <Image src="/vera/privet.webp" alt="Вера машет рукой" width={278} height={360} priority
              className="-mb-3 h-[150px] w-auto shrink-0 lg:-mb-6 lg:h-[330px]" />
          </figure>
        </section>

        {/* 2. Проблема на шоколаде: одна заметка в линейку на деревянной кнопке и рядом что берет PsyCont (components/landing/PainBoard.tsx) */}
        <section className="bg-brand-text pt-9 pb-10 lg:pt-24 lg:pb-20">
          <div className={WRAP}>
            <h2 className={`${H2} max-w-[560px] !text-brand-bg lg:max-w-[760px]`}>{PAINS.title}</h2>
            <PainBoard />
          </div>
        </section>

        {/* 3. Почему звучит как ты, белый: сразу после болей самое сильное доказательство. Настоящий ответ ChatGPT
            и PsyCont на одну тему, обе карточки рилсы, у каждой пометка на полях глазами читателя */}
        <section className={`bg-brand-card ${SECTION}`}>
          <div className={WRAP}>
            <h2 className={H2}>{WHY.title}</h2>
            {/* на десктопе карточки рядом («слева, справа»), на мобилке друг под другом («сверху, ниже»); оба текста лежат в HTML */}
            <p className={`mt-2 max-w-[720px] text-brand-text lg:mt-3 ${TEXT}`}>
              <span className="lg:hidden">{WHY.leadMobile}</span>
              <span className="hidden lg:inline">{WHY.lead}</span>
            </p>
            <p className="mt-3 inline-flex rounded-full bg-brand-bg px-3 py-1 text-[14px] text-brand-muted lg:mt-8">Тема: {COMPARE_TOPIC}</p>
            {/* ChatGPT цитатой как есть, свернута по смыслу до первой реплики сценки; PsyCont готовым рилсом целиком (designer-psycont 11.11) */}
            <div className="mt-5 grid gap-5 lg:grid-cols-2 lg:items-start lg:gap-8">
              <div>
                <figure className="relative rounded-3xl border border-brand-border p-4 lg:p-8">
                  <figcaption className="inline-flex h-7 items-center rounded-full border border-brand-border px-3 text-[13px] text-brand-muted">{WHY.aiLabel}</figcaption>
                  <span aria-hidden className="absolute top-6 right-6 hidden rotate-[3deg] text-[15px] text-brand-text lg:block">{WHY.aiSideNote}</span>
                  <div className="mt-3">
                    <ClampText text={COMPARE_CHATGPT} until="Мам, нет, в эти выходные я не приеду" place="compare_gpt"
                      className="text-[14px] leading-[20px] text-brand-text-secondary lg:text-[16px] lg:leading-[1.5]" />
                  </div>
                </figure>
                <MarginNote className="mt-2 pl-3">{WHY.aiNote}</MarginNote>
              </div>
              <div>
                <figure className="rounded-3xl bg-brand-bg p-4 lg:p-8">
                  <figcaption className="inline-flex h-7 items-center rounded-full bg-brand-soft px-3 text-[13px] text-brand-text">{WHY.oursLabel}</figcaption>
                  <div className="mt-3"><ReelCard text={COMPARE_PSYCONT} /></div>
                </figure>
                <MarginNote tone="accent" className="mt-2 pl-3">{WHY.oursNote}</MarginNote>
              </div>
            </div>
            <p className="mt-6 max-w-[720px] text-[15px] text-brand-muted">{WHY.compareNote}</p>
          </div>
        </section>

        {/* 4. Как это работает, крем: шаги по нарастанию тона, цифра и одна фраза, без заголовков и иконок.
            Шаги 1 и 2 со снимком экрана, в третьем Вера (второе и последнее ее появление на странице) и строка про рилсы */}
        <section className={SECTION}>
          <div className={WRAP}>
            <h2 className={H2}>{HOW.title}</h2>
            <ol className="mt-5 grid gap-3 lg:mt-12 lg:grid-cols-3 lg:items-start lg:gap-6">
              {HOW.steps.map((s, i) => {
                const dark = i === 2
                return (
                  <li key={s.text} className={`rounded-[28px] p-4 lg:flex lg:min-h-[670px] lg:flex-col lg:p-7 ${STEP_CARD[i]}`}>
                    {/* мобилка: цифра над фразой; у шагов 1 и 2 справа маленький снимок экрана (104 px); у третьего фраза во всю ширину,
                        под ней строка про рилсы и Вера справа. Десктоп: цифра крупно над фразой, картинка под текстом */}
                    {(() => {
                      const head = (
                        <>
                          <p aria-hidden className={`text-[28px] font-bold leading-none lg:text-[56px] ${dark ? 'text-brand-lilac' : 'text-brand-text'}`}>{i + 1}</p>
                          <p className={`mt-1.5 text-[17px] font-medium leading-[1.4] lg:mt-4 lg:text-[20px] ${dark ? 'text-brand-bg' : 'text-brand-text'}`}><span className="sr-only">Шаг {i + 1}. </span>{s.text}</p>
                        </>
                      )
                      if (dark) return (
                        <>
                          {head}
                          <div className="max-lg:mt-2 max-lg:grid max-lg:grid-cols-[1fr_104px] max-lg:items-end max-lg:gap-3.5">
                            <p className="text-[15px] leading-[1.45] text-brand-on-dark max-lg:self-center lg:mt-3 lg:text-[16px]">{HOW.reels}</p>
                            {s.vera && <Image src={s.vera} alt={s.alt} width={338} height={360} sizes="(min-width: 1024px) 190px, 104px" className="h-auto w-[104px] justify-self-end lg:mx-auto lg:mt-6 lg:h-[200px] lg:w-auto" />}
                          </div>
                        </>
                      )
                      return (
                        <div className="max-lg:grid max-lg:grid-cols-[1fr_104px] max-lg:items-start max-lg:gap-3.5">
                          <div className="min-w-0">{head}</div>
                          {s.shot && (
                            <div className="w-[104px] rounded-[20px] border border-brand-border bg-brand-card p-1 lg:hidden">
                              <div className="aspect-[375/600] overflow-hidden rounded-[16px] border border-brand-border bg-brand-bg">
                                <Image src={s.shot} alt={s.alt} width={s.w} height={s.h} sizes="104px" className="block h-auto w-full" />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {s.shot && <div className="mt-6 hidden justify-center lg:flex"><PhoneShot src={s.shot} alt={s.alt} w={s.w} h={s.h} /></div>}
                    {dark && <CtaButton place="how" variant="light" className="mt-4 w-full lg:mt-auto">{HOW.cta}</CtaButton>}
                  </li>
                )
              })}
            </ol>
            <p className="mt-5 max-w-[640px] text-[15px] leading-[1.5] text-brand-muted lg:mt-10 lg:text-[17px]">{HOW.privacy}</p>
          </div>
        </section>

        {/* 5. Подача на бледной сирени: волна сверху (снизу волна шалфея от этики). Три манеры, у каждой пометка от руки,
            первая карточка на зажиме; десктоп три в ряд разной высоты с легкими поворотами, мобилка столбиком */}
        <section className="relative z-10 bg-brand-soft pt-10 pb-8 lg:py-24">
          <Wave side="top" />
          <div className={WRAP}>
            <h2 className={H2}>{EXAMPLE.title}</h2>
            <p className={`mt-2 max-w-[680px] text-brand-text lg:mt-3 ${TEXT}`}>{EXAMPLE.lead}</p>
            <div className="mt-5 grid gap-5 lg:mt-10 lg:grid-cols-3 lg:items-start lg:gap-7">
              {EXAMPLES.map((e, i) => (
                <div key={e.id} className={MANNER_CARD[i]}>
                  <p className="mb-1 pl-1 text-[17px] font-medium text-brand-accent lg:mb-3">
                    <span className="relative inline-block">{e.manner}<HandUnderline /></span>                  </p>
                  <div className="relative">
                    {i === 0 && <Dekor name="zazhim-sirenevyj" className="-top-6 left-1/2 z-10 w-[40px] -translate-x-1/2 lg:w-[48px]" />}
                    <article className={`rounded-3xl border border-brand-border bg-brand-card p-4 lg:p-7 ${i === 0 ? 'max-lg:pt-8' : ''}`}>
                      <ReelCard text={e.text} collapse place={`ex_${e.id.split('_')[0]}`} />
                    </article>
                  </div>
                  {e.note && <MarginNote className="mt-2 pl-3 lg:mt-3">{e.note}</MarginNote>}
                </div>
              ))}
            </div>
            <p className="mt-3 max-w-[720px] text-[14px] text-brand-muted lg:mt-6 lg:text-[15px]">{EXAMPLE.caption}</p>
          </div>
        </section>

        {/* 6. Этика на шалфее с волнами сверху и снизу. Текст только шоколадный, не мельче 17 px */}
        <section className={`relative z-10 bg-brand-sage ${SECTION}`}>
          <Wave side="top" color="text-brand-sage" />
          <div className={WRAP}>
            <h2 className={`${H2} max-w-[640px]`}>{ETHICS.title}</h2>
            {/* одна строка на пункт: жирное начало и продолжение, вместо точки рукописная галочка (designer-psycont 11.11) */}
            <ul className="mt-5 max-w-[860px] space-y-3 lg:mt-10 lg:space-y-5">
              {ETHICS.items.map(it => (
                <li key={it.head} className="flex items-start gap-3 text-[17px] leading-[1.45] text-brand-text lg:text-[19px]">
                  <svg aria-hidden viewBox="0 0 18 14" className="mt-1.5 h-[14px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 7.5c1.6 1.2 3 2.6 4.4 4.6C8.6 7.4 12 3.6 16.5 1.6" /></svg>
                  <p><strong className="font-semibold">{it.head}</strong> {it.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <Wave side="bottom" color="text-brand-sage" />
        </section>

        {/* 7. Тарифы из lib/pricing.ts, белый фон и кремовые карточки */}
        <section className="bg-brand-card py-9 lg:py-24">
          <div id="pricing" className={`${WRAP} scroll-mt-20`}>
            <h2 className={H2}>{PRICING.title}</h2>
            <p className={`mt-3 max-w-[640px] text-brand-muted ${TEXT}`}><span className="font-semibold text-brand-text">{PRICING.leadBold}</span> {PRICING.lead}</p>
            <div className="mt-5 grid gap-3 lg:mt-12 lg:grid-cols-3 lg:items-stretch lg:gap-6">
              {PLANS.map((p, i) => (
                <div key={p.id} className={`flex flex-col rounded-3xl px-4 py-3.5 lg:p-8 ${PLAN_CARD[i]}`}>
                  {/* мобилка (решение Арины 11.11): название, цена, «для кого» и мелкой строкой материалы, одна общая кнопка под тарифами; десктоп: столбиком со списком и своими кнопками */}
                  <div>
                    <h3 className="text-[18px] font-semibold text-brand-text">{p.name}</h3>
                    <p className="mt-1 flex items-baseline gap-2 lg:mt-3">
                      <span className="text-[30px] font-bold leading-none text-brand-text lg:text-[40px]">{formatRub(p.price)}</span>
                      {p.perMonth && <span className="text-[16px] text-brand-muted lg:text-[17px]">{PRICING.perMonth}</span>}
                    </p>
                  </div>
                  <p className="mt-1 text-[15px] leading-[1.4] text-brand-muted lg:mt-3 lg:text-[18px]">{p.who}</p>
                  <p className="mt-1 text-[14px] leading-[1.4] text-brand-text lg:hidden">{planPerks(p)[0]}{p.price > 0 && <span className="text-brand-muted"> · {PRICING.soon.toLowerCase()}</span>}</p>
                  <ul className="mt-5 mb-6 hidden lg:block">
                    {planPerks(p).map(perk => <li key={perk} className="border-t border-brand-border py-3 text-[18px] text-brand-text">{perk}</li>)}
                  </ul>
                  <div className="mt-auto max-lg:hidden">
                    {p.price > 0 && <p className="mb-2 text-[14px] text-brand-muted">{PRICING.soon}</p>}
                    <CtaButton place="pricing" plan={p.track} variant={p.price > 0 ? 'secondary' : 'primary'} className="w-full whitespace-nowrap !px-4 lg:!text-[16px]">
                      {p.price > 0 ? PRICING.ctaPaid : PRICING.ctaFree}
                    </CtaButton>
                  </div>
                </div>
              ))}
            </div>
            <CtaButton place="pricing" plan="free" className="mt-4 w-full lg:hidden">{PRICING.ctaFree}</CtaButton>
            <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-brand-text lg:mt-8 lg:text-[19px]">{PLAN_COMMON_LINE}</p>
            <p className="mt-3 max-w-[640px] text-[15px] text-brand-muted">{MATERIAL_NOTE}</p>
          </div>
        </section>

        {/* 8. Вопросы, крем */}
        <section className={SECTION}>
          <div className={`${WRAP} lg:grid lg:grid-cols-12 lg:gap-8`}>
            <h2 className={`${H2} lg:col-span-4`}>{FAQ.title}</h2>
            <div className="mt-4 max-w-[800px] lg:col-span-8 lg:mt-0"><Faq /></div>
          </div>
        </section>

        {/* 9. Финал на бледной сирени: волна сверху, единственный центрированный блок страницы. Бант лентой над заголовком,
            Веры здесь нет: она появляется на странице дважды, на первом экране и в шагах */}
        <section className="relative z-10 bg-brand-soft pt-10 pb-11 lg:pt-20 lg:pb-20">
          <Wave side="top" />
          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <Dekor inline name="bant-zelenyj-atlas" className="mb-3 w-[56px] rotate-[-8deg] lg:mb-4 lg:w-[76px]" />
            <h2 className={`${H2} max-w-[560px]`}>{FINAL.title}</h2>
            <CtaButton place="final" className="mt-5 w-full lg:mt-7 lg:w-auto lg:px-10">{FINAL.cta}</CtaButton>
            <p className="mt-3 text-[15px] text-brand-muted">{FINAL.note}</p>
          </div>
        </section>
      </main>

      {/* Подвал на шоколаде */}
      <footer className="bg-brand-text py-8 text-brand-bg lg:py-16">
        <div className={`${WRAP} flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between`}>
          <div>
            <Image src="/brand/psycont-wordmark-light.svg" alt="PsyCont" width={131} height={40} className="h-10 w-auto" />
            <p className="mt-3 text-[15px] text-brand-on-dark">{FOOTER.slogan}</p>
          </div>
          <div className="flex flex-col gap-2 text-[15px] lg:items-end">
            {CONTACT_EMAIL && <p className="text-brand-on-dark">{FOOTER.mailLabel} <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-bg underline underline-offset-4">{CONTACT_EMAIL}</a></p>}
            {(PRIVACY_URL || OFFER_URL) && (
              <p className="flex flex-wrap gap-x-4">
                {PRIVACY_URL && <a href={PRIVACY_URL} className="text-brand-on-dark underline-offset-4 hover:underline">{FOOTER.privacy}</a>}
                {OFFER_URL && <a href={OFFER_URL} className="text-brand-on-dark underline-offset-4 hover:underline">{FOOTER.offer}</a>}
              </p>
            )}
            <p className="text-[14px] text-brand-on-dark-muted">© {year} PsyCont</p>
          </div>
        </div>
      </footer>
    </LandingShell>
  )
}
