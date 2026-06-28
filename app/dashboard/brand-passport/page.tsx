'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import {
  Sparkles, ArrowLeft, Loader2, Target, RefreshCw, Download,
  Heart, Layers, Volume2, Users, Star, Instagram, Send,
  LayoutGrid, MessageSquare, AlertTriangle, PenTool,
  ChevronDown, ChevronUp, Copy, Check, FileText,
} from 'lucide-react'
import Squiggle from '@/components/Squiggle'
import EmptyState from '@/components/EmptyState'
import { LimitNotice } from '@/components/LimitNotice'
import { generatePassportPDF } from '@/lib/generate-passport-pdf'

// ─────────────────────────────────────────────────────────
// ПАРСЕР: секции принимаются только в ВОЗРАСТАЮЩЕМ порядке
// ─────────────────────────────────────────────────────────
function parsePassport(content: string) {
  const sections: { num: string; title: string; content: string }[] = []
  const lines = content.split('\n')
  let current: { num: string; title: string; lines: string[] } | null = null
  let lastNum = 0 // последний принятый номер раздела

  for (const line of lines) {
    const t = line.trim()

    // Формат 1: ## 1. Заголовок
    let m = t.match(/^##\s+(1[0-2]|[1-9])\.\s+(.+)/)

    // Формат 2: **1. Заголовок** (вся строка в **)
    if (!m) m = t.match(/^\*\*(1[0-2]|[1-9])\.\s+(.+?)\*\*\s*$/)

    if (m) {
      const n = parseInt(m[1])

      // ✅ Принимаем заголовок ТОЛЬКО если номер БОЛЬШЕ предыдущего
      if (n > lastNum) {
        if (current) {
          sections.push({
            num: current.num,
            title: current.title,
            content: current.lines.join('\n').trim(),
          })
        }
        current = { num: m[1], title: m[2].trim(), lines: [] }
        lastNum = n
      } else {
        // Номер ≤ lastNum → это контент внутри текущей секции
        if (current) current.lines.push(line)
      }
    } else if (current) {
      current.lines.push(line)
    }
  }

  if (current) {
    sections.push({
      num: current.num,
      title: current.title,
      content: current.lines.join('\n').trim(),
    })
  }

  return sections
}

// ─────────────────────────────────────────────────────────
// РЕНДЕР СОДЕРЖИМОГО РАЗДЕЛА
// Данные в базе чистые (markdown от модели). Парсим структуру по строкам и
// оформляем по бренду: подзаголовки **...** → аметист; метки «Слово:» в начале
// строки → жирная метка индиго; списки → буллеты; парный *курсив* → italic;
// бэктики и непарные звёздочки убираем полностью.
// ─────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Инлайн-markdown → безопасный HTML. На выходе НЕ остаётся голых * или `.
function inlineHtml(s: string): string {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-brand-text">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic text-brand-text-secondary">$1</em>')
    .replace(/`(.+?)`/g, '$1')
    .replace(/[*`]/g, '') // непарные маркеры
    .trim()
}

// Метка вида «Слово:» (1–4 коротких слова) в начале строки/буллета.
const LABEL_RE = /^([A-ZА-ЯЁ][^:*]{0,26}):\s+(\S[\s\S]*)$/
function isLabel(head: string): boolean {
  return head.split(/\s+/).length <= 4
}

// Буллет: если начинается с короткой метки — выделяем её жирным индиго.
function bulletHtml(s: string): string {
  const m = s.match(LABEL_RE)
  if (m && isLabel(m[1])) {
    return `<strong class="font-semibold text-brand-text">${escHtml(m[1].trim())}:</strong> ` + inlineHtml(m[2])
  }
  return inlineHtml(s)
}

type Block =
  | { kind: 'subhead'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'label'; label: string; rest: string }
  | { kind: 'bullets'; items: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let bulletBuf: string[] = []
  const flush = () => { if (bulletBuf.length) { blocks.push({ kind: 'bullets', items: bulletBuf }); bulletBuf = [] } }

  for (const raw of text.split('\n')) {
    const t = raw.trim()
    if (t === '') { flush(); continue }

    // Подзаголовок: вся строка обёрнута в **...**
    const sub = t.match(/^\*\*(.+?)\*\*$/)
    if (sub) { flush(); blocks.push({ kind: 'subhead', text: sub[1].trim().replace(/:\s*$/, '') }); continue }

    // Строка-введение вида «Примеры фраз:» (короткая, заканчивается двоеточием,
    // без текста после) → тоже подзаголовок, а не метка/абзац.
    if (t.endsWith(':') && t.length <= 40 && t.split(/\s+/).length <= 5 && !t.includes('*')) {
      flush(); blocks.push({ kind: 'subhead', text: t.replace(/:\s*$/, '') }); continue
    }

    // Список
    if (/^[-•]\s+/.test(t)) { bulletBuf.push(t.replace(/^[-•]\s+/, '')); continue }
    flush()

    // Метка-строка: «Слово:» + текст
    const lab = t.match(LABEL_RE)
    if (lab && isLabel(lab[1])) { blocks.push({ kind: 'label', label: lab[1].trim(), rest: lab[2].trim() }); continue }

    blocks.push({ kind: 'para', text: t })
  }
  flush()
  return blocks
}

function renderContent(text: string) {
  const blocks = parseBlocks(text)
  return (
    <div className="space-y-4 sm:space-y-5">
      {blocks.map((b, i) => {
        if (b.kind === 'subhead') {
          return (
            <p
              key={i}
              className="text-[15px] sm:text-base font-semibold text-brand-accent leading-snug pt-1"
              dangerouslySetInnerHTML={{ __html: inlineHtml(b.text) }}
            />
          )
        }
        if (b.kind === 'bullets') {
          return (
            <ul key={i} className="space-y-2.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex items-start gap-2.5 text-[15px] text-brand-text leading-[1.7]">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-sage mt-[0.6rem] shrink-0" />
                  <span dangerouslySetInnerHTML={{ __html: bulletHtml(it) }} />
                </li>
              ))}
            </ul>
          )
        }
        if (b.kind === 'label') {
          return (
            <p key={i} className="text-[15px] text-brand-text leading-[1.7]">
              <span className="font-semibold text-brand-text">{b.label}: </span>
              <span dangerouslySetInnerHTML={{ __html: inlineHtml(b.rest) }} />
            </p>
          )
        }
        return (
          <p
            key={i}
            className="text-[15px] text-brand-text leading-[1.7]"
            dangerouslySetInnerHTML={{ __html: inlineHtml(b.text) }}
          />
        )
      })}
    </div>
  )
}

const sectionMeta: Record<string, { icon: any; color: string; bg: string; accent: string }> = {
  '1':  { icon: Heart,         color: 'text-brand-accent',   bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '2':  { icon: Target,        color: 'text-brand-accent',   bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '3':  { icon: Layers,        color: 'text-brand-accent',   bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '4':  { icon: Volume2,       color: 'text-brand-accent',   bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '5':  { icon: Users,         color: 'text-brand-sage',     bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '6':  { icon: Star,          color: 'text-brand-sage',     bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '7':  { icon: Instagram,     color: 'text-brand-accent',   bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '8':  { icon: Send,          color: 'text-brand-muted',    bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '9':  { icon: LayoutGrid,    color: 'text-brand-sage',     bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '10': { icon: MessageSquare, color: 'text-brand-accent',   bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '11': { icon: AlertTriangle, color: 'text-brand-muted',    bg: 'bg-brand-soft',      accent: 'border-brand-border-soft' },
  '12': { icon: PenTool,       color: 'text-brand-accent',   bg: 'bg-brand-highlight', accent: 'border-brand-accent/30' },
}

function SectionCard({
  section,
  index,
}: {
  section: { num: string; title: string; content: string }
  index: number
}) {
  const [open, setOpen] = useState(index < 3)
  const meta = sectionMeta[section.num] || sectionMeta['1']
  const Icon = meta.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`rounded-2xl sm:rounded-3xl border bg-white overflow-hidden ${meta.accent}`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 sm:gap-4 p-3.5 sm:p-5 text-left hover:bg-gray-50/50 transition cursor-pointer"
      >
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-[10px] sm:text-xs font-bold ${meta.color} uppercase tracking-wider`}>
            Раздел {section.num}
          </span>
          <h3 className="font-bold text-brand-text text-sm sm:text-base leading-tight">
            {section.title}
          </h3>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-brand-text-secondary shrink-0" />
          : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-brand-text-secondary shrink-0" />
        }
      </button>

      {open && (
        <div className={`px-5 sm:px-7 pb-6 sm:pb-8 border-t ${meta.accent}`}>
          <div className="pt-5 sm:pt-6">
            {renderContent(section.content)}
          </div>
        </div>
      )}
    </motion.div>
  )
}

const STEPS = [
  { chunk: 1 as const, label: 'Миссия и позиционирование' },
  { chunk: 2 as const, label: 'Архетип и тон голоса' },
  { chunk: 3 as const, label: 'Аватар клиента и УТП' },
  { chunk: 4 as const, label: 'Био, столбы и ключевые сообщения' },
  { chunk: 5 as const, label: 'Стоп-темы и примеры постов' },
]

export default function BrandPassport() {
  const [user, setUser] = useState<any>(null)
  const [passport, setPassport] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatingChunk, setGeneratingChunk] = useState<0 | 1 | 2 | 3 | 4 | 5>(0)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needOnboarding, setNeedOnboarding] = useState(false)
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)
      const { data } = await supabase
        .from('brand_passports')
        .select('content')
        .eq('user_id', user.id)
        .single()
      if (data?.content) setPassport(data.content)
      setLoading(false)
    }
    init()
  }, [router])

  const handleGenerate = async () => {
    if (!user) return
    setGenerating(true)
    setError(null)
    setNeedOnboarding(false)
    setPassport(null)
    setGeneratingChunk(0)
    const parts: string[] = []

    try {
      for (const step of STEPS) {
        setGeneratingChunk(step.chunk)
        const response = await fetch('/api/generate-passport', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, chunk: step.chunk }),
        })
        if (!response.ok || !response.body) {
          const info = await response.json().catch(() => null)
          if (info?.error === 'need_onboarding') { setNeedOnboarding(true); return }
          throw new Error(`Ошибка на этапе ${step.chunk}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let chunkText = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const json = trimmed.slice(5).trim()
            if (json === '[DONE]') continue
            try {
              const parsed = JSON.parse(json)
              if (parsed.error) throw new Error(parsed.error)
              if (parsed.delta) chunkText += parsed.delta
            } catch (e: any) {
              if (e.message && !e.message.includes('JSON')) throw e
            }
          }
        }

        parts.push(chunkText)
        setPassport(parts.join('\n\n'))
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
      setGeneratingChunk(0)
    }
  }

  const handleCopy = () => {
    if (!passport) return
    navigator.clipboard.writeText(passport)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadTxt = () => {
    if (!passport) return
    const blob = new Blob([passport], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'brand-passport.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadPDF = async () => {
    if (!passport) return
    setGeneratingPDF(true)
    try { await generatePassportPDF(passport) }
    catch (err) { console.error(err) }
    finally { setGeneratingPDF(false) }
  }

  const sections = passport ? parsePassport(passport) : []

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer text-sm sm:text-base"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            Назад в кабинет
          </button>
          <div className="flex items-center gap-2">
            <Image src="/logo/out_wordmark.svg" alt="PsyCont" width={110} height={28} className="h-6 w-auto" />
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 sm:mb-10"
        >
          <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium mb-3 sm:mb-4">
            <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Паспорт бренда
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-text mb-2 sm:mb-3">
            Ваш персональный паспорт бренда
          </h1>
          <div className="flex justify-center">
            <Squiggle variant={0} width="55%" />
          </div>
          <p className="text-brand-text-secondary max-w-xl mx-auto text-sm sm:text-base mt-3">
            AI проанализировал вашу распаковку и создал стратегический документ
            с позиционированием, архетипом, аватаром клиента и контент-стратегией
          </p>
        </motion.div>

        {/* Начальный экран */}
        {!passport && !generating && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <EmptyState
              variant={1}
              title="Создайте документ о себе"
              subtitle="AI проанализирует вашу распаковку и создаст стратегический документ с позиционированием, архетипом, аватаром клиента и контент-стратегией. Генерация идёт поэтапно в 5 шагов."
              actionLabel="Создать паспорт бренда"
              onAction={handleGenerate}
            />
            {needOnboarding && (
              <div className="mt-4">
                <LimitNotice title="Сначала заполните профиль" message="Паспорт бренда строится на вашей распаковке. Пройдите короткий онбординг, и мы соберём документ о вас." actionLabel="Заполнить профиль" actionHref="/onboarding" />
              </div>
            )}
            {error && !needOnboarding && (
              <div className="mt-4 p-3 sm:p-4 bg-brand-soft border border-brand-border-soft rounded-xl text-brand-text text-xs sm:text-sm">
                {error}
              </div>
            )}
          </motion.div>
        )}

        {/* Прогресс */}
        {generating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 sm:py-14">
            <div className="flex items-center gap-3 mb-6">
              <Loader2 className="w-5 h-5 text-brand-accent animate-spin shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-brand-text">
                AI создаёт ваш паспорт бренда...
              </h2>
            </div>
            <div className="max-w-md space-y-3">
              {STEPS.map(step => (
                <div key={step.chunk} className="flex items-center gap-3">
                  <div className={[
                    'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all duration-300',
                    generatingChunk > step.chunk ? 'bg-brand-sage text-white' : '',
                    generatingChunk === step.chunk ? 'bg-brand-accent text-white' : '',
                    generatingChunk < step.chunk ? 'bg-gray-100 text-gray-400' : '',
                  ].join(' ')}>
                    {generatingChunk > step.chunk ? '✓' : step.chunk}
                  </div>
                  <span className={[
                    'text-sm transition-all duration-300',
                    generatingChunk === step.chunk ? 'text-brand-text font-semibold' : '',
                    generatingChunk > step.chunk ? 'text-brand-sage' : 'text-brand-text-secondary',
                  ].join(' ')}>
                    {step.label}
                  </span>
                  {generatingChunk === step.chunk && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-accent ml-auto shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Результат */}
        {passport && !loading && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {error && (
              <div className="mb-4 p-3 sm:p-4 bg-brand-soft border border-brand-border-soft rounded-xl text-brand-text text-xs sm:text-sm">
                {error}
              </div>
            )}

            {/* Панель действий */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-brand-border">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="text-center">
                  <p className="text-xl sm:text-2xl font-bold text-brand-accent">{sections.length}</p>
                  <p className="text-[10px] sm:text-xs text-brand-text-secondary">разделов</p>
                </div>
                <div className="h-6 sm:h-8 w-px bg-brand-border" />
                <p className="text-xs sm:text-sm text-brand-text-secondary">
                  Персональный документ                  на основе вашей распаковки
                </p>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-2.5 sm:px-3 py-2 rounded-lg hover:bg-brand-highlight"
                >
                  {copied
                    ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-sage" />
                    : <Copy  className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  }
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>

                <button
                  onClick={handleDownloadTxt}
                  className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-2.5 sm:px-3 py-2 rounded-lg hover:bg-brand-highlight"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  TXT
                </button>

                <button
                  onClick={handleDownloadPDF}
                  disabled={generatingPDF}
                  className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-white bg-brand-accent hover:bg-brand-accent-hover transition cursor-pointer px-3 sm:px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingPDF ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                      Создаю PDF...
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Скачать PDF
                    </>
                  )}
                </button>

                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-2.5 sm:px-3 py-2 rounded-lg hover:bg-brand-highlight"
                >
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Заново
                </button>
              </div>
            </div>

            {/* Секции */}
            <div className="space-y-3 sm:space-y-4">
              {sections.map((section, i) => (
                <SectionCard key={section.num} section={section} index={i} />
              ))}
            </div>

            {/* CTA */}
            <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-brand-accent rounded-xl sm:rounded-2xl text-white text-center">
              <h3 className="text-base sm:text-lg font-bold mb-1.5 sm:mb-2">
                Паспорт готов! Что дальше? 🚀
              </h3>
              <p className="text-white/80 mb-3 sm:mb-4 text-xs sm:text-sm">
                Используйте контентные столбы для генерации постов
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full sm:w-auto bg-white text-brand-accent px-6 py-2.5 sm:py-2 rounded-full font-semibold text-sm hover:bg-white/90 transition cursor-pointer"
                >
                  Вернуться в кабинет
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={generatingPDF}
                  className="w-full sm:w-auto bg-white/20 text-white border border-white/30 px-6 py-2.5 sm:py-2 rounded-full font-semibold text-sm hover:bg-white/30 transition cursor-pointer disabled:opacity-50"
                >
                  {generatingPDF ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Создаю...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4" />
                      Скачать PDF
                    </span>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

