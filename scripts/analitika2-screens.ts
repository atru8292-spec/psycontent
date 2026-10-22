// Снимки аналитики 2 без входа и без базы: страница /preview/analitika на демо-данных (опрос, «Почему уходят»,
// «Тексты»), запись событий и ответы опроса перехвачены. Нужна сборка в worktree с PREVIEW_PAGES=1 и next start.
//   PLAYWRIGHT=/Users/arina/site-audit/node_modules/playwright BASE=http://127.0.0.1:3009 npx tsx scripts/analitika2-screens.ts
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require_ = createRequire(__filename)
const { chromium } = require_(process.env.PLAYWRIGHT || 'playwright')
const BASE = process.env.BASE || 'http://127.0.0.1:3009'
const DIR = join(__dirname, '..', '_знания', 'analitika-2')
const OUT = join(DIR, 'ui')
const EXE = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
mkdirSync(OUT, { recursive: true })

const SHOTS: [string, string][] = [
  ['survey-collapsed', 'Карточка опроса на главной, свернута'],
  ['survey-open', 'Карточка раскрыта: причины, свои слова, «можно написать»'],
  ['survey-thanks', 'Спасибо после ответа'],
  ['survey-pause', 'Ответ «Все в порядке, была пауза»'],
  ['exits', 'Кабинет: «Почему уходят» и ответы в карточке человека (демо)'],
  ['texts', 'Кабинет: вкладка «Тексты» (демо)'],
]

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE })
  for (const [w, width, height] of [['390', 390, 844], ['1280', 1280, 900]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
    for (const [s] of SHOTS) {
      const page = await ctx.newPage()
      await page.route('**/api/ev**', (r: any) => r.fulfill({ status: 204, body: '' }))
      await page.route('**/api/exit-survey**', (r: any) => r.fulfill({ json: r.request().method() === 'GET' ? { show: true, place: 'cooling', paymentsOn: false } : { ok: true } }))
      await page.goto(`${BASE}/preview/analitika?s=${s}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      await page.screenshot({ path: join(OUT, `${w}-${s}.png`), fullPage: true })
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (sw > 0) console.log(`!! ${w} ${s}: горизонтальный скролл ${sw}px`)
      await page.close()
    }
    await ctx.close()
  }
  await browser.close()
  const fig = (src: string, cap: string, d = false) => `<figure class="${d ? 'd' : ''}"><figcaption>${cap}</figcaption><a href="${src}"><img loading="lazy" src="${src}" alt=""></a></figure>`
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Аналитика 2: снимки</title>
<style>body{font-family:-apple-system,Helvetica,sans-serif;background:#F5EFE4;color:#3B2A22;margin:0;padding:24px}section{margin:40px 0}.r{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}figure{margin:0;width:390px;max-width:100%}figure.d{width:min(900px,100%)}img{width:100%;border:1px solid #d8cfc0;border-radius:12px;background:#fff}figcaption{font-size:14px;margin-bottom:6px;color:#6B6458}.box{background:#fff;padding:16px 20px;border-radius:12px;max-width:900px}li{margin:4px 0}pre{white-space:pre-wrap;background:#fff;padding:16px;border-radius:12px;max-width:700px}</style>
<h1>Аналитика 2</h1>
<div class="box"><h2>Что сделано</h2><ul>
<li>Опрос при уходе: карточка сверху главной для тех, кто остыл или ушел и вернулся (статус по прошлому визиту), один раз, потом 60 дней тишины, не больше 3 раз. Первая кнопка «Все в порядке, была пауза». Свои слова только в базе, в события идут коды.</li>
<li>Кабинет: «Почему уходят» на Сводке, ответы в карточке человека, новая вкладка «Тексты»: что люди делают с текстами и шаблонность по неделям рядом с нормами живых, сиреневым где стало хуже.</li>
<li>Шаблонность считает скрипт раз в неделю, в базу только числа. Частые цепочки только в локальный файл.</li>
<li>Утренняя сводка в Telegram без почт и текстов. Месяц текстов в кабинете по Москве.</li>
<li>Удаления аккаунта в продукте нет, экран опроса перед удалением не делали. Снимки на демо-данных.</li>
</ul></div>
${SHOTS.map(([s, cap]) => `<section><h2>${cap}</h2><div class="r">${fig(`ui/390-${s}.png`, 'Телефон 390')}${fig(`ui/1280-${s}.png`, 'Компьютер 1280', true)}</div></section>`).join('\n')}
`
  writeFileSync(join(DIR, 'SNIMKI.html'), html)
  console.log('снимки и SNIMKI.html в', DIR)
})().catch(e => { console.error(e); process.exit(1) })
