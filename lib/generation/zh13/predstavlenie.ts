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
  const imya = String(fullName || '').trim().split(/\s+/)[0] || ''
  if (!imya || imya.length > 20 || !/^\p{L}[\p{L}-]*$/u.test(imya)) return null
  return imya.charAt(0).toUpperCase() + imya.slice(1)
}

// n: сколько текстов у психолога уже было (со сдвигом по психологу): представление при n % 3 === 0
export function predstavlenie(profile: { full_name?: unknown; klienty?: unknown } | null | undefined, vy: boolean, n: number): string | null {
  if (n % 3 !== 0) return null
  const imya = imyaAvtora(profile?.full_name)
  if (!imya) return null
  const pro = parseKlienty(profile?.klienty).groups.map(g => PRO[g]).filter(Boolean).slice(0, 2).map(x => `про ${x}`).join(' и ')
  const t = vy
    ? [`Если вы здесь впервые: я ${imya}, психолог.${pro ? ` Здесь говорим ${pro}.` : ''}`,
      `Я ${imya}, психолог${pro ? `, пишу ${pro}` : ''}. Если откликается, оставайтесь.`,
      `Привет, я ${imya}, психолог.${pro ? ` Тут мы говорим ${pro}.` : ''}`]
    : [`Если ты здесь впервые: я ${imya}, психолог.${pro ? ` Здесь говорим ${pro}.` : ''}`,
      `Я ${imya}, психолог${pro ? `, пишу ${pro}` : ''}. Если откликается, оставайся.`,
      `Привет, я ${imya}, психолог.${pro ? ` Тут мы говорим ${pro}.` : ''}`]
  return t[Math.floor(n / 3) % t.length]
}
