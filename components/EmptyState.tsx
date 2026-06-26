'use client'

import Image from 'next/image'

interface EmptyStateProps {
  title: string
  subtitle: string
  actionLabel?: string
  onAction?: () => void
  href?: string
  variant?: 0 | 1 | 2
}

export default function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
  href,
  variant = 0,
}: EmptyStateProps) {
  return (
    <div className="relative soft-panel flex flex-col items-start overflow-hidden min-h-[220px] sm:min-h-[260px]">
      {/* Тихий логотип в углу */}
      <div className="absolute bottom-5 right-5 pointer-events-none select-none" aria-hidden="true">
        <Image
          src="/logo/out_icon_mono.svg"
          alt=""
          width={72}
          height={72}
          className="w-16 h-16 sm:w-20 sm:h-20 opacity-[0.10]"
        />
      </div>

      <div className="relative z-10 max-w-md">
        <h3 className="text-xl sm:text-2xl font-bold text-brand-text leading-tight">{title}</h3>
        <p className="text-brand-muted text-sm sm:text-base leading-relaxed mt-3 mb-6">{subtitle}</p>

        {(actionLabel && (onAction || href)) && (
          href ? (
            <a href={href} className="btn-primary text-sm">
              {actionLabel}
            </a>
          ) : (
            <button onClick={onAction} className="btn-primary text-sm">
              {actionLabel}
            </button>
          )
        )}
      </div>
    </div>
  )
}
