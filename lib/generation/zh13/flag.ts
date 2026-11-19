// zh13 под флагом (19.11): GENERATOR=zh13 в .env включает новый генератор; пока ZH13_ONLY_EMAILS не пустой
// (через запятую, «*» внутри почты: atru8292+*@gmail.com), zh13 получают только эти почты, остальные остаются на zh6.
// Пустой список при GENERATOR=zh13: zh13 у всех. Решает сервер (роут генерации и /api/me), экран только читает.
export function zh13Dlya(email: string | null | undefined): boolean {
  if (String(process.env.GENERATOR || '').trim().toLowerCase() !== 'zh13') return false
  const list = String(process.env.ZH13_ONLY_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
  if (!list.length) return true
  const e = String(email || '').trim().toLowerCase()
  if (!e) return false
  return list.some(p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^@,\\s]*') + '$').test(e))
}
