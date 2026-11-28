// Представление в конце подписи (28.11, Арина: «можно в конце писать привет, я такая-то, такой психолог, тут мы
// говорим»). Строку собирает код, не модель: имя и темы берутся из профиля и в нейросеть не уходят, выдумать нечего.
// Не в каждой подписи (на десятом ролике надоест): в каждой третьей, формулировки по кругу. Темы блога из отмеченных
// групп знакомства (до двух); у старых профилей без групп только имя.
import { parseKlienty } from '@/lib/anketa'

const PRO: Record<string, string> = {
  trevoga: 'тревогу и стресс', samoocenka: 'самооценку и отношение к себе', otnosheniya: 'отношения',
  travma: 'травму и жизнь после нее', roditeli: 'отношения с родителями', deti: 'детей и подростков',
  rabota: 'работу и деньги', telo: 'тело и еду',
}

export function imyaAvtora(fullName: unknown): string | null {
  // «Психолог Анна» в поле имени: первое слово, кроме самого «психолог» (ревью 28.11)
  const imya = String(fullName || '').trim().split(/\s+/).find(w => !/^психолог/iu.test(w)) || ''
  if (!imya || imya.length > 20 || !/^\p{L}[\p{L}-]*$/u.test(imya)) return null
  return imya.charAt(0).toUpperCase() + imya.slice(1)
}

// n: сколько текстов у психолога уже было (со сдвигом по психологу): представление при n % 3 === 0
export function predstavlenie(profile: { full_name?: unknown; klienty?: unknown } | null | undefined, vy: boolean, n: number): string | null {
  if (n % 3 !== 0) return null
  const imya = imyaAvtora(profile?.full_name)
  if (!imya) return null
  const gruppy = parseKlienty(profile?.klienty).groups
  // пара и родители вместе: одной строкой, иначе «про отношения, про отношения с родителями» (copywriter 28.11)
  const temy = gruppy.includes('otnosheniya') && gruppy.includes('roditeli')
    ? ['отношения с партнером и с родителями', ...gruppy.filter(g => g !== 'otnosheniya' && g !== 'roditeli').map(g => PRO[g])]
    : gruppy.map(g => PRO[g])
  const pro = temy.filter(Boolean).slice(0, 2).map(x => `про ${x}`).join(', ')
  // тексты copywriter-psycont 28.11 (живые: «Так, я Лера, я психолог», «тут про счастливые отношения»)
  const t = vy
    ? [`Всем привет, я ${imya}, психолог.${pro ? ` Тут ${pro}.` : ' Будем знакомы.'}`,
      `Если вы тут впервые, давайте знакомиться: я ${imya}, психолог.${pro ? ` Рассказываю ${pro}.` : ''}`,
      `Меня зовут ${imya}, я психолог.${pro ? ` Чаще всего говорю здесь ${pro}.` : ''}`]
    : [`Привет, я ${imya}, психолог.${pro ? ` Тут ${pro}.` : ' Будем знакомы.'}`,
      `Если ты тут впервые, давай знакомиться: я ${imya}, психолог.${pro ? ` Рассказываю ${pro}.` : ''}`,
      `Меня зовут ${imya}, я психолог.${pro ? ` Чаще всего говорю здесь ${pro}.` : ''}`]
  return t[Math.floor(n / 3) % t.length]
}
