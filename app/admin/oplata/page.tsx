// Оплата в кабинете Арины (17.11): платежи и подписки, чеки «Мой налог», возврат за оставшиеся дни, продлить, выключить.
import { requireAdmin } from '@/lib/admin'
import AdminPay from '@/components/admin/AdminPay'

export default async function OplataAdminPage() {
  await requireAdmin()
  return <AdminPay />
}
