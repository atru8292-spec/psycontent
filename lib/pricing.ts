// Тарифы для показа: лендинг и витрина в настройках кабинета (components/TariffSection.tsx) читают
// только отсюда. Цены еще не утверждены окончательно, Арина меняет их здесь, в разметке цифр нет.
// ТОЛЬКО ПОКАЗ: лимиты, списания и план человека живут в базе (plans) и lib/energy.ts, этот файл
// их не меняет и ими не управляет. Оплата не подключена, платные тарифы ведут в регистрацию.
// Единица счета для человека: материал (один пост, одна карусель, один рилс или одна серия сторис).

export type PlanId = 'trial' | 'calm' | 'daily'

export type PricePlan = {
  id: PlanId
  name: string
  price: number            // рублей в месяц, 0 для пробного
  yearPrice?: number       // рублей за год (год за 10 месяцев), показывается при PRICING_FLAGS.yearly
  promoFirstMonth?: number // цена первого месяца, показывается при PRICING_FLAGS.promo
  materials: number        // материалов в месяц, у пробного за все время
  carousels: number        // из них каруселей с картинками
  perMonth: boolean        // false: лимит на все время (пробный)
  who: string              // кому, одной строкой
  extra?: string[]         // пункты сверх чисел
  dbCodes: string[]        // какие коды из таблицы plans показываются как этот тариф («Ты здесь» в настройках)
  track: 'free' | 'calm' | 'daily' // код для события land_cta_click
}

// Акция первого месяца и годовая оплата выключены, пока нет оплаты
export const PRICING_FLAGS = { promo: false, yearly: false, paymentsOn: false }

export const PLANS: PricePlan[] = [
  {
    id: 'trial', name: 'Пробный', price: 0, materials: 10, carousels: 1, perMonth: false,
    who: 'Проверить, звучит ли как ты, и решить, нужно ли', extra: ['карта не нужна'], dbCodes: ['free'], track: 'free',
  },
  {
    id: 'calm', name: 'Спокойный ритм', price: 1290, yearPrice: 12900, promoFirstMonth: 690, materials: 50, carousels: 6, perMonth: true,
    who: 'Если выкладываешь 2-3 раза в неделю', dbCodes: ['start'], track: 'calm',
  },
  {
    id: 'daily', name: 'Каждый день', price: 2490, yearPrice: 24900, promoFirstMonth: 1290, materials: 150, carousels: 15, perMonth: true,
    who: 'Если ведешь блог почти каждый день и раскладываешь мысль на пять форматов', dbCodes: ['practice'], track: 'daily',
  },
]

// Что есть во всех тарифах: голос, правки текста, остаток переносится
export const PLAN_COMMON_LINE = 'Во всех тарифах PsyCont учится твоему голосу, тексты можно править, а неистраченные материалы переходят на следующий месяц.'
export const MATERIAL_NOTE = 'Материал это один пост, одна карусель, один рилс или одна серия сторис. Если собрать из одной мысли пост и карусель, это два материала.'

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}

// Пункты карточки из чисел конфига, чтобы цифры жили в одном месте
export function planPerks(p: PricePlan): string[] {
  const mats = `${p.materials} ${plural(p.materials, 'материал', 'материала', 'материалов')}${p.perMonth ? ' в месяц' : ', без срока'}`
  const cars = `${p.perMonth ? 'из них ' : ''}${p.carousels} ${plural(p.carousels, 'карусель', 'карусели', 'каруселей')} с картинками`
  return [mats, cars, ...(p.extra || [])]
}

export const formatRub = (n: number) => `${n.toLocaleString('ru-RU').replace(/\s/g, ' ')} ₽`

export const planForDbCode = (code?: string | null) => PLANS.find(p => code && p.dbCodes.includes(code)) || null
