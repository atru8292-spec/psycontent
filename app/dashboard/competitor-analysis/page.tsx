'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'

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
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`Сервер не ответил (${res.status}). Попробуйте ещё раз.`)
    }
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`)
    return data
  }

  const handleTranscribe = async () => {
    if (!url.trim()) return setError('Вставь ссылку')
    setError('')
    setTranscript('')
    setAnalysis('')
    setStep('transcribing')
    try {
      const token = await getToken()
      const data = await safeFetch('/api/transcribe', token, { url })
      setTranscript(data.transcript)
      setPlatform(data.platform)
      setStep('transcribed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка транскрипции')
      setStep('idle')
    }
  }

  const handleAnalyze = async () => {
    if (!transcript) return
    setError('')
    setStep('analyzing')
    try {
      const token = await getToken()
      const data = await safeFetch('/api/analyze-competitor', token, { url, transcript, platform })
      setAnalysis(data.analysis)
      setStep('done')
      loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка анализа')
      setStep('transcribed')
    }
  }

  const handleReset = () => {
    setStep('idle')
    setUrl('')
    setTranscript('')
    setAnalysis('')
    setPlatform('')
    setError('')
  }

  const loadFromHistory = (item: Analysis) => {
    setUrl(item.url)
    setPlatform(item.platform)
    setTranscript(item.transcript)
    setAnalysis(item.analysis)
    setStep('done')
    setError('')
  }

  const handleDelete = async (id: string) => {
    await supabase.from('competitor_analyses').delete().eq('id', id)
    setHistory(history.filter(h => h.id !== id))
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Скопировано!')
  }

  const isLoading = step === 'transcribing' || step === 'analyzing'

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Кнопка назад */}
      <button
        onClick={() => router.push('/dashboard')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
          marginBottom: '1.5rem', padding: '0.5rem 1rem',
          border: '1px solid #ddd', borderRadius: '0.5rem',
          background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#444',
        }}
      >
        ← На дашборд
      </button>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>🔍 Анализ конкурентов</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Вставь ссылку на Reels/TikTok/YouTube — получи анализ и сценарий</p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <div>
          {/* Шаг-индикатор */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#888' }}>
            <span style={{ color: step !== 'idle' ? '#22c55e' : '#000', fontWeight: step === 'idle' || step === 'transcribing' ? '600' : '400' }}>1. Транскрипция</span>
            <span>→</span>
            <span style={{ color: step === 'done' ? '#22c55e' : step === 'analyzing' ? '#000' : '#ccc', fontWeight: step === 'analyzing' || step === 'transcribed' ? '600' : '400' }}>2. Анализ</span>
          </div>

          {(step === 'idle' || step === 'transcribing') && (
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="https://instagram.com/reel/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isLoading && handleTranscribe()}
                disabled={isLoading}
                style={{ flex: 1, padding: '0.75rem 1rem', border: '1px solid #ddd', borderRadius: '0.5rem', fontSize: '1rem' }}
              />
              <button
                onClick={handleTranscribe}
                disabled={isLoading || !url.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: isLoading || !url.trim() ? '#ccc' : '#000',
                  color: '#fff', border: 'none', borderRadius: '0.5rem',
                  cursor: isLoading || !url.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: '500', whiteSpace: 'nowrap',
                }}
              >
                {step === 'transcribing' ? '⏳ Получаю...' : '📝 Транскрибировать'}
              </button>
            </div>
          )}

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {step === 'transcribing' && (
            <div style={{ textAlign: 'center', padding: '3rem', background: '#f5f5f5', borderRadius: '0.5rem' }}>
              <p style={{ fontSize: '1.125rem', fontWeight: '500' }}>📝 Получаю транскрипцию...</p>
              <p style={{ color: '#666', marginTop: '0.5rem' }}>Обычно 5-15 секунд</p>
            </div>
          )}

          {(step === 'transcribed' || step === 'analyzing' || step === 'done') && (
            <div style={{ border: '1px solid #ddd', borderRadius: '0.5rem', padding: '1.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: '600' }}>📝 Транскрипция ({platform})</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => copyText(transcript)} style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem' }}>
                    📋 Копировать
                  </button>
                  <button onClick={handleReset} style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#666' }}>
                    ✕ Сбросить
                  </button>
                </div>
              </div>
              <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '0.5rem', maxHeight: '200px', overflowY: 'auto', fontSize: '0.875rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {transcript}
              </div>

              {step === 'transcribed' && (
                <button
                  onClick={handleAnalyze}
                  style={{ marginTop: '1rem', width: '100%', padding: '0.875rem', background: '#000', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600', fontSize: '1rem' }}
                >
                  🔍 Анализировать под психолога
                </button>
              )}

              {step === 'analyzing' && (
                <div style={{ marginTop: '1rem', textAlign: 'center', padding: '1.5rem', background: '#f5f5f5', borderRadius: '0.5rem' }}>
                  <p style={{ fontWeight: '500' }}>🤖 Анализирую и готовлю сценарий...</p>
                  <p style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem' }}>Claude Sonnet — обычно 15-30 секунд</p>
                </div>
              )}
            </div>
          )}

          {step === 'done' && analysis && (
            <div style={{ border: '1px solid #ddd', borderRadius: '0.5rem', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>✅ Анализ готов</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => copyText(analysis)} style={{ padding: '0.5rem 1rem', border: '1px solid #ddd', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer' }}>
                    📋 Копировать
                  </button>
                  <button onClick={handleReset} style={{ padding: '0.5rem 1rem', border: '1px solid #ddd', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer', color: '#666' }}>
                    🔄 Новый анализ
                  </button>
                </div>
              </div>
              <ReactMarkdown>{analysis}</ReactMarkdown>
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: '0.5rem', padding: '1rem' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '1rem' }}>📜 История</h3>
          {history.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center' }}>Пока пусто</p>
          ) : (
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {history.map(item => (
                <div key={item.id} onClick={() => loadFromHistory(item)} style={{ padding: '0.75rem', borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{item.platform}</span>
                    <button onClick={e => { e.stopPropagation(); handleDelete(item.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}>🗑</button>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                    {new Date(item.created_at).toLocaleDateString('ru-RU')}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.transcript?.slice(0, 60)}...
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
