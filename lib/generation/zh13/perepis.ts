// zh13: перепись только помеченной фразы (ZH13-PRAVKI-ARINY.md, 19.11). Один короткий вызов на фразу: «Скажи эту
// фразу проще и живее, смысл не меняй», рядом живой кусок того же формата и соседние фразы для смысла. Остальной
// текст не трогаем. Новую фразу не берем, если она заметно длиннее (больше чем в полтора раза и на 6 слов), снова
// попадает под ту же пометку, пустая, с метками или «ё»/тире. «Неудобные вопросы» не человеку переписываются
// целиком один раз (это делает pishi.ts новым вызовом писателя). Все в общем бюджете: нет времени, текст как есть.
import { callModel } from '../ai'
import { pometit, pometitRod, nachinaetsyaObrashcheniem, type Pometka } from './pometki'
import { aforizm, estGlagol, obshieCepochki } from './tekst'
import { podpisPerevertysh, kontrast } from './proverka'
import { ochistit13, slova, frazy } from './tekst'
import { PEREPIS_PODSKAZKA } from './pravki'

export type Perepis = { kod: string; do: string; posle: string; vzyato: boolean; pochemu?: string }

const SYSTEM = 'Ты редактор блога психолога. Ответ: только одна новая фраза (или несколько коротких фраз вместо нее), без кавычек и пояснений.'

function sosedi(text: string, fraza: string): string {
  const F = frazy(text)
  const i = F.findIndex(x => x.includes(fraza.slice(0, 40)) || fraza.includes(x))
  return i < 0 ? '' : F.slice(Math.max(0, i - 2), i + 3).join(' ')
}

export async function perepisatFrazy(o: {
  text: string; kod: string; nadpis: string; pometki: Pometka[]; kusok: string; mat: boolean; matPravilo?: string
  deadline: number; userId?: string; knownNames: string[]
  primery?: string[]   // живые строки темы: новая фраза на месте копии не должна снова совпадать с ними (27.11)
  auditoriya?: string  // пол аудитории из анкеты: новая фраза на месте пометки рода не должна снова быть с родом
}): Promise<{ text: string; perepis: Perepis[] }> {
  const zadachi = o.pometki.filter((p, i, a) => p.kod !== 'adresat' && o.text.includes(p.fraza) && a.findIndex(q => q.fraza === p.fraza) === i).slice(0, 4)
  const perepis: Perepis[] = []
  const ostatok = o.deadline - Date.now()
  if (!zadachi.length || ostatok < 8000) {
    for (const p of zadachi) perepis.push({ kod: p.kod, do: p.fraza, posle: '', vzyato: false, pochemu: 'нет времени' })
    return { text: o.text, perepis }
  }
  const res = await Promise.all(zadachi.map(async p => {
    try {
      const pd = PEREPIS_PODSKAZKA[p.kod]
      const user = [
        'Скажи эту фразу проще и живее, смысл не меняй.',
        `<фраза>\n${p.fraza}\n</фраза>`,
        pd ? `${pd.chto}${pd.para ? ` Например, было: «${pd.para.bylo}», живо: «${pd.para.zhivo}». Слова примера не бери.` : ''}` : '',
        `Рядом в тексте (для смысла, это не трогай):\n${sosedi(o.text, p.fraza)}`,
        `Так звучит живая речь (ее слова не бери):\n${o.kusok}`,
        `Как сказал бы живой человек другу, понятно с первого раза. ${o.matPravilo ? `${o.matPravilo} ` : o.mat ? '' : 'Без мата. '}Буква «е» вместо «ё», без длинных тире.`,
      ].filter(Boolean).join('\n\n')
      const raw = await callModel({ system: SYSTEM, user, effort: 'low', verbosity: 'low', maxTokens: 600, timeoutMs: Math.min(20000, o.deadline - Date.now()), writer: true, userId: o.userId, operation: 'generate_post_zh13_fraza', knownNames: o.knownNames })
      let nov = ochistit13(raw).replace(/^[«"]|[»"]$/g, '').replace(/\n+/g, ' ').trim()
      // открытая кавычка без закрытой (модель обрывает реплику): закрываем
      if ((nov.match(/«/g) || []).length > (nov.match(/»/g) || []).length) nov += '»'
      const a = slova(p.fraza).length, b = slova(nov).length
      let pochemu = ''
      if (!nov) pochemu = 'пусто'
      else if (b > a * 1.5 && b > a + 6) pochemu = 'длиннее'
      else if (pometit(nov, o.kod).some(x => x.kod === p.kod)) pochemu = 'та же пометка'
      else if (pometit(nov, o.kod).length) pochemu = 'новая пометка'
      // обрывки: вместо трех коротких фраз нужна одна мысль, а не те же обрывки другими словами
      else if ((p.kod === 'obryvki' || p.kod === 'rvano') && frazy(nov).length >= 3) pochemu = 'опять обрывки'
      else if (p.kod === 'obrashchenie' && frazy(nov).some(nachinaetsyaObrashcheniem)) pochemu = 'та же пометка'
      else if (p.kod === 'moral_konec' && (frazy(nov).some(aforizm) || /не\s+в\s+том/iu.test(nov))) pochemu = 'снова мораль'
      else if (p.kod === 'kopiya_zhizni' && (o.primery || []).some(x => obshieCepochki(nov, x, 5).length)) pochemu = 'снова копия'
      else if (p.kod === 'rod' && pometitRod(nov, o.auditoriya || '', o.kod).length) pochemu = 'снова род'
      else if (/<|>|^(Речь|Подпись|Текст на экране)\s*:/i.test(nov)) pochemu = 'метки'
      return { kod: p.kod, do: p.fraza, posle: nov, vzyato: !pochemu, ...(pochemu ? { pochemu } : {}) }
    } catch {
      return { kod: p.kod, do: p.fraza, posle: '', vzyato: false, pochemu: 'ошибка вызова' }
    }
  }))
  let text = o.text
  for (const r of res) {
    perepis.push(r)
    // заменяем только первое вхождение помеченной фразы, остальной текст как был
    if (r.vzyato) text = text.replace(r.do, r.posle)
  }
  return { text, perepis }
}

// подпись с моралью (или у карусели zh6 с вопросом подписчикам): переписываем только подпись одним коротким вызовом
// по живым подписям-образцам. Новая тоже с моралью, с вопросом, длинная или с пометкой: оставляем старую.
export async function perepisatPodpis(o: {
  podpis: string; glavnoe: string; prichina: 'moral' | 'vopros' | 'perevertysh'; obrazcy: string[]; mat: boolean; matPravilo?: string
  deadline: number; userId?: string; knownNames: string[]; moral: (p: string) => boolean; vopros: (p: string) => boolean
}): Promise<Perepis> {
  const base = { kod: `podpis_${o.prichina}`, do: o.podpis }
  if (o.deadline - Date.now() < 8000) return { ...base, posle: '', vzyato: false, pochemu: 'нет времени' }
  try {
    const user = [
      `Перепиши подпись под публикацией. Сейчас она ${o.prichina === 'moral' ? 'кончается выводом, как мораль' : o.prichina === 'perevertysh' ? 'из коротких фраз с противопоставлением, как афоризм-перевертыш, это режет глаз' : 'кончается вопросом к подписчикам'}.`,
      `Так звучат живые подписи (их слова не бери):\n${o.obrazcy.map(x => `- ${x}`).join('\n')}`,
      `Текст, под которым подпись:\n<текст>\n${o.glavnoe.slice(0, 1500)}\n</текст>`,
      `<подпись>\n${o.podpis}\n</подпись>`,
      `Одна-две строки обычной речью: что было или что ты думаешь. Без морали, без противопоставления, без игры слов и иронии, которую надо разгадывать, без вопроса подписчикам, не начинай с «Можно» и «Иногда». ${o.matPravilo ? `${o.matPravilo} ` : o.mat ? '' : 'Без мата. '}Буква «е» вместо «ё», без длинных тире. Ответ: только новая подпись.`,
    ].join('\n\n')
    const raw = await callModel({ system: SYSTEM, user, effort: 'low', verbosity: 'low', maxTokens: 600, timeoutMs: Math.min(20000, o.deadline - Date.now()), writer: true, userId: o.userId, operation: 'generate_post_zh13_podpis', knownNames: o.knownNames })
    const nov = ochistit13(raw).replace(/^Подпись\s*:\s*/i, '').replace(/^[«"]|[»"]$/g, '').trim()
    let pochemu = ''
    if (!nov) pochemu = 'пусто'
    else if (o.moral(nov)) pochemu = 'снова мораль'
    else if (podpisPerevertysh(nov)) {
      // новая тоже перевертыш: оставляем одну спокойную фразу из нее (с глаголом, без противопоставления)
      const odna = frazy(nov).find(f => slova(f).length >= 5 && estGlagol(f) && !kontrast(f) && !o.moral(f) && !o.vopros(f))
      if (odna) return { ...base, posle: odna, vzyato: true, pochemu: 'одна фраза из перевертыша' }
      pochemu = 'снова перевертыш'
    }
    else if (o.vopros(nov)) pochemu = 'снова вопрос'
    else if (slova(nov).length > Math.max(40, slova(o.podpis).length * 1.5)) pochemu = 'длиннее'
    else if (/^(можно|иногда)(?![а-яё])/i.test(nov)) pochemu = 'шаблон начала'
    return { ...base, posle: nov, vzyato: !pochemu, ...(pochemu ? { pochemu } : {}) }
  } catch {
    return { ...base, posle: '', vzyato: false, pochemu: 'ошибка вызова' }
  }
}
