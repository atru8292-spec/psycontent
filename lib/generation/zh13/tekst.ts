// zh13: функции текста из опыта ~/Downloads/psy-zh7 (zh8 korpus и podbor, zh12 ritm и chasti, zh11 analiz,
// zh13 write), перенесены без изменений, чтобы мера на проде совпадала с мерой опыта.

// ---- слова и сходство (zh8/korpus) ----
export const slova = (s: string) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean)
export function nGrams(s: string, n: number): Set<string> { const w = slova(s); const out = new Set<string>(); for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' ')); return out }
export function shodstvo(a: string, b: string, n = 3): number { const A = nGrams(a, n), B = nGrams(b, n); if (!A.size) return 0; let k = 0; for (const g of A) if (B.has(g)) k++; return k / A.size }
// общие цепочки из n слов (проверка копирования)
export function obshieCepochki(a: string, b: string, n = 6): string[] { const B = nGrams(b, n); return [...nGrams(a, n)].filter(g => B.has(g)) }

// ---- та же тема (zh8/podbor) ----
const STOP_TEMA = new Set(['почему', 'которые', 'который', 'человек', 'кажется', 'стоит', 'после', 'когда', 'чтобы', 'тебе', 'тебя', 'всего', 'очень', 'своей', 'своих', 'всех', 'раз', 'за'])
const korni = (s: string) => [...new Set(slova(s).filter(w => w.length >= 5 && !STOP_TEMA.has(w)).map(w => w.slice(0, 5)))]
export function taZheTema(tema: string, tekst: string): boolean {
  const k = korni(tema); if (k.length < 2) return false
  const t = new Set(slova(tekst).map(w => w.slice(0, 5)))
  const hit = k.filter(x => t.has(x)).length
  return hit >= Math.max(2, Math.ceil(k.length * 0.6))
}
export function pohozhe(a: string, b: string): boolean {
  const A = new Set(korni(a)), B = new Set(korni(b)); if (!A.size || !B.size) return false
  let k = 0; for (const x of A) if (B.has(x)) k++
  return k / Math.min(A.size, B.size) > 0.34
}

// ---- ритм (zh12/ritm) ----
export type Ritm = {
  tekstov: number; slov: number; fraz: number
  sd: number; srednyaya: number; korotkie: number; dlinnye: number
  sdKuski: number; korotkieKuski: number
  bezGlagola: number; nachalaIAN: number
  vstavki: number; povtory: number; perebiv: number; voprosySebe: number
}
export const frazy = (t: string) => String(t).split(/(?<=[.!?…])\s+|\n+/u).map(x => x.trim()).filter(x => slova(x).length)
export const kuski = (t: string) => String(t).split(/[.!?…,;:]+|\s[-–—]\s|\n+/u).map(x => x.trim()).filter(x => slova(x).length)
const GLAGOL = /(?:ть|ться|ти|чь|л|ла|ло|ли|лся|лась|лось|лись|ет|ют|ут|ит|ат|ят|ешь|ишь|ем|им|ете|ите|ется|ются|ится|ятся|ешься|ишься|айте|йте|ись|ясь|ая|яя|ав|ив|ув)$/u
const SKAZ = new Set(['надо', 'нужно', 'можно', 'нельзя', 'нет', 'есть', 'жаль', 'пора', 'хватит', 'стоп'])
export const estGlagol = (f: string) => slova(f).some(w => (w.length > 3 && GLAGOL.test(w)) || SKAZ.has(w))
const NACH = /^[«"(]*\s*(и|а|но|ну)(?!\p{L})/iu
const VSTAVKI = /(?<!\p{L})(короче|слушай|слушайте|вот|типа|блин|кстати|честно|знаешь|знаете|понимаешь|понимаете|в общем|как бы|прикинь|смотри|смотрите|представь|представьте|ой|ох|ага|угу|да ладно|ладно)(?!\p{L})/giu
const PEREBIV = /(?<!\p{L})(нет, не так|не, не|вернее|точнее|хотя нет|стоп|в смысле|ну то есть|я не про это|не совсем|ой, нет)(?!\p{L})/giu
const POVTOR = /(?<!\p{L})(\p{L}{2,})[\s,!.]+\1(?!\p{L})/giu
const YA = /(?<!\p{L})(я|мне|меня|мной|мой|моя|мое|мои|себе|себя)(?!\p{L})/iu
const sdOf = (xs: number[]) => { if (!xs.length) return 0; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) }
const r1 = (x: number) => Math.round(x * 10) / 10
const dolya = (n: number, d: number) => d ? r1(n / d * 100) : 0
export function ritm(teksty: string[]): Ritm {
  const F = teksty.flatMap(frazy), K = teksty.flatMap(kuski)
  const dl = F.map(f => slova(f).length), dk = K.map(k => slova(k).length)
  const W = teksty.reduce((s, t) => s + slova(t).length, 0)
  const cnt = (re: RegExp) => teksty.reduce((s, t) => s + (t.match(re) || []).length, 0)
  return {
    tekstov: teksty.length, slov: W, fraz: F.length,
    sd: r1(sdOf(dl)), srednyaya: r1(dl.reduce((a, b) => a + b, 0) / Math.max(1, dl.length)),
    korotkie: dolya(dl.filter(n => n <= 4).length, dl.length), dlinnye: dolya(dl.filter(n => n >= 20).length, dl.length),
    sdKuski: r1(sdOf(dk)), korotkieKuski: dolya(dk.filter(n => n <= 4).length, dk.length),
    bezGlagola: dolya(F.filter(f => !estGlagol(f)).length, F.length), nachalaIAN: dolya(F.filter(f => NACH.test(f)).length, F.length),
    vstavki: W ? r1(cnt(VSTAVKI) / W * 1000) + r1((teksty.join(' ').match(/\([^)]{2,60}\)/g) || []).length / W * 1000) : 0,
    povtory: W ? r1(cnt(POVTOR) / W * 1000) : 0, perebiv: W ? r1(cnt(PEREBIV) / W * 1000) : 0,
    voprosySebe: W ? r1(F.filter(f => /\?\s*$/.test(f) && YA.test(f)).length / W * 1000) : 0,
  }
}
// отклонение от живых (zh12/analiz12): среднее относительное отклонение по шести мерам, меньше = ближе
const MERY: (keyof Ritm)[] = ['sd', 'korotkie', 'dlinnye', 'sdKuski', 'korotkieKuski', 'bezGlagola']
export function blizost(r: Ritm, z: Ritm): number {
  const d = MERY.map(m => Math.abs((r[m] as number) - (z[m] as number)) / Math.max(1, z[m] as number))
  return Math.round(d.reduce((a, b) => a + b, 0) / d.length * 100) / 100
}

// ---- части текста (zh12/chasti): речь рилса, слайды карусели, тело поста; подпись отдельно ----
export const podpisIz = (t: string) => (String(t).match(/(?:^|\n)\s*Подпись\s*:\s*([\s\S]*)$/u) || [])[1]?.trim() || ''
const bezPodpisi = (t: string) => String(t).split(/(?:^|\n)\s*Подпись\s*:/u)[0]
const bezRoley = (t: string) => t.replace(/^\s*(?:[А-ЯЁ][а-яё]+(?: \d)?)\s*:\s*/gmu, '').replace(/^\s*\d+[.)]\s*/gmu, '')
export function osnova(t: string, f: 'reels' | 'carousel' | 'post'): string {
  const b = bezPodpisi(t)
  if (f === 'reels') {
    const rech = b.split(/(?:^|\n)\s*Речь\s*:/u)[1]
    if (!rech || /^\s*нет\.?\s*$/iu.test(rech)) return ''
    return bezRoley(rech).trim()
  }
  if (f === 'carousel') return b.replace(/^\s*Слайд\s*\d+\s*:\s*/gmu, '').trim()
  return b.trim()
}

// ---- мораль (zh11/analiz11): короткая обобщающая фраза-вывод ----
const OBSH = /(?<!\p{L})(можно|нельзя|не обязательно|необязательно|не нужно|нужно|вполне|бывает|всегда|никогда|любой|любая|каждый|каждая|это и есть|вот и все|в этом и|начинается|заканчивается|не единственн|не доказывает|значит|право на|имеешь право|имеете право)(?!\p{L})/iu
export const aforizm = (f: string) => !/\?\s*$/.test(f) && slova(f).length <= 14 && OBSH.test(f)

// ---- чистка (zh13/write ochistit13): служебные метки в угловых скобках, «ё», длинные тире ----
export const ochistit13 = (t: string) => String(t)
  .replace(/^\s*<\/?(?:текст|живой кусок|образец[^>]*|Образец[^>]*)>\s*$/gimu, '')
  .replace(/<\/?(?:текст|живой кусок)>/giu, '')
  .replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-').replace(/\*\*/g, '')
  .replace(/\n{3,}/g, '\n\n').trim()
