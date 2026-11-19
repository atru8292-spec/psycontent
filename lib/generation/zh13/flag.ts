// Генератор zh13 по умолчанию у всех (19.11 вечер, решение Арины «новый генератор для всех»).
// Откат на прежний генератор zh6 без кода: GENERATOR=zh6 в .env и pm2 restart psycont --update-env
// (любое значение, кроме пустого и zh13, выключает zh13). Пока ZH13_ONLY_EMAILS не пустой (через запятую,
// «*» внутри почты: atru8292+*@gmail.com), zh13 получают только эти почты, остальные остаются на zh6.
// Решает сервер (роут генерации и /api/me), экран только читает.
export function zh13Dlya(email: string | null | undefined): boolean {
  const g = String(process.env.GENERATOR || '').trim().toLowerCase()
  if (g && g !== 'zh13') return false
  const list = String(process.env.ZH13_ONLY_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
  if (!list.length) return true
  const e = String(email || '').trim().toLowerCase()
  if (!e) return false
  return list.some(p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^@,\\s]*') + '$').test(e))
}
