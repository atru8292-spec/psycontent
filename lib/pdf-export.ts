import { jsPDF } from 'jspdf'

// ════════════════════════════════════════════════════════════════
// Фирменный PDF контент-плана PsyCont.
// Тот же подход, что и у паспорта: брендовый HTML-шаблон офф-скрин
// (бумага, Onest, лого, аметист, зелёные подчёркивания, лавандовые
// карточки дней) → html2canvas постранично → jsPDF.
// ════════════════════════════════════════════════════════════════

type DayItem = {
  day: number
  pillar: string
  topic: string
  format: string
  hook: string
  tip?: string
  done?: boolean
}

const PAGE_W = 794
const PAGE_H = 1123

const PAPER = '#F7F3EC'
const INDIGO = '#2E2A45'
const AMETHYST = '#5B4FA0'
const SAGE = '#8F9D68'
const LAVENDER = '#E7E2F2'
const MUTED = '#6E6A7A'

const FORMAT_LABELS: Record<string, string> = {
  post: 'Пост',
  carousel: 'Карусель',
  reels: 'Рилс',
  stories: 'Stories',
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pluralDays(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'день'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня'
  return 'дней'
}

function squiggle(widthPx: number): string {
  return `<svg viewBox="0 0 260 16" width="${widthPx}" height="13" preserveAspectRatio="none" fill="none" style="display:block;color:${SAGE};overflow:visible;margin-top:6px">
    <path d="M2 8 C 14 3, 28 12, 46 7 S 74 2, 96 8 S 128 4, 158 9 S 186 5, 210 7" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`
}

function footerHTML(): string {
  return `<div class="cp-footer">
    <span style="display:flex;align-items:center;gap:7px">
      <img src="/logo/out_icon_mono.svg" width="16" height="16" style="opacity:.55" alt=""/>
      Сделано в PsyCont
    </span>
    <span>psycont.ru</span>
  </div>`
}

const STYLE_ID = 'cp-style'
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
  .cp-page{position:relative;width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;
    padding:56px 60px 78px;overflow:hidden;
    background-color:${PAPER};background-image:url('/paper-grain.png');background-size:300px;background-blend-mode:multiply;
    font-family:var(--font-onest),system-ui,sans-serif;color:${INDIGO};-webkit-font-smoothing:antialiased;}
  .cp-area{position:relative;height:${PAGE_H - 56 - 78}px;overflow:hidden;}
  .cp-footer{position:absolute;left:60px;right:60px;bottom:30px;display:flex;align-items:center;justify-content:space-between;
    font-size:11px;color:${MUTED};border-top:1px solid rgba(91,79,160,.18);padding-top:11px;}
  .cp-pagehead{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;}
  .cp-pagehead .t{font-size:13px;font-weight:700;color:${AMETHYST};}
  .cp-card{background:#FFFFFF;border:1px solid rgba(91,79,160,.12);border-radius:18px;padding:18px 20px;margin-bottom:14px;}
  .cp-card-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
  .cp-day{display:inline-flex;align-items:center;justify-content:center;min-width:54px;height:26px;padding:0 12px;
    background:${AMETHYST};color:#fff;font-size:12px;font-weight:700;border-radius:999px;}
  .cp-pill{display:inline-block;background:${LAVENDER};color:${AMETHYST};font-size:11px;font-weight:600;
    padding:4px 11px;border-radius:999px;}
  .cp-fmt{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:${SAGE};margin-left:auto;}
  .cp-fmt::before{content:'';width:6px;height:6px;border-radius:50%;background:${SAGE};}
  .cp-topic{font-size:15px;font-weight:700;color:${INDIGO};line-height:1.32;margin:0 0 10px;}
  .cp-hook{background:${LAVENDER};border-radius:12px;padding:11px 14px;font-size:12.5px;font-style:italic;color:${INDIGO};line-height:1.5;}
  .cp-hook .lbl{font-style:normal;font-weight:700;color:${AMETHYST};font-size:10px;letter-spacing:.05em;text-transform:uppercase;display:block;margin-bottom:4px;}
  .cp-tip{font-size:11.5px;color:${MUTED};line-height:1.5;margin-top:8px;padding-left:12px;position:relative;}
  .cp-tip::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:3px;border-radius:2px;background:${SAGE};}
  .cp-plate{background:${LAVENDER};border-radius:18px;padding:22px 24px;}
  `
  document.head.appendChild(style)
}

function newPage(wrapper: HTMLElement): { page: HTMLElement; area: HTMLElement } {
  const page = document.createElement('div')
  page.className = 'cp-page'
  const area = document.createElement('div')
  area.className = 'cp-area'
  page.appendChild(area)
  page.insertAdjacentHTML('beforeend', footerHTML())
  wrapper.appendChild(page)
  return { page, area }
}

function dayCard(item: DayItem): HTMLElement {
  const el = document.createElement('div')
  el.className = 'cp-card'
  const fmt = FORMAT_LABELS[item.format] || item.format
  const hook = item.hook
    ? `<div class="cp-hook"><span class="lbl">Хук</span>«${esc(item.hook)}»</div>`
    : ''
  const tip = item.tip ? `<div class="cp-tip">${esc(item.tip)}</div>` : ''
  el.innerHTML = `
    <div class="cp-card-head">
      <span class="cp-day">День ${item.day}</span>
      <span class="cp-pill">${esc(item.pillar)}</span>
      <span class="cp-fmt">${esc(fmt)}</span>
    </div>
    <div class="cp-topic">${esc(item.topic)}</div>
    ${hook}
    ${tip}`
  return el
}

// ════════════════════════════════════════════════════════════════
// Собирает все страницы контент-плана офф-скрин (для предпросмотра).
// ════════════════════════════════════════════════════════════════
export function buildContentPlanPages(plan: DayItem[]): HTMLElement {
  injectStyle()

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;left:-99999px;top:0;width:${PAGE_W}px;`
  document.body.appendChild(wrapper)

  const dateStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const n = plan.length

  // ── Обложка ──
  {
    const { area } = newPage(wrapper)
    area.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%">
        <img src="/logo/out_wordmark.svg" width="156" height="40" style="height:40px;width:auto" alt="PsyCont"/>
        <div style="margin-top:70px">
          <div style="font-size:46px;font-weight:800;color:${AMETHYST};line-height:1.05">Контент-план</div>
          <div style="font-size:46px;font-weight:800;color:${INDIGO};line-height:1.05">на ${n} ${pluralDays(n)}</div>
          ${squiggle(190)}
          <div style="font-size:15px;color:${MUTED};margin-top:18px">Каждый день уже с темой, форматом и хуком. Осталось опубликовать.</div>
        </div>
        <div class="cp-plate" style="margin-top:40px">
          <div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${AMETHYST};margin-bottom:12px">Как пользоваться</div>
          <div style="font-size:13px;color:${INDIGO};line-height:1.6">
            Ведите план по порядку. Хук это первая строка поста, она решает половину дела.
            Отмечайте опубликованное и не гонитесь за идеальностью: важнее регулярность.
          </div>
        </div>
        <div style="margin-top:auto;font-size:12px;color:${MUTED}">${dateStr}</div>
      </div>`
  }

  // ── Страницы с карточками дней ──
  let { area } = newPage(wrapper)
  const pageHead = (continued: boolean) => {
    const h = document.createElement('div')
    h.className = 'cp-pagehead'
    h.innerHTML = `<span class="t">Контент-план${continued ? ' · продолжение' : ''}</span><span style="font-size:11px;color:${MUTED}">${n} ${pluralDays(n)}</span>`
    return h
  }
  area.appendChild(pageHead(false))

  const fits = () => area.scrollHeight <= area.clientHeight
  for (const item of plan) {
    const card = dayCard(item)
    area.appendChild(card)
    if (!fits()) {
      area.removeChild(card)
      const next = newPage(wrapper)
      area = next.area
      area.appendChild(pageHead(true))
      area.appendChild(card)
    }
  }

  // ── Финальная страница ──
  {
    const { area: fa } = newPage(wrapper)
    fa.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center">
        <div style="font-size:22px;font-weight:700;color:${INDIGO}">Регулярность важнее идеальности</div>
        <div style="font-size:22px;font-weight:700;color:${AMETHYST}">публикуйте по плану, и блог оживёт</div>
        ${`<div style="display:flex;justify-content:center;margin-top:10px">${squiggle(180)}</div>`}
        <div style="font-size:13px;color:${MUTED};max-width:430px;line-height:1.6;margin-top:26px">
          Когда тема и хук уже готовы, остаётся самое главное: выйти к людям. План снимает вопрос «о чём писать».
        </div>
        <img src="/logo/out_icon_mono.svg" width="56" height="56" style="opacity:.5;margin-top:40px" alt=""/>
      </div>`
  }

  return wrapper
}

// ════════════════════════════════════════════════════════════════
// Генерирует и скачивает фирменный PDF контент-плана.
// ════════════════════════════════════════════════════════════════
export async function generatePDF(plan: DayItem[]): Promise<void> {
  const html2canvas = (await import('html2canvas')).default

  const wrapper = buildContentPlanPages(plan)
  const pages = Array.from(wrapper.querySelectorAll('.cp-page')) as HTMLElement[]

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready
    }

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pw = pdf.internal.pageSize.getWidth()
    const ph = pdf.internal.pageSize.getHeight()

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: PAPER,
        width: PAGE_W,
        height: PAGE_H,
        windowWidth: PAGE_W,
      })
      const img = canvas.toDataURL('image/png')
      if (i > 0) pdf.addPage()
      pdf.addImage(img, 'PNG', 0, 0, pw, ph)
    }

    pdf.save('content-plan-psycont-' + new Date().toISOString().split('T')[0] + '.pdf')
  } finally {
    wrapper.remove()
  }
}
