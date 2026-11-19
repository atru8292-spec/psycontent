// zh13: пометки только явного непонятного (ZH13-PRAVKI-ARINY.md, 19.11). Лучше пропустить, чем пометить живое:
// мат, метафоры, обрывки и неровный ритм не трогаем, слова не запрещаем. Пометка это фраза текста и ее код;
// перепись делает perepis.ts одним коротким вызовом на фразу.
import { frazy, slova } from './tekst'

export type Pometka = { kod: string; fraza: string }
export const POMETKI: Record<string, string> = {
  anketa_geroya: 'Анкета героя (возраст и имущество подряд)',
  sud_dokumenty: 'Суд и документы про чувства',
  perevozhu: '«Перевожу.» или «прилетает» про сообщение',
  obryvki: 'Три одинаковых обрывка подряд',
  telo: 'Эмоция через тело (кулаки, дыхание, ком в горле)',
  adresat: 'Неудобные вопросы не человеку',
}

const VOZRAST = /(?<!\p{L})(?:\d{2}|двадцат\p{L}*|тридцат\p{L}*|сорок\p{L}*|пятьдесят\p{L}*|шестьдесят\p{L}*)(?:\s+с\s+лишним|\s+лет|\s+год\p{L}*)?(?!\p{L})/iu
const IMUSHCHESTVO = /(?<!\p{L})(машин\p{L}*|ипотек\p{L}*|квартир\p{L}*|дач\p{L}*|кредит\p{L}*|бизнес\p{L}*|двое детей|трое детей|муж и|жена и|должност\p{L}*|своя компания|загородн\p{L}* дом)(?!\p{L})/giu
// суд и бумаги в значении чувств; «иск» только как слово (не «искать»), «суд» не «посуда»
const SUD = /(?<!\p{L})(суд|суда|суде|судом|судить|судишь|судит|иск|иска|иском|встречн\p{L}* иск|должност\p{L}*|согласова\p{L}*|доклад\p{L}*|презентаци\p{L}*|протокол\p{L}*)(?!\p{L})/iu
// эти слова в прямом смысле (работа, суд по делу) не метим
const SUD_PRYAMO = /(?<!\p{L})(начальник\p{L}*|коллег\p{L}*|офис\p{L}*|совещани\p{L}*|юрист\p{L}*|адвокат\p{L}*|алимент\p{L}*|развод\p{L}*|заявлени\p{L}*|конференци\p{L}*|слайд\p{L}*)(?!\p{L})/iu
const PRILETAET = /(?<!\p{L})прилета\p{L}*|(?<!\p{L})прилетел\p{L}*/iu
const SOOBSHCHENIE = /(?<!\p{L})(сообщени\p{L}*|в ответ|в чат\p{L}*|смс|голосов\p{L}*|переписк\p{L}*|пишет|написал\p{L}*|ответ\p{L}*|коммент\p{L}*)(?!\p{L})/iu
const TELO = /(перестал\p{L}*\s+дышать|дышать\s+перестал\p{L}*|сжат\p{L}*\s+(?:\p{L}+\s+)?кулак\p{L}*|сжима\p{L}*\s+(?:\p{L}+\s+)?кулак\p{L}*|кулаки\s+сжат\p{L}*|задерж\p{L}*\s+(?:\p{L}+\s+)?дыхани\p{L}*|затаи\p{L}*\s+дыхани\p{L}*|(?:ком|комок)\s+в\s+горле)/iu
// адресат «неудобных вопросов»: человек (кто-то из жизни зрителя)
const CHELOVEK = /(?<!\p{L})(мам\p{L}*|пап\p{L}*|отц\p{L}*|отец|матер\p{L}*|мать|муж\p{L}*|жен\p{L}*|партнер\p{L}*|бывш\p{L}*|начальни\p{L}*|руководител\p{L}*|босс\p{L}*|свекров\p{L}*|тещ\p{L}*|свекр\p{L}*|подруг\p{L}*|друг\p{L}*|сестр\p{L}*|брат\p{L}*|родител\p{L}*|родн\p{L}*|родственни\p{L}*|коллег\p{L}*|советчик\p{L}*|бабушк\p{L}*|дедушк\p{L}*|сын\p{L}*|дочер\p{L}*|дочк\p{L}*|ребенк\p{L}*|детям|психолог\p{L}*|терапевт\p{L}*|врач\p{L}*|учител\p{L}*|соседк\p{L}*|сосед\p{L}*|парн\p{L}*|девушк\p{L}*|человек\p{L}*|людям|тем,\s+кто|тому,\s+кто|той,\s+кто|знаком\p{L}*|заказчик\p{L}*|клиент\p{L}*|блогер\p{L}*|тренер\p{L}*|себе)(?!\p{L})/iu

export function rubrikaVoprosov(t: string): string | null {
  const m = String(t).match(/неудобные\s+вопросы\s+(.{2,80}?)\s+за\s+(?:вас|тебя)/iu)
  return m ? m[1].replace(/[«»"]/g, '').trim() : null
}

// пометки на основе текста (без подписи у рилса: подпись проверяется своими правилами)
export function pometit(glavnoe: string, kod: string, nadpis = ''): Pometka[] {
  const out: Pometka[] = []
  const F = frazy(glavnoe)
  const add = (k: string, f: string) => { if (!out.some(x => x.fraza === f)) out.push({ kod: k, fraza: f }) }
  for (const f of F) {
    // анкета героя: возраст и два пункта имущества или статуса в одной фразе
    if (VOZRAST.test(f) && new Set((f.match(IMUSHCHESTVO) || []).map(x => x.toLowerCase())).size >= 2) add('anketa_geroya', f)
    if (SUD.test(f) && !SUD_PRYAMO.test(f)) add('sud_dokumenty', f)
    if (/^[«"]?\s*Перевожу[.!]?\s*[»"]?$/iu.test(f) || (PRILETAET.test(f) && SOOBSHCHENIE.test(f))) add('perevozhu', f)
    if (TELO.test(f)) add('telo', f)
  }
  // три и больше коротких обрывка подряд с одним первым словом («Не разбивать. Не спорить. Не попадаться»)
  for (let i = 0; i + 2 < F.length; i++) {
    const w = F.slice(i, i + 3)
    // метки ролей («Клиент:») не считаем словами обрывка
    const sl = w.map(x => slova(x.replace(/^\s*[А-ЯЁ][а-яё]+(?: \d)?\s*:\s*/u, '')))
    // одна реплика (без переноса строки между обрывками), без вопросов: в диалоге «На кого? / На него» это живой обмен
    const i0x = glavnoe.indexOf(w[0]), i2x = glavnoe.indexOf(w[2], i0x)
    const odnaStroka = i0x >= 0 && i2x >= 0 && !glavnoe.slice(i0x, i2x).includes('\n')
    if (odnaStroka && !w.some(x => /\?/.test(x)) && sl.every(x => x.length >= 1 && x.length <= 4) && sl.every(x => x[0] === sl[0][0])) { const i0 = glavnoe.indexOf(w[0]), i2 = glavnoe.indexOf(w[2], i0); add('obryvki', i0 >= 0 && i2 >= 0 ? glavnoe.slice(i0, i2 + w[2].length) : w.join(' ')); i += 2 }
  }
  if (kod === 'voprosy') {
    const r = rubrikaVoprosov(`${nadpis}\n${glavnoe}`)
    if (r && !CHELOVEK.test(r)) add('adresat', r)
  }
  return out
}
