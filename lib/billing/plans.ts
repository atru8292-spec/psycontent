// Платные тарифы для оплаты и текст согласия на автопродление (17.11). Цена и имя берутся из lib/pricing.ts
// (тот же источник, что витрина и лендинг), код тарифа из dbCodes[0]: «Спокойный ритм» start, «Каждый день» practice.
// Модуль без серверных зависимостей: его импортируют и экраны, и сервер.
import { PLANS } from '@/lib/pricing'

export type PaidCode = 'start' | 'practice'
export type PaidPlan = { code: PaidCode; name: string; price: number; materials: number }

function fromPricing(code: PaidCode): PaidPlan {
  const p = PLANS.find(x => x.dbCodes[0] === code)
  if (!p || p.price <= 0) throw new Error(`pricing: нет платного тарифа ${code}`)
  return { code, name: p.name, price: p.price, materials: p.materials }
}

export const PAID_PLANS: Record<PaidCode, PaidPlan> = { start: fromPricing('start'), practice: fromPricing('practice') }
export const isPaidCode = (v: unknown): v is PaidCode => v === 'start' || v === 'practice'

// Текст согласия: показывается у галочки и пишется в autopay_consents дословно (copywriter-psycont 17.11)
export function consentText(plan: { name: string; price: number }): string {
  const p = `${plan.price.toLocaleString('ru-RU').replace(/\s/g, ' ')} ₽`
  return `Даю согласие на автоматические списания за тариф «${plan.name}»: ${p} каждый месяц с сохраненного способа оплаты, в то же число, что и эта оплата (если в месяце нет такого числа, в последний день месяца). Списания идут, пока я не отключу автопродление или не удалю способ оплаты в «Профиле», это срабатывает сразу. За 3 дня до каждого списания придет письмо с суммой и датой. Если списание не пройдет, будет еще не больше двух попыток: через день и через три дня. Если цена изменится, об этом напишут на почту не меньше чем за 10 дней, и новая цена начнет действовать только со следующего месяца.`
}
