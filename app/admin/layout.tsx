// Кабинет аналитики: только для ADMIN_EMAILS, остальным 404 (раздел не светится). Только читает, событий не пишет:
// здесь нет ScreenTracker и track().
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/admin'
import { demoAllowed } from '@/lib/analytics/admin-data'
import AdminNav from '@/components/admin/AdminNav'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Кабинет PsyCont', robots: { index: false, follow: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <div className="min-h-dvh bg-brand-bg text-brand-text text-[14px] tabular-nums">
      <Suspense fallback={<div className="h-14 border-b border-brand-border" />}>
        <AdminNav demoAllowed={demoAllowed()} />
      </Suspense>
      <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 pb-16">{children}</main>
    </div>
  )
}
