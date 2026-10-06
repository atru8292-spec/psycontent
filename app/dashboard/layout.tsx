// Серверная обертка кабинета: только metadata (noindex, кабинет закрыт от поисковиков и ботов нейросетей).
// Вся разметка, guard профиля и энергия в клиентском components/dashboard/DashboardShell.tsx
// (клиентский layout не может экспортировать metadata).
import type { Metadata } from 'next'
import DashboardShell from '@/components/dashboard/DashboardShell'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
