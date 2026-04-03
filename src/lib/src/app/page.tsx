'use client'

import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/onboarding`
      }
    })
    if (error) console.error('Login error:', error.message)
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
            PsyContent
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-4 max-w-2xl">
            Контент, который satisfies вашу психику
          </p>
          <p className="text-lg text-gray-500 mb-12 max-w-xl">
            Персональный контент-план на основе вашего психологического профиля. 
            Никакой воды — только то, что работает для вас.
          </p>
        </motion.div>

        <motion.button
          onClick={handleGoogleLogin}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full text-lg font-semibold hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Войти через Google
        </button>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl"
        >
          <div className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800">
            <div className="text-3xl mb-3">🧠</div>
            <h3 className="text-lg font-semibold mb-2">Психопрофиль</h3>
            <p className="text-gray-400 text-sm">Анкета раскроет ваш тип мышления и стиль восприятия контента</p>
          </div>
          <div className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800">
            <div className="text-3xl mb-3">📋</div>
            <h3 className="text-lg font-semibold mb-2">Контент-план</h3>
            <p className="text-gray-400 text-sm">Получите персональный план публикаций на основе вашего профиля</p>
          </div>
          <div className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800">
            <div className="text-3xl mb-3">✨</div>
            <h3 className="text-lg font-semibold mb-2">AI-генерация</h3>
            <p className="text-gray-400 text-sm">Контент создаётся под ваш стиль, тон и психологические особенности</p>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-gray-600 text-sm">
        © 2025 PsyContent. Все права защищены.
      </footer>
    </div>
  )
}
