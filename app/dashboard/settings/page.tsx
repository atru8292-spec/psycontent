'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Zap } from 'lucide-react'
import { EnergyTariffPanel } from '@/components/EnergyTariff'

export default function SettingsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-brand-card/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 -ml-2 text-brand-muted hover:text-brand-text hover:bg-brand-soft rounded-2xl transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Zap className="w-5 h-5 text-brand-sage" />
          <span className="font-bold text-brand-text">Тариф и энергия</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-brand-text mb-1">Тариф и энергия</h1>
          <p className="text-brand-muted mb-8">
            Ваш текущий тариф и остаток энергии. Все только для просмотра.
          </p>

          <EnergyTariffPanel />
        </motion.div>
      </div>
    </div>
  )
}
