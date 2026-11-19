// zh13: разбор ответа писателя на части для экрана. Главное (что говорить или публиковать) отдельно от съемки:
// у рилса это речь без метки «Речь:» (роли в сессии и сценке остаются, это и есть текст), у «текста на экране»
// надписи по кадрам, у карусели слайды, у поста текст. Подпись отдельно. «Как снять» и «Подойдет еще» модель пишет
// в конце ответа, тут они вырезаются из текста и разбираются в поля. В базу (generated_posts.content) идет текст
// в прежнем виде (метки «В кадре», «Текст на экране», «Речь», «Подпись»), чтобы старые экраны его читали.
import { FORMATY, ZAPAS, formatPo, type Format13 } from './formaty'
import { ochistit13 } from './tekst'

export type Podoydet = { kod: string; pochemu: string }
export type Rezultat13 = {
  tekst: string          // для базы: без «Как снять» и «Подойдет еще»
  glavnoe: string        // что копировать
  podpis: string
  nadpis: string         // «Текст на экране» у рилса с речью: хук и плашки
  vKadre: string
  kakSnyat: string[]
  podoydet: Podoydet[]
  kakSnyatOtModeli: boolean
  podoydetOtModeli: boolean
}

const BLOK = (imya: string) => new RegExp(`(?:^|\\n)[ \\t]*\\**[ \\t]*${imya}[ \\t]*\\**[ \\t]*:[ \\t]*\\**`, 'iu')
const stroki = (s: string) => s.split('\n').map(x => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean)

function otrezat(t: string, imya: string): { do: string; blok: string } {
  const re = BLOK(imya)
  const m = t.match(re)
  if (!m || m.index === undefined) return { do: t, blok: '' }
  return { do: t.slice(0, m.index).trimEnd(), blok: t.slice(m.index + m[0].length).trim() }
}

// метки рилса: строка начинается с метки и двоеточия, содержимое до следующей метки
const METKI = ['В кадре', 'Текст на экране', 'Речь', 'Подпись'] as const
export function polyaRilsa(t: string): Record<(typeof METKI)[number], string> {
  const out: Record<string, string> = { 'В кадре': '', 'Текст на экране': '', 'Речь': '', 'Подпись': '' }
  const re = new RegExp(`(?:^|\\n)\\s*(${METKI.join('|')})\\s*:\\s*`, 'gu')
  const hits = [...t.matchAll(re)]
  hits.forEach((h, i) => {
    const start = (h.index || 0) + h[0].length
    const end = i + 1 < hits.length ? hits[i + 1].index! : t.length
    out[h[1]] = t.slice(start, end).trim()
  })
  return out as Record<(typeof METKI)[number], string>
}

function zapasKak(f: Format13, nadpis: string, vKadre: string): string[] {
  const nad = nadpis ? [`Наложи надпись: ${nadpis.split('\n')[0].replace(/^Плашки?:\s*/i, '')}`] : []
  if (f.vyvod === 'sessiya') return ['Поставь телефон на уровне глаз и сядь как на сессии', 'Сними свою часть: реплики психолога подряд', 'Вторую часть сними как клиент: другая кофта или другой угол комнаты', 'В CapCut раздели экран на два окна: ты сверху, клиент снизу', ...nad]
  if (f.vyvod === 'scenka') return ['Поставь телефон на уровне глаз', 'Сними реплики первого героя подряд, потом второго', 'Для второй роли поменяй одну деталь: кофту, очки или место', 'В CapCut склей реплики по очереди', ...nad]
  if (f.vyvod === 'ekran') return [vKadre ? `Сними фон: ${vKadre}` : 'Сними спокойный фон на 15-20 секунд', 'Наложи надписи по очереди в CapCut или в редакторе Инстаграма, каждую на 2-3 секунды']
  return ['Поставь телефон на уровне глаз, сядь у окна', 'Скажи текст своими словами, подглядывать можно', ...nad]
}

export function razobrat(raw: string, f: Format13): Rezultat13 {
  let t = ochistit13(raw)
  const pod = otrezat(t, 'Подойдет еще')
  t = pod.do
  const kak = otrezat(t, 'Как снять')
  t = kak.do.trim()

  // «Подойдет еще»: «код: почему»; код проверяем по списку, свой формат и повторы выкидываем
  const podoydet: Podoydet[] = []
  for (const s of stroki(pod.blok)) {
    const m = s.match(/^[«"]?([a-z_]+)[»"]?\s*(?:\([^)]*\))?\s*[:,-]\s*(.+)$/i)
    if (!m) continue
    const kod = m[1].toLowerCase()
    if (!formatPo(kod) || kod === f.kod || podoydet.some(x => x.kod === kod)) continue
    podoydet.push({ kod, pochemu: m[2].trim().replace(/\.$/, '') })
    if (podoydet.length === 3) break
  }
  const podoydetOtModeli = podoydet.length === 3
  for (const kod of ZAPAS[f.vid]) {
    if (podoydet.length >= 3) break
    if (kod === f.kod || podoydet.some(x => x.kod === kod)) continue
    podoydet.push({ kod, pochemu: FORMATY.find(x => x.kod === kod)!.korotko })
  }

  let glavnoe = t, podpis = '', nadpis = '', vKadre = ''
  if (f.vid === 'reels') {
    const p = polyaRilsa(t)
    vKadre = p['В кадре']; podpis = p['Подпись']
    if (f.vyvod === 'ekran') glavnoe = p['Текст на экране'] || p['Речь']
    else { glavnoe = /^\s*нет\.?\s*$/i.test(p['Речь']) ? '' : p['Речь']; nadpis = p['Текст на экране'] }
    // модель забыла метки: весь текст до подписи и есть речь
    if (!glavnoe) glavnoe = t.split(/(?:^|\n)\s*Подпись\s*:/u)[0].trim()
  } else if (f.vid === 'carousel') {
    const m = t.match(/(?:^|\n)\s*Подпись\s*:\s*([\s\S]*)$/u)
    podpis = m ? m[1].trim() : ''
    glavnoe = m ? t.slice(0, m.index).trim() : t
  } else {
    // пост: подписи нет; если модель все же дала, оставляем ее в тексте
    glavnoe = t
  }

  let kakSnyat = f.vid === 'reels' ? stroki(kak.blok).slice(0, 8) : []
  const kakSnyatOtModeli = kakSnyat.length >= 2
  if (f.vid === 'reels' && !kakSnyatOtModeli) kakSnyat = zapasKak(f, nadpis, vKadre)

  return { tekst: t, glavnoe: glavnoe.trim(), podpis, nadpis, vKadre, kakSnyat, podoydet, kakSnyatOtModeli, podoydetOtModeli }
}
