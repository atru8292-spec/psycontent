'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
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

export default function CompetitorAnalysisPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ analysis: string; transcript: string; metadata: any; platform: string } | null>(null)
  const [history, setHistory] = useState<Analysis[]>([])
  const [activeTab, setActiveTab] = useState<'analysis' | 'transcript'>('analysis')

  const supabase = createClient()

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    const { data } = await supabase
      .from('competitor_analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data)
  }

  const handleAnalyze = async () => {
    if (!url.trim()) return alert('Вставь ссылку')
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/analyze-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      loadHistory()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    await supabase.from('competitor_analyses').delete().eq('id', id)
    setHistory(history.filter(h => h.id !== id))
  }

  const loadFromHistory = (item: Analysis) => {
    setResult({ analysis: item.analysis, transcript: item.transcript, metadata: item.metadata, platform: item.platform })
    setUrl(item.url)
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Скопировано!')
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>🔍 Анализ конкурентов</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Вставь ссылку на Reels/TikTok/YouTube — получи анализ и сценарий</p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <div>
          {/* Input */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <input
              type="text"
              placeholder="https://instagram.com/reel/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              disabled={loading}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                border: '1px solid #ddd',
                borderRadius: '0.5rem',
                fontSize: '1rem',
              }}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !url.trim()}
              style={{
                padding: '0.75rem 1.5rem',
                background: loading ? '#ccc' : '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: '500',
              }}
            >
              {loading ? '⏳ Анализирую...' : '🔍 Анализировать'}
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem', background: '#f5f5f5', borderRadius: '0.5rem' }}>
              <p style={{ fontSize: '1.125rem', fontWeight: '500' }}>Анализирую видео...</p>
              <p style={{ color: '#666', marginTop: '0.5rem' }}>Получаю транскрипцию и готовлю рекомендации</p>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div style={{ border: '1px solid #ddd', borderRadius: '0.5rem', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Результат ({result.platform})</h2>
                  {result.metadata?.author && <p style={{ color: '#666' }}>@{result.metadata.author}</p>}
                </div>
                <button onClick={() => copyText(result.analysis)} style={{ padding: '0.5rem 1rem', border: '1px solid #ddd', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer' }}>
                  📋 Копировать
                </button>
              </div>

              {/* Metadata */}
              {result.metadata && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', color: '#666', fontSize: '0.875rem' }}>
                  {result.metadata.viewCount && <span>👁 {result.metadata.viewCount.toLocaleString()}</span>}
                  {result.metadata.likeCount && <span>❤️ {result.metadata.likeCount.toLocaleString()}</span>}
                  {result.metadata.commentCount && <span>💬 {result.metadata.commentCount.toLocaleString()}</span>}
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button
                  onClick={() => setActiveTab('analysis')}
                  style={{
                    padding: '0.5rem 1rem',
                    border: 'none',
                    borderRadius: '0.25rem',
                    background: activeTab === 'analysis' ? '#000' : '#eee',
                    color: activeTab === 'analysis' ? '#fff' : '#000',
                    cursor: 'pointer',
                  }}
                >
                  Анализ
                </button>
                <button
                  onClick={() => setActiveTab('transcript')}
                  style={{
                    padding: '0.5rem 1rem',
                    border: 'none',
                    borderRadius: '0.25rem',
                    background: activeTab === 'transcript' ? '#000' : '#eee',
                    color: activeTab === 'transcript' ? '#fff' : '#000',
                    cursor: 'pointer',
                  }}
                >
                  Транскрипция
                </button>
              </div>

              {activeTab === 'analysis' ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{result.analysis}</ReactMarkdown>
                </div>
              ) : (
                <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '0.5rem', whiteSpace: 'pre-wrap' }}>
                  {result.transcript}
                </div>
              )}
            </div>
          )}
        </div>

        {/* History */}
        <div style={{ border: '1px solid #ddd', borderRadius: '0.5rem', padding: '1rem' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '1rem' }}>📜 История</h3>
          {history.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center' }}>Пока пусто</p>
          ) : (
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {history.map(item => (
                <div
                  key={item.id}
                  onClick={() => loadFromHistory(item)}
                  style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid #eee',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>
                      {item.metadata?.author ? `@${item.metadata.author}` : item.platform}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(item.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}
                    >
                      🗑
                    </button>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                    {new Date(item.created_at).toLocaleDateString('ru-RU')}
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
