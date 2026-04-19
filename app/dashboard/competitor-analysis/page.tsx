'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, Search, Clipboard, RotateCcw, Trash2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'

interface Analysis {
  id: string
  url: string
  platform: string
  transcript: string
  metadata: any
  analysis: string
  created_at: string
}

type Step = 'idle' | 'transcribing' | 'transcribed' | 'analyzing' | 'done'

export default function CompetitorAnalysisPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [transcript, setTranscript] = useState('')
  const [platform, setPlatform] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [history, setHistory] = useState<Analysis[]>([])
  const [error, setError] = useState('')
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)

  useEffect(() => { loadHistory() }, [])

  const loadHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('competitor_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data)
  }

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Не авторизован. Пожалуйста, войдите в систему.')
    return session.access_token
  }

  const safeFetch = async (path: string, token: string, body: object) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let data: any
    try { data = JSON.parse(text) } catch {
      throw new Error(`Сервер не ответил (${res.status}). Попробуйте ещё раз.`)
    }
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`)
    return data
  }

  const handleTranscribe = async () => {
    if (!url.trim()) return setError('Вставь ссылку')
    setError(''); setTranscript(''); setAnalysis(''); setStep('transcribing')
    try {
      const token = await getToken()
      const data = await safeFetch('/api/transcribe', token, { url })
      setTranscript(data.transcript); setPlatform(data.platform); setStep('transcribed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка транскрипции'); setStep('idle')
    }
  }

  const handleAnalyze = async () => {
    if (!transcript) return
    setError(''); setStep('analyzing')
    try {
      const token = await getToken()
      const data = await safeFetch('/api/analyze-competitor', token, { url, transcript, platform })
      setAnalysis(data.analysis); setStep('done'); loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка анализа'); setStep('transcribed')
    }
  }

  const handleReset = () => {
    setStep('idle'); setUrl(''); setTranscript(''); setAnalysis(''); setPlatform(''); setError('')
  }

  const loadFromHistory = (item: Analysis) => {
    setUrl(item.url); setPlatform(item.platform); setTranscript(item.transcript)
    setAnalysis(item.analysis); setStep('done'); setError('')
  }

  const handleDelete = async (id: string) => {
    await supabase.from('competitor_analyses').delete().eq('id', id)
    setHistory(history.filter(h => h.id !== id))
  }

  const copyText = (text: string) => navigator.clipboard.writeText(text)
  const isLoading = step === 'transcribing' || step === 'analyzing'

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline text-sm font-medium">Назад в кабинет</span>
          </button>
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-brand-accent" />
            <span className="font-bold text-brand-text text-sm sm:text-base">Анализ конкурентов</span>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Заголовок */}
        <div className="mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium mb-3">
            <Search className="w-4 h-4" />
            Анализ видео конкурентов
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-text mb-2">
            Разбери чужой контент
          </h1>
          <p className="text-sm sm:text-base text-brand-text-secondary">
            Вставь ссылку на Reels / TikTok / YouTube — получи транскрипцию и разбор для психолога
          </p>
        </div>

        {/* Шаг-индикатор */}
        <div className="flex items-center gap-2 sm:gap-3 mb-5 sm:mb-6">
          {['Транскрипция', 'Анализ'].map((label, i) => {
            const active = i === 0 ? (step === 'idle' || step === 'transcribing') : (step === 'analyzing' || step === 'transcribed')
            const done = i === 0 ? step !== 'idle' && step !== 'transcribing' : step === 'done'
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-brand-text-faint text-xs">→</span>}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                  done ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                  active ? 'bg-brand-accent/10 text-brand-accent border-brand-accent/30' :
                  'bg-white text-brand-text-faint border-brand-border'
                }`}>
                  <span>{done ? '✓' : (i + 1)}</span>
                  <span>{label}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Главная рабочая область */}
          <div className="lg:col-span-2 space-y-4">

            {/* Ввод ссылки */}
            {(step === 'idle' || step === 'transcribing') && (
              <div className="bg-white rounded-2xl border border-brand-border p-4 sm:p-6">
                <label className="block text-sm font-semibold text-brand-text mb-2">Ссылка на видео</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    placeholder="https://instagram.com/reel/..."
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !isLoading && handleTranscribe()}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent disabled:opacity-50"
                  />
                  <button
                    onClick={handleTranscribe}
                    disabled={isLoading || !url.trim()}
                    className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition cursor-pointer whitespace-nowrap ${
                      isLoading || !url.trim()
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-brand-accent text-white hover:bg-brand-accent-hover shadow-lg shadow-brand-accent/25'
                    }`}
                  >
                    {step === 'transcribing'
                      ? <><span className="animate-spin">⏳</span> Получаю...</>
                      : <><Sparkles className="w-4 h-4" /> Транскрибировать</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Ошибка */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Загрузка транскрипции */}
            {step === 'transcribing' && (
              <div className="bg-white rounded-2xl border border-brand-border p-8 text-center">
                <div className="text-3xl mb-3 animate-pulse">📝</div>
                <p className="font-semibold text-brand-text">Получаю транскрипцию...</p>
                <p className="text-sm text-brand-text-secondary mt-1">Обычно 5–15 секунд</p>
              </div>
            )}

            {/* Транскрипция */}
            {(step === 'transcribed' || step === 'analyzing' || step === 'done') && (
              <div className="bg-white rounded-2xl border border-brand-border overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-brand-border bg-brand-bg">
                  <span className="text-sm font-semibold text-brand-text">📝 Транскрипция · {platform}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyText(transcript)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-white text-xs text-brand-text hover:border-brand-accent/50 transition cursor-pointer"
                    >
                      <Clipboard className="w-3.5 h-3.5" /> Копировать
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-white text-xs text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Сбросить
                    </button>
                  </div>
                </div>
                <div className="px-4 sm:px-5 py-4 max-h-44 overflow-y-auto text-sm text-brand-text leading-relaxed whitespace-pre-wrap bg-brand-bg/50">
                  {transcript}
                </div>

                {step === 'transcribed' && (
                  <div className="px-4 sm:px-5 py-4 border-t border-brand-border">
                    <button
                      onClick={handleAnalyze}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand-accent text-white font-semibold text-sm hover:bg-brand-accent-hover transition shadow-lg shadow-brand-accent/25 cursor-pointer"
                    >
                      <Search className="w-4 h-4" /> Анализировать под психолога
                    </button>
                  </div>
                )}

                {step === 'analyzing' && (
                  <div className="px-5 py-6 text-center border-t border-brand-border">
                    <div className="text-2xl mb-2 animate-pulse">🤖</div>
                    <p className="font-semibold text-brand-text text-sm">Анализирую и готовлю сценарий...</p>
                    <p className="text-xs text-brand-text-secondary mt-1">Обычно 15–30 секунд</p>
                  </div>
                )}
              </div>
            )}

            {/* Анализ */}
            {step === 'done' && analysis && (
              <div className="bg-white rounded-2xl border border-brand-border overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-brand-border bg-brand-bg">
                  <span className="text-sm font-semibold text-brand-text">✅ Анализ готов</span>
                  <button
                    onClick={() => copyText(analysis)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-white text-xs text-brand-text hover:border-brand-accent/50 transition cursor-pointer"
                  >
                    <Clipboard className="w-3.5 h-3.5" /> Копировать
                  </button>
                </div>
                <div className="px-4 sm:px-5 py-4 prose prose-sm max-w-none text-brand-text max-h-[500px] overflow-y-auto">
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>
                <div className="px-4 sm:px-5 py-4 border-t border-brand-border">
                  <button
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-border text-sm font-medium text-brand-text-secondary hover:text-brand-text hover:border-brand-accent/50 transition cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" /> Новый анализ
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* История */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-brand-text-secondary uppercase tracking-wide px-1">История</h2>
            {history.length === 0 ? (
              <div className="bg-white rounded-2xl border border-brand-border p-6 text-center">
                <p className="text-2xl mb-2">📂</p>
                <p className="text-sm text-brand-text-secondary">Здесь появятся ваши анализы</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {history.map(item => (
                  <div key={item.id} className="bg-white rounded-xl border border-brand-border overflow-hidden">
                    <div className="flex items-start justify-between gap-2 p-3">
                      <button
                        onClick={() => { loadFromHistory(item); setExpandedHistory(null) }}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs font-semibold text-brand-accent uppercase">{item.platform}</span>
                          <span className="text-xs text-brand-text-faint">
                            {new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-xs text-brand-text-secondary truncate">{item.url}</p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setExpandedHistory(expandedHistory === item.id ? null : item.id)}
                          className="p-1.5 rounded-lg hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
                        >
                          {expandedHistory === item.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-brand-text-faint hover:text-red-500 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {expandedHistory === item.id && (
                      <div className="px-3 pb-3 border-t border-brand-border pt-2">
                        <p className="text-xs text-brand-text-secondary line-clamp-4 leading-relaxed">{item.analysis.slice(0, 300)}...</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
