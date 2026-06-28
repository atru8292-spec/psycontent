'use client'

import { motion } from 'framer-motion'

// Три варианта неровных рукописных волн
const PATHS = [
  // Вариант 0: широкая, гребни разной высоты
  'M2 8 C 14 3, 28 12, 46 7 S 74 2, 96 8 S 128 4, 158 9 S 186 5, 210 7',
  // Вариант 1: более сжатая, резкие перепады
  'M2 9 C 18 4, 32 13, 52 6 S 82 1, 108 8 S 140 3, 168 10 S 194 5, 220 7',
  // Вариант 2: плавная, с небольшим подъемом
  'M2 7 C 22 2, 38 11, 60 6 S 96 1, 120 8 S 160 3, 198 6 S 230 9, 256 5',
]

interface SquiggleProps {
  /** 0 | 1 | 2 — выбор варианта пути */
  variant?: 0 | 1 | 2
  /** Ширина линии. По умолчанию '64%' */
  width?: string | number
  className?: string
}

export default function Squiggle({ variant = 0, width = '64%', className = '' }: SquiggleProps) {
  const path = PATHS[variant % PATHS.length]

  return (
    <div
      className={`mt-1 ${className}`}
      style={{ width, display: 'block' }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 260 16"
        height="13"
        width="100%"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-brand-sage overflow-visible"
      >
        <motion.path
          d={path}
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 },
            opacity: { duration: 0.15, delay: 0.15 },
          }}
        />
      </svg>
    </div>
  )
}
