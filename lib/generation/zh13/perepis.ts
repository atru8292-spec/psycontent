// zh13: перепись только помеченной фразы (ZH13-PRAVKI-ARINY.md, 19.11). Один короткий вызов на фразу: «Скажи эту
// фразу проще и живее, смысл не меняй», рядом живой кусок того же формата и соседние фразы для смысла. Остальной
// текст не трогаем. Новую фразу не берем, если она заметно длиннее (больше чем в полтора раза и на 6 слов), снова
// попадает под ту же пометку, пустая, с метками или «ё»/тире. «Неудобные вопросы» не человеку переписываются
// целиком один раз (это делает pishi.ts новым вызовом писателя). Все в общем бюджете: нет времени, текст как есть.
import { callModel } from '../ai'
import { pometit, type Pometka } from './pometki'
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
  text: string; kod: string; nadpis: string; pometki: Pometka[]; kusok: string; mat: boolean
  deadline: number; userId?: string; knownNames: string[]
}): Promise<{ text: string; perepis: Perepis[] }> {
  const zadachi = o.pometki.filter(p => p.kod !== 'adresat' && o.text.includes(p.fraza)).slice(0, 4)
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
        pd ? `${pd.chto} Например, было: «${pd.para.bylo}», живо: «${pd.para.zhivo}». Слова примера не бери.` : '',
        `Рядом в тексте (для смысла, это не трогай):\n${sosedi(o.text, p.fraza)}`,
        `Так звучит живая речь (ее слова не бери):\n${o.kusok}`,
        `Как сказал бы живой человек другу, понятно с первого раза. ${o.mat ? '' : 'Без мата. '}Буква «е» вместо «ё», без длинных тире.`,
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
      else if (p.kod === 'obryvki' && frazy(nov).length >= 3) pochemu = 'опять обрывки'
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
