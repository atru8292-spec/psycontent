import { nextSegmentStart } from './billing/period'

// Тарифы для показа: лендинг и витрина в настройках кабинета (components/TariffSection.tsx) читают
// только отсюда. Цены еще не утверждены окончательно, Арина меняет их здесь, в разметке цифр нет.
// ТОЛЬКО ПОКАЗ: лимиты, списания и план человека живут в базе (plans) и lib/energy.ts, этот файл
// их не меняет и ими не управляет. Открыта ли оплата, решает сервер (lib/billing/ready.ts), не этот файл.
// Единица счета для человека: текст (один пост, одна карусель или один сценарий рилса; решение Арины 17.11, раньше «материал»;
// сторис и пост для Telegram убраны 20.11: в «Написать» их нет).

export type PlanId = 'trial' | 'calm' | 'daily'

export type PricePlan = {
  id: PlanId
  name: string
  price: number            // рублей в месяц, 0 для пробного
  yearPrice?: number       // рублей за год (год за 10 месяцев), показывается при PRICING_FLAGS.yearly
  promoFirstMonth?: number // цена первого месяца, показывается при PRICING_FLAGS.promo
  materials: number        // материалов в месяц, у пробного за все время
  perMonth: boolean        // false: лимит на все время (пробный)
  who: string              // кому, одной строкой
  what: string             // что входит, одной-двумя фразами (нужно и для ЮKassa: описание услуги у каждого тарифа)
  extra?: string[]         // пункты сверх чисел
  dbCodes: string[]        // какие коды из таблицы plans показываются как этот тариф («Ты здесь» в настройках)
  track: 'free' | 'calm' | 'daily' // код для события land_cta_click
}

// Акция первого месяца и годовая оплата выключены. Признака «оплата открыта» тут нет (20.11): его считает сервер
// тем же правилом, что открывает оплату (lib/billing/ready.ts: paymentsOnFor, paymentsOpenForAll)
export const PRICING_FLAGS = { promo: false, yearly: false }

export const PLANS: PricePlan[] = [
  {
    id: 'trial', name: 'Пробный', price: 0, materials: 10, perMonth: false,
    who: 'Проверить, звучит ли как ты, и решить, нужно ли',
    what: '10 текстов, чтобы проверить сервис целиком: пост, карусель или сценарий рилса твоим голосом из одной мысли, план тем на месяц и оформление каруселей.', extra: ['карта не нужна'], dbCodes: ['free'], track: 'free',
  },
  {
    id: 'calm', name: 'Спокойный ритм', price: 1290, yearPrice: 12900, promoFirstMonth: 690, materials: 50, perMonth: true,
    who: 'Если выкладываешь 2-3 раза в неделю',
    what: 'Месяц доступа ко всему сервису: 50 текстов твоим голосом (пост, карусель или сценарий рилса), план тем и оформление каруселей.', dbCodes: ['start'], track: 'calm',
  },
  {
    id: 'daily', name: 'Каждый день', price: 2490, yearPrice: 24900, promoFirstMonth: 1290, materials: 150, perMonth: true,
    who: 'Если ведешь блог почти каждый день',
    what: 'Месяц доступа ко всему сервису: 150 текстов твоим голосом (пост, карусель или сценарий рилса), план тем и оформление каруселей.', dbCodes: ['practice', 'expert'], track: 'daily',
  },
]

// Что есть во всех тарифах: голос и правки текста. Остаток текстов на следующий месяц НЕ переносится, не обещать
export const PLAN_COMMON_LINE = 'Во всех тарифах PsyCont учится твоему голосу, а тексты можно править.'
// Как человек получает услугу (требование ЮKassa): строка у каждого платного тарифа на лендинге и в Профиле, то же в оферте
export const AFTER_PAY_LINE = 'После оплаты тариф включается в кабинете сразу.'
export const TRIAL_START_LINE = 'Включается в кабинете сразу после регистрации.'
export const startLine = (p: PricePlan) => (p.price > 0 ? AFTER_PAY_LINE : TRIAL_START_LINE)
export const MATERIAL_NOTE = 'Текст это один пост, одна карусель или один сценарий рилса. Если из одной мысли сделать пост и карусель, это два текста.'

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}

// Подлимита каруселей нет (решение Арины 12.11, fix/tarify): вместо «из них N каруселей» одна строка про любые форматы,
// текст copywriter-psycont. «С картинками» не писать: AI-картинки к каруселям еще не сделаны
const FORMATS_LINE = 'посты, карусели и рилсы в любом сочетании'

// Пункты карточки из чисел конфига, чтобы цифры жили в одном месте
export function planPerks(p: PricePlan): string[] {
  const mats = `${p.materials} ${plural(p.materials, 'текст', 'текста', 'текстов')}${p.perMonth ? ' в месяц' : ', без срока'}`
  return [mats, FORMATS_LINE, ...(p.extra || [])]
}

export const formatRub = (n: number) => `${n.toLocaleString('ru-RU').replace(/\s/g, ' ')} ₽`

export const planForDbCode = (code?: string | null) => PLANS.find(p => code && p.dbCodes.includes(code)) || null

// ── Оплата без автосписаний (20.11, аудит В11): строки у тарифов и кнопок оплаты. Показываются, только когда
// оплата открыта и автоплатежи выключены (autopay false в /api/me и /api/pay/me): иначе это неправда
export const PAY_TRUST = ['Без автосписаний', 'Карта или СБП', 'Чек на почту']
export const PAY_ONCE_LINE = 'Сама оплата не повторится. Включается сразу.'
// продление того же тарифа включается не сразу, а после конца оплаченного: там только первая половина
export const PAY_ONCE_SHORT = 'Сама оплата не повторится.'

// ── Тексты месяца кончились на платном тарифе (20.11, аудит Б3) ──
// Счетчик текстов живет по месяцам оплаченного окна, месяцы идут от period_start (lib/billing/period.ts
// nextSegmentStart, тот же расчет, что windowKey сервера). Следующий месяц раньше конца оплаченного: новые тексты
// появятся сами (окно длиннее месяца, продлила заранее или сменила тариф). Иначе тариф кончится раньше, и новые
// тексты будут только после продления. Без начала окна (старый ответ /api/pay/me) честно говорим про продление.
export function textsBackAt(now: Date, periodStart: Date | null, until: Date, anchor: number | null): { at: Date; auto: boolean } {
  const next = periodStart ? nextSegmentStart(periodStart, anchor, until, now) : null
  return next ? { at: next, auto: true } : { at: until, auto: false }
}

// date: «17 декабря». auto: тексты вернутся сами; иначе только после продления.
// Переход на «Каждый день» при оплаченном «Спокойном ритме»: включается сразу, остаток пересчитывается в дни.
// Простыми словами (copywriter-psycont 20.11): деньги за оставшиеся дни не пропадают, становятся днями нового тарифа (их меньше, он дороже)
// (lib/billing/period.ts manualWindow, mode switch), поэтому строка про переход правдива только для start
export const ZERO = {
  settings: (n: number, date: string, auto: boolean, canSwitch: boolean) =>
    (auto ? `Новые ${n} текстов появятся ${date}.` : `Новые ${n} текстов будут после ${date}, когда продлишь тариф.`)
    + (canSwitch ? ' Если нужно раньше, переходи на «Каждый день», он включится сразу. Деньги за\u00A0оставшиеся дни не\u00A0пропадут: они станут днями нового тарифа, только дней будет меньше, он дороже. Сколько именно, увидишь перед оплатой.' : ''),
  switchBtn: 'Перейти на «Каждый день»',
  renewQuiet: 'Продлить на месяц',
  payTitle: 'Тексты этого месяца закончились.',
  pay: (date: string, auto: boolean, canSwitch: boolean) =>
    (auto ? `Новые появятся ${date}, продление их не ускорит.` : `Продление добавит месяц после ${date}, новые тексты появятся только тогда.`)
    + (canSwitch ? ' Нужны раньше? «Каждый день» включится сразу. Деньги за\u00A0оставшиеся дни не\u00A0пропадут: они станут днями нового тарифа. Дней выйдет меньше, потому что он дороже.' : ''),
  // подписи вариантов на странице оплаты при оплаченном тарифе: с какого дня и сколько текстов
  optionLater: (date: string, n: number) => `с ${date}, ${n} текстов`,
  optionNow: (n: number) => `сразу, ${n} текстов`,
}
