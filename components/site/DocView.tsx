'use client'
// Событие «открыли документ» (оферта, политика, согласие): видно, читают ли их перед регистрацией. Без данных человека.
import { useEffect } from 'react'
import { track } from '@/lib/track'

export default function DocView({ doc }: { doc: 'offer' | 'privacy' | 'soglasie' }) {
  useEffect(() => { track('land_doc_view', { doc }) }, [doc])
  return null
}
