// zh13: пометки только явного непонятного (ZH13-PRAVKI-ARINY.md, 19.11). Лучше пропустить, чем пометить живое:
// мат, метафоры, обрывки и неровный ритм не трогаем, слова не запрещаем. Пометка это фраза текста и ее код;
// перепись делает perepis.ts одним коротким вызовом на фразу.
import { frazy, slova, obshieCepochki, nGrams } from './tekst'

export type Pometka = { kod: string; fraza: string }
export const POMETKI: Record<string, string> = {
  anketa_geroya: 'Анкета героя (возраст и имущество подряд)',
  sud_dokumenty: 'Суд и документы про чувства',
  perevozhu: '«Перевожу.» или «прилетает» про сообщение',
  obryvki: 'Три одинаковых обрывка подряд',
  telo: 'Эмоция через тело (живот, плечи, челюсть, ком, кулаки, дыхание)',
  adresat: 'Неудобные вопросы не человеку',
  obrashchenie: '«Слушай», «Смотри», «Знаешь» в начале фразы повторяется',
  rvano: 'Рвано: три и больше фраз до 4 слов подряд',
  moral_konec: 'Мораль в конце текста',
  kopiya_zhizni: 'Почти дословно из живого примера темы (5 слов подряд)',
}

// Фраза почти дословно из живых строк темы (27.11): строки даются писателю образцом уровня, брать их нельзя,
// иначе у разных психологов выходят одинаковые фразы. 5 слов подряд с примером: перепись этой фразы своими словами.
// svoe: мысль автора и факты из его историй; цепочки, которые есть в них, копией не считаются (это слова автора)
export function pometitKopiyuZhizni(text: string, primery: string[], svoe: string[] = []): Pometka[] {
  if (!primery.length) return []
  const avtor = nGrams(svoe.join('\n'), 5)
  const kopiya = (f: string) => primery.some(p => obshieCepochki(f, p, 5).some(c => !avtor.has(c)))
  return [...new Set(frazy(text).filter(kopiya))].map(fraza => ({ kod: 'kopiya_zhizni', fraza }))
}

const VOZRAST = /(?<!\p{L})(?:\d{2}|двадцат\p{L}*|тридцат\p{L}*|сорок\p{L}*|пятьдесят\p{L}*|шестьдесят\p{L}*)(?:\s+с\s+лишним|\s+лет|\s+год\p{L}*)?(?!\p{L})/iu
const IMUSHCHESTVO = /(?<!\p{L})(машин\p{L}*|ипотек\p{L}*|квартир\p{L}*|дач\p{L}*|кредит\p{L}*|бизнес\p{L}*|двое детей|трое детей|муж и|жена и|должност\p{L}*|своя компания|загородн\p{L}* дом)(?!\p{L})/giu
// суд и бумаги в значении чувств (решение Арины 19.11). Две группы: суд и иск метим, если рядом нет юридического
// дела; «презентация», «доклад», «согласовать», «должность», «протокол» метим, если в этой или соседней фразе нет работы
// (настоящая презентация на работе живая). «Вынести приговор» не метим: живой оборот.
const SUD = /(?<!\p{L})(суд|суда|суде|судом|судить|судишь|судит|иск|иска|иском|встречн\p{L}* иск)(?!\p{L})/iu
const BUMAGI = /(?<!\p{L})(должност\p{L}*|согласова\p{L}*|доклад\p{L}*|презентаци\p{L}*|протокол\p{L}*)(?!\p{L})/iu
const YUR = /(?<!\p{L})(юрист\p{L}*|адвокат\p{L}*|алимент\p{L}*|судь[яиеюй]\p{L}*|заявлени\p{L}*|исков\p{L}*)(?!\p{L})/iu
const RABOTA = /(?<!\p{L})(начальни\p{L}*|руководител\p{L}*|коллег\p{L}*|офис\p{L}*|совещани\p{L}*|планерк\p{L}*|конференци\p{L}*|работ\p{L}*|заказчик\p{L}*|клиент\p{L}*|проект\p{L}*|отчет\p{L}*|договор\p{L}*|вакансi?\p{L}*|собеседовани\p{L}*)(?!\p{L})/iu
const PRILETAET = /(?<!\p{L})прилета\p{L}*|(?<!\p{L})прилетел\p{L}*/iu
const SOOBSHCHENIE = /(?<!\p{L})(сообщени\p{L}*|в ответ|в чат\p{L}*|смс|голосов\p{L}*|переписк\p{L}*|пишет|написал\p{L}*|ответ\p{L}*|коммент\p{L}*)(?!\p{L})/iu
const TELO_STARO = /(перестал\p{L}*\s+дышать|дышать\s+перестал\p{L}*|сжат\p{L}*\s+(?:\p{L}+\s+)?кулак\p{L}*|сжима\p{L}*\s+(?:\p{L}+\s+)?кулак\p{L}*|кулаки\s+сжат\p{L}*|задерж\p{L}*\s+(?:\p{L}+\s+)?дыхани\p{L}*|затаи\p{L}*\s+дыхани\p{L}*|(?:ком|комок)\s+в\s+(?:горле|груди))/iu
// часть тела и ее состояние рядом (до двух слов между, в любом порядке): «живот сжимается», «плечи уже напряжены»,
// «сжимаю челюсть», «дыхание сбивается» (правка Арины 19.11). Совет «сделай вдох» не метим: нужен глагол состояния.
const CHAST = String.raw`(?:живот\p{L}*|плеч\p{L}*|челюст\p{L}*|кулак\p{L}*|кулаки|дыхани\p{L}*|комок|ком)`
const SOST = String.raw`(?:сжима\p{L}*|сжал\p{L}*|сжат\p{L}*|сжа\p{L}*|скруч\p{L}*|свод\p{L}*|свел\p{L}*|крут\p{L}*|холоде\p{L}*|похолод\p{L}*|напряж\p{L}*|напряг\p{L}*|подним\p{L}*|поднял\p{L}*|подняты|зажат\p{L}*|зажим\p{L}*|камене\p{L}*|окамен\p{L}*|стис\p{L}*|сбива\p{L}*|сбил\p{L}*|сбит\p{L}*|перехват\p{L}*|учаща\p{L}*|замира\p{L}*|замер\p{L}*|подступа\p{L}*|встал\p{L}*|стоит|болят|болит|ноют|ноет|заныл\p{L}*)`
const TELO_RYADOM = new RegExp(String.raw`(?<!\p{L})(?:${CHAST}\s+(?:\p{L}+\s+){0,2}${SOST}|${SOST}\s+(?:\p{L}+\s+){0,2}${CHAST})(?!\p{L})`, 'iu')
const TELO = { test: (f: string) => TELO_STARO.test(f) || TELO_RYADOM.test(f) }
// адресат «неудобных вопросов»: человек (кто-то из жизни зрителя)
const CHELOVEK = /(?<!\p{L})(мам\p{L}*|пап\p{L}*|отц\p{L}*|отец|матер\p{L}*|мать|муж\p{L}*|жен\p{L}*|партнер\p{L}*|бывш\p{L}*|начальни\p{L}*|руководител\p{L}*|босс\p{L}*|свекров\p{L}*|тещ\p{L}*|свекр\p{L}*|подруг\p{L}*|друг\p{L}*|сестр\p{L}*|брат\p{L}*|родител\p{L}*|родн\p{L}*|родственни\p{L}*|коллег\p{L}*|советчик\p{L}*|бабушк\p{L}*|дедушк\p{L}*|сын\p{L}*|дочер\p{L}*|дочк\p{L}*|ребенк\p{L}*|детям|психолог\p{L}*|терапевт\p{L}*|врач\p{L}*|учител\p{L}*|соседк\p{L}*|сосед\p{L}*|парн\p{L}*|девушк\p{L}*|человек\p{L}*|людям|тем,\s+кто|тому,\s+кто|той,\s+кто|знаком\p{L}*|заказчик\p{L}*|клиент\p{L}*|блогер\p{L}*|тренер\p{L}*|себе)(?!\p{L})/iu

// форматы из надписей и кадров: короткие строки там и есть формат
const BEZ_RVANO = ['ekran', 'pov_assoc', 'pov_scenka', 'slyshit', 'film_bez']

export function rubrikaVoprosov(t: string): string | null {
  const m = String(t).match(/неудобные\s+вопросы\s+(.{2,80}?)\s+за\s+(?:вас|тебя)/iu)
  return m ? m[1].replace(/[«»"]/g, '').trim() : null
}

// пометки на основе текста (без подписи у рилса: подпись проверяется своими правилами)
export function pometit(glavnoe: string, kod: string, nadpis = ''): Pometka[] {
  const out: Pometka[] = []
  const F = frazy(glavnoe)
  const add = (k: string, f: string) => { if (!out.some(x => x.fraza === f)) out.push({ kod: k, fraza: f }) }
  F.forEach((f, i) => {
    // метки «Слайд N:» карусели в окно не идут: это не про работу
    const okno = F.slice(Math.max(0, i - 1), i + 2).join(' ').replace(/(?:^|\s)Слайд\s*\d+\s*:/gu, ' ')
    // анкета героя: возраст и два пункта имущества или статуса в одной фразе
    if (VOZRAST.test(f) && new Set((f.match(IMUSHCHESTVO) || []).map(x => x.toLowerCase())).size >= 2) add('anketa_geroya', f)
    if ((SUD.test(f) && !YUR.test(okno)) || (BUMAGI.test(f) && !RABOTA.test(okno))) add('sud_dokumenty', f)
    if (/^[«"]?\s*Перевожу[.!]?\s*[»"]?$/iu.test(f) || (PRILETAET.test(f) && SOOBSHCHENIE.test(f))) add('perevozhu', f)
    if (TELO.test(f)) add('telo', f)
  })
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
  // рвано: три и больше фраз до 4 слов подряд в одной реплике, без вопросов (правка Арины 19.11: «В тридцать два.
  // Пошла учиться. Не в двадцать, да. Но пошла.»). Место, уже помеченное как одинаковые обрывки, второй раз не метим.
  // Ищем внутри одной строки; строки с ролью («Клиентка:», «Кадр 2:») не трогаем: в диалоге и в кадрах короткие
  // реплики живые. Ремарки в звездочках не считаем фразами.
  const obr = out.filter(x => x.kod === 'obryvki').map(x => x.fraza)
  if (!BEZ_RVANO.includes(kod)) for (const line of glavnoe.split('\n')) {
    if (/^\s*[А-ЯЁA-Z][^:«»\n]{0,30}:/u.test(line)) continue
    const L = frazy(line.replace(/\*[^*]*\*/g, ' '))
    // заголовок раздела в начале строки («Первая работа.», «Все.»: до двух слов в начале строки) и хвост цитаты
    // («...мешать». И замолчи.) в счет не идут
    if (L.length && slova(L[0]).length <= 2 && !/[,]/.test(L[0])) L.shift()
    for (let i = 0; i < L.length; i++) {
      const korotk = (x: string) => !/\?/.test(x) && !/^[^«]*»/.test(x) && slova(x).length <= 4
      if (!korotk(L[i])) continue
      let j = i
      while (j + 1 < L.length && korotk(L[j + 1])) j++
      if (j - i + 1 >= 3) {
        const i0 = line.indexOf(L[i]), i2 = line.indexOf(L[j], i0)
        const kusok = i0 >= 0 && i2 >= 0 ? line.slice(i0, i2 + L[j].length) : ''
        if (kusok && !obr.some(o => o.includes(L[i]) || kusok.includes(o))) add('rvano', kusok)
      }
      i = j
    }
  }
  if (kod === 'voprosy') {
    const r = rubrikaVoprosov(`${nadpis}\n${glavnoe}`)
    if (r && !CHELOVEK.test(r)) add('adresat', r)
  }
  return out
}

// обращение в начале фразы («Слушай,», «Смотри,», «Знаешь,», правка Арины 19.11): слово живое, плохо только когда
// повторяется. Метим каждое место после первого в этом тексте (основной текст и подпись вместе), а если то же
// обращение было в прошлом тексте психолога, то и первое. Фраза для переписи из основного текста или из подписи.
const OBRASHCHENIE = /(?:^|[.!?…]\s+|:\s+|\n\s*|[«"]\s*|\s[-–]\s)(слушай(?:те)?|смотри(?:те)?|знаешь|знаете)(?=[\s,.!])/giu
const lemma = (w: string) => w.toLowerCase().replace(/те$/, '').replace(/знает$/, 'знаешь')
export function obrashcheniyaV(t: string): string[] {
  return [...String(t || '').matchAll(OBRASHCHENIE)].map(m => lemma(m[1]))
}
export const nachinaetsyaObrashcheniem = (f: string) => /^[«"\s]*(слушай(?:те)?|смотри(?:те)?|знаешь|знаете)(?=[\s,.!])/iu.test(f)

export function pometitObrashcheniya(glavnoe: string, podpis: string, proshlyy = ''): Pometka[] {
  const bylo = new Set(obrashcheniyaV(proshlyy))
  const seen: Record<string, number> = {}
  const out: Pometka[] = []
  for (const chast of [glavnoe, podpis]) {
    for (const f of frazy(chast)) {
      for (const w of obrashcheniyaV(f)) {
        seen[w] = (seen[w] || 0) + 1
        if ((seen[w] > 1 || bylo.has(w)) && !out.some(x => x.fraza === f)) out.push({ kod: 'obrashchenie', fraza: f })
      }
    }
  }
  return out
}
