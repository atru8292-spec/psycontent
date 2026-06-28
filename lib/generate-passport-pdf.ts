import { jsPDF } from 'jspdf'

// ════════════════════════════════════════════════════════════════
// Фирменный PDF паспорта бренда PsyCont.
// Собираем брендовый HTML-шаблон офф-скрин (бумага, Onest, лого,
// аметист, зелёные подчёркивания, лавандовые плашки) и снимаем
// постранично через html2canvas → jsPDF. Так получаем шрифт Onest,
// текстуру и лого без встраивания TTF в вектор.
// ════════════════════════════════════════════════════════════════

type PassportSection = {
  num: string
  title: string
  content: string
}

// Размер страницы A4 при 96dpi (px)
const PAGE_W = 794
const PAGE_H = 1123

// Брендовая палитра
const PAPER = '#F7F3EC'
const INDIGO = '#2E2A45'
const AMETHYST = '#5B4FA0'
const SAGE = '#8F9D68'
const LAVENDER = '#E7E2F2'
const MUTED = '#6E6A7A'

// ── Парсер контента паспорта (## N. Заголовок или **N. Заголовок**) ──
function parsePassportContent(content: string): PassportSection[] {
  const sections: PassportSection[] = []
  const lines = content.split('\n')
  let current: { num: string; title: string; lines: string[] } | null = null
  let lastNum = 0

  for (const line of lines) {
    const t = line.trim()
    let m = t.match(/^##\s+(1[0-2]|[1-9])\.\s+(.+)/)
    if (!m) m = t.match(/^\*\*(1[0-2]|[1-9])\.\s+(.+?)\*\*\s*$/)

    if (m) {
      const n = parseInt(m[1])
      if (n > lastNum) {
        if (current) {
          sections.push({ num: current.num, title: current.title, content: current.lines.join('\n').trim() })
        }
        current = { num: m[1], title: m[2].trim(), lines: [] }
        lastNum = n
      } else if (current) {
        current.lines.push(line)
      }
    } else if (current) {
      current.lines.push(line)
    }
  }

  if (current) {
    sections.push({ num: current.num, title: current.title, content: current.lines.join('\n').trim() })
  }
  return sections
}

function cleanInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\*+/g, '')   // подчищаем непарные звёздочки, чтобы не просачивались в PDF
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function squiggle(widthPx: number): string {
  return `<svg viewBox="0 0 260 16" width="${widthPx}" height="13" preserveAspectRatio="none" fill="none" style="display:block;color:${SAGE};overflow:visible;margin-top:6px">
    <path d="M2 8 C 14 3, 28 12, 46 7 S 74 2, 96 8 S 128 4, 158 9 S 186 5, 210 7" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`
}

function footerHTML(): string {
  return `<div class="ppdf-footer">
    <span style="display:flex;align-items:center;gap:7px">
      <img src="/logo/out_icon_mono.svg" width="16" height="16" style="opacity:.55" alt=""/>
      Сделано в PsyCont
    </span>
    <span>psycont.ru</span>
  </div>`
}

const STYLE_ID = 'ppdf-style'
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
  .ppdf-page{position:relative;width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;
    padding:56px 60px 78px;overflow:hidden;
    background-color:${PAPER};background-image:url('/paper-grain.png');background-size:300px;background-blend-mode:multiply;
    font-family:var(--font-onest),system-ui,sans-serif;color:${INDIGO};-webkit-font-smoothing:antialiased;}
  .ppdf-area{position:relative;height:${PAGE_H - 56 - 78}px;overflow:hidden;}
  .ppdf-footer{position:absolute;left:60px;right:60px;bottom:30px;display:flex;align-items:center;justify-content:space-between;
    font-size:11px;color:${MUTED};border-top:1px solid rgba(91,79,160,.18);padding-top:11px;}
  .ppdf-pill{display:inline-block;background:${LAVENDER};color:${AMETHYST};font-size:11px;font-weight:600;
    letter-spacing:.04em;padding:5px 12px;border-radius:999px;text-transform:uppercase;}
  .ppdf-h2{font-size:25px;font-weight:700;color:${AMETHYST};line-height:1.15;margin:14px 0 0;}
  .ppdf-watermark{position:absolute;top:-12px;right:0;font-size:96px;font-weight:800;color:${LAVENDER};line-height:1;z-index:0;}
  .ppdf-sub{position:relative;font-size:15px;font-weight:700;color:${AMETHYST};margin:16px 0 7px;padding-left:12px;line-height:1.3;}
  .ppdf-sub::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:3px;border-radius:2px;background:${SAGE};}
  .ppdf-p{font-size:13px;line-height:1.62;color:${INDIGO};margin:0 0 8px;}
  .ppdf-bullet{display:flex;gap:9px;font-size:13px;line-height:1.55;color:${INDIGO};margin:0 0 6px;}
  .ppdf-bullet::before{content:'';flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:${SAGE};margin-top:7px;}
  .ppdf-num{display:flex;gap:9px;font-size:13px;line-height:1.55;color:${INDIGO};margin:0 0 6px;}
  .ppdf-num b{color:${AMETHYST};font-weight:700;flex:0 0 auto;}
  .ppdf-plate{background:${LAVENDER};border-radius:18px;padding:22px 24px;}
  `
  document.head.appendChild(style)
}

// ── Сборка одной страницы с областью контента и подвалом ──
function newPage(wrapper: HTMLElement): { page: HTMLElement; area: HTMLElement } {
  const page = document.createElement('div')
  page.className = 'ppdf-page'
  const area = document.createElement('div')
  area.className = 'ppdf-area'
  page.appendChild(area)
  page.insertAdjacentHTML('beforeend', footerHTML())
  wrapper.appendChild(page)
  return { page, area }
}

// ── Преобразование строк раздела в блок-элементы ──
function contentBlocks(content: string): HTMLElement[] {
  const blocks: HTMLElement[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const t = line.trim()
    if (t === '') continue

    // Подзаголовок
    if (line.startsWith('### ') || (t.startsWith('**') && t.endsWith('**') && t.length > 4)) {
      const el = document.createElement('div')
      el.className = 'ppdf-sub'
      el.innerHTML = esc(cleanInline(t.replace(/^###\s+/, '')))
      blocks.push(el)
      continue
    }
    // Буллет
    if (t.startsWith('- ') || t.startsWith('• ')) {
      const el = document.createElement('div')
      el.className = 'ppdf-bullet'
      el.innerHTML = `<span>${esc(cleanInline(t.replace(/^[-•]\s+/, '')))}</span>`
      blocks.push(el)
      continue
    }
    // Нумерованный
    const nm = t.match(/^(\d+)[.)]\s+(.+)/)
    if (nm) {
      const el = document.createElement('div')
      el.className = 'ppdf-num'
      el.innerHTML = `<b>${nm[1]}.</b><span>${esc(cleanInline(nm[2]))}</span>`
      blocks.push(el)
      continue
    }
    // Обычный абзац
    const el = document.createElement('div')
    el.className = 'ppdf-p'
    el.innerHTML = esc(cleanInline(t))
    blocks.push(el)
  }
  return blocks
}

// ════════════════════════════════════════════════════════════════
// Собирает все страницы паспорта офф-скрин и возвращает контейнер.
// Экспортируется для предпросмотра вида без скачивания PDF.
// ════════════════════════════════════════════════════════════════
export function buildPassportPages(passportContent: string): HTMLElement {
  injectStyle()
  const sections = parsePassportContent(passportContent)

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;left:-99999px;top:0;width:${PAGE_W}px;`
  document.body.appendChild(wrapper)

  const dateStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

  // ── Обложка ──
  {
    const { area } = newPage(wrapper)
    const toc = sections
      .map(
        (s) =>
          `<div style="display:flex;align-items:baseline;gap:12px;font-size:13px;margin:0 0 9px;color:${INDIGO}">
            <span style="color:${AMETHYST};font-weight:700;width:22px;flex:0 0 auto">${s.num.padStart(2, '0')}</span>
            <span>${esc(s.title)}</span>
          </div>`
      )
      .join('')

    area.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%">
        <img src="/logo/out_wordmark.svg" width="156" height="40" style="height:40px;width:auto" alt="PsyCont"/>
        <div style="margin-top:70px">
          <div style="font-size:46px;font-weight:800;color:${AMETHYST};line-height:1.05">Паспорт бренда</div>
          <div style="font-size:46px;font-weight:800;color:${INDIGO};line-height:1.05">психолога</div>
          ${squiggle(190)}
          <div style="font-size:15px;color:${MUTED};margin-top:18px">Персональный стратегический документ. Голос, ниша и опоры вашего бренда</div>
        </div>
        <div class="ppdf-plate" style="margin-top:40px">
          <div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${AMETHYST};margin-bottom:16px">Содержание</div>
          ${toc}
        </div>
        <div style="margin-top:auto;font-size:12px;color:${MUTED}">${dateStr}</div>
      </div>`
  }

  // ── Страницы разделов ──
  for (const section of sections) {
    let { area } = newPage(wrapper)

    const header = document.createElement('div')
    header.style.cssText = 'position:relative;margin-bottom:14px'
    header.innerHTML = `
      <div class="ppdf-watermark">${section.num.padStart(2, '0')}</div>
      <div style="position:relative;z-index:1">
        <span class="ppdf-pill">Раздел ${section.num}</span>
        <div class="ppdf-h2">${esc(section.title)}</div>
        ${squiggle(Math.min(200, 70 + section.title.length * 7))}
      </div>`
    area.appendChild(header)

    const blocks = contentBlocks(section.content)
    const fits = () => area.scrollHeight <= area.clientHeight

    // Если шапка раздела уже не влезла (край страницы) — крайне маловероятно
    for (const block of blocks) {
      area.appendChild(block)
      if (!fits()) {
        area.removeChild(block)
        // Продолжение на новой странице
        const next = newPage(wrapper)
        area = next.area
        const cont = document.createElement('div')
        cont.style.cssText = 'margin-bottom:14px'
        cont.innerHTML = `<span class="ppdf-pill">Раздел ${section.num} · продолжение</span>`
        area.appendChild(cont)
        area.appendChild(block)
      }
    }
  }

  // ── Финальная страница ──
  {
    const { area } = newPage(wrapper)
    area.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center">
        <div style="font-size:120px;line-height:.7;color:${LAVENDER};font-weight:800">,,</div>
        <div style="font-size:22px;font-weight:700;color:${INDIGO};margin-top:18px">Сильный бренд держится</div>
        <div style="font-size:22px;font-weight:700;color:${AMETHYST}">на обещании, которое вы повторяете каждый день</div>
        ${`<div style="display:flex;justify-content:center;margin-top:10px">${squiggle(180)}</div>`}
        <div style="font-size:13px;color:${MUTED};max-width:420px;line-height:1.6;margin-top:26px">
          Используйте паспорт как ориентир: когда пишете контент, общаетесь с клиентами и решаете, куда вести практику.
        </div>
        <img src="/logo/out_icon_mono.svg" width="56" height="56" style="opacity:.5;margin-top:40px" alt=""/>
      </div>`
  }

  return wrapper
}

// ════════════════════════════════════════════════════════════════
// Генерирует и скачивает фирменный PDF паспорта.
// ════════════════════════════════════════════════════════════════
export async function generatePassportPDF(passportContent: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default

  const wrapper = buildPassportPages(passportContent)
  const pages = Array.from(wrapper.querySelectorAll('.ppdf-page')) as HTMLElement[]

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

    pdf.save('passport-brenda-psycont-' + new Date().toISOString().split('T')[0] + '.pdf')
  } finally {
    wrapper.remove()
  }
}
