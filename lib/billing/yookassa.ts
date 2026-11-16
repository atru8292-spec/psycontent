// Клиент API ЮKassa v3 (17.11, feat/oplata). Только сервер. Ключи из env: YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY;
// адрес API YOOKASSA_API_URL (по умолчанию боевой https://api.yookassa.ru/v3; для проверок заглушка на 127.0.0.1).
// Каждый POST с заголовком Idempotence-Key: повтор с тем же ключом в течение суток вернет тот же объект, второго
// списания не будет. Ошибки только кодом (lib/safe-error.ts): yookassa_<статус>_<code из ответа>, текст ответа не пишем.
import { CodedError } from '@/lib/safe-error'

export type YkAmount = { value: string; currency: 'RUB' }
export type YkPaymentMethod = {
  type: string
  id: string
  saved: boolean
  title?: string
  card?: { last4?: string; card_type?: string; issuer_name?: string }
  sbp_operation_id?: string
  payer_bank_details?: { bank_id?: string; bic?: string }
}
export type YkPayment = {
  id: string
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'
  paid: boolean
  amount: YkAmount
  payment_method?: YkPaymentMethod
  confirmation?: { type: string; confirmation_url?: string }
  cancellation_details?: { party?: string; reason?: string }
  metadata?: Record<string, string>
  test?: boolean
  created_at?: string
}
export type YkRefund = { id: string; payment_id: string; status: 'pending' | 'succeeded' | 'canceled'; amount: YkAmount }

export interface YkClient {
  createPayment(body: Record<string, unknown>, idempotenceKey: string): Promise<YkPayment>
  getPayment(id: string): Promise<YkPayment>
  createRefund(body: Record<string, unknown>, idempotenceKey: string): Promise<YkRefund>
  getRefund(id: string): Promise<YkRefund>
}

export const rub = (n: number): YkAmount => ({ value: n.toFixed(2), currency: 'RUB' })

export function ykConfigured(): boolean {
  return !!(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY)
}

export function httpYk(): YkClient {
  const base = (process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3').replace(/\/$/, '')
  const shop = process.env.YOOKASSA_SHOP_ID || ''
  const key = process.env.YOOKASSA_SECRET_KEY || ''
  const auth = 'Basic ' + Buffer.from(`${shop}:${key}`).toString('base64')
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown, idem?: string): Promise<any> => {
    if (!shop || !key) throw new CodedError('yookassa_not_configured')
    if (!/^\/[a-z_]+(\/[A-Za-z0-9_-]{1,80})?$/.test(path)) throw new CodedError('yookassa_bad_path')
    const r = await fetch(base + path, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json', ...(idem ? { 'Idempotence-Key': idem } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    })
    const j = await r.json().catch(() => null)
    if (!r.ok) {
      const code = String(j?.code || '').replace(/[^a-z_]/gi, '').slice(0, 30)
      throw new CodedError(code ? `yookassa_${r.status}_${code}` : `yookassa_${r.status}`, r.status)
    }
    return j
  }
  return {
    createPayment: (b, k) => call('POST', '/payments', b, k),
    getPayment: (id) => call('GET', `/payments/${id}`),
    createRefund: (b, k) => call('POST', '/refunds', b, k),
    getRefund: (id) => call('GET', `/refunds/${id}`),
  }
}

// Подпись способа оплаты для Профиля: «Карта Visa ****1234», «СБП», «ЮMoney»
export function methodTitle(pm?: YkPaymentMethod | null): string {
  if (!pm) return 'Способ оплаты'
  if (pm.type === 'bank_card') {
    const brand = pm.card?.card_type && pm.card.card_type !== 'Unknown' ? ` ${pm.card.card_type}` : ''
    return `Карта${brand}${pm.card?.last4 ? ` ****${pm.card.last4}` : ''}`.slice(0, 80)
  }
  if (pm.type === 'sbp') return 'СБП'
  if (pm.type === 'yoo_money') return 'ЮMoney'
  if (pm.type === 'sberbank') return 'SberPay'
  if (pm.type === 'tinkoff_bank') return 'T-Pay'
  return 'Способ оплаты'
}
