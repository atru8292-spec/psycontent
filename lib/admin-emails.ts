// Списки служебных почт из env и правило «кто админ», без импортов Next: модуль берут и кабинет /admin (lib/admin.ts),
// и запись аналитики (lib/analytics/skip-admin.ts, через serverTrack он попадает и в скрипты).

const list = (v: string | undefined) => (v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

export const adminEmails = () => list(process.env.ADMIN_EMAILS)
// служебные аккаунты: их не считаем нигде, пока не включен переключатель «Показать служебных»
export const internalEmails = () => list(process.env.INTERNAL_EMAILS)

// Админ: почта из ADMIN_EMAILS и она подтверждена. Одно правило для кабинета и для аналитики.
export function isAdminUser(user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined): boolean {
  const email = (user?.email || '').toLowerCase()
  return !!email && !!user?.email_confirmed_at && adminEmails().includes(email)
}
