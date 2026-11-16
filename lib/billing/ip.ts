// Адреса, с которых ЮKassa шлет уведомления (документация «Входящие уведомления», сверено 17.11.2026).
// Уведомления ЮKassa не подписывает: проверяем адрес и все равно перезапрашиваем объект своими ключами.
export const YK_NETS = ['185.71.76.0/27', '185.71.77.0/27', '77.75.153.0/25', '77.75.156.11/32', '77.75.156.35/32', '77.75.154.128/25', '2a02:5180::/32']

function v4(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const p = m.slice(1).map(Number)
  if (p.some(x => x > 255)) return null
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]
}

function v6(ip: string): bigint | null {
  if (!/^[0-9a-f:]+$/i.test(ip) || !ip.includes(':')) return null
  const [head, tail] = ip.split('::')
  const h = head ? head.split(':') : []
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : []
  if (tail === undefined && h.length !== 8) return null
  const parts = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t]
  if (parts.length !== 8 || parts.some(x => !/^[0-9a-f]{1,4}$/i.test(x))) return null
  return parts.reduce((acc, x) => (acc << 16n) + BigInt(parseInt(x, 16)), 0n)
}

export function inNet(ipRaw: string, cidr: string): boolean {
  const ip = ipRaw.replace(/^::ffff:/i, '').trim()
  const [net, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr)
  if (net.includes(':')) {
    const a = v6(ip), b = v6(net)
    if (a === null || b === null) return false
    const mask = bits === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - bits)) - 1n)
    return (a & mask) === (b & mask)
  }
  const a = v4(ip), b = v4(net)
  if (a === null || b === null) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return ((a & mask) >>> 0) === ((b & mask) >>> 0)
}

export const isYooKassaIp = (ip: string) => !!ip && YK_NETS.some(n => inNet(ip, n))
