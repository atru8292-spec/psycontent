// app/dashboard/competitor-analysis/page.tsx

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Search, Copy, Check, Instagram, Youtube, Video, Clock, Eye, Heart, MessageCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<Analysis[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoadingHistory(true)
    const { data } = await supabase
      .from('competitor_analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data)
    setLoadingHistory(false)
  }

  const detectPlatform = (u: string) => {
    if (u.includes('instagram.com')) return 'instagram'
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
    if (u.includes('tiktok.com')) return 'tiktok'
    return 'video'
  }

  const handleAnalyze = async () => {
    if (!url.trim()) return toast.error('Вставь ссылку')
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
      toast.success('Готово!')
      loadHistory()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    await supabase.from('competitor_analyses').delete().eq('id', id)
    setHistory(history.filter(h => h.id !== id))
    toast.success('Удалено')
  }

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Скопировано!')
    setTimeout(() => setCopied(false), 2000)
  }

  const loadFromHistory = (item: Analysis) => {
    setResult({ analysis: item.analysis, transcript: item.transcript, metadata: item.metadata, platform: item.platform })
    setUrl(item.url)
  }

  const platform = url ? detectPlatform(url) : null

  const PlatformIcon = ({ p }: { p: string | null }) => {
    if (p?.includes('instagram')) return <Instagram className="h-4 w-4 text-pink-500" />
    if (p?.includes('youtube')) return <Youtube className="h-4 w-4 text-red-500" />
    return <Video className="h-4 w-4 text-muted-foreground" />
  }

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🔍 Анализ конкурентов</h1>
        <p className="text-muted-foreground">Вставь ссылку на Reels/TikTok/YouTube — получи анализ и сценарий</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Input */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  {platform && <div className="absolute left-3 top-1/2 -translate-y-1/2"><PlatformIcon p={platform} /></div>}
                  <Input
                    placeholder="https://instagram.com/reel/..."
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    className={platform ? 'pl-10' : ''}
                    disabled={loading}
                    onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                  />
                </div>
                <Button onClick={handleAnalyze} disabled={loading || !url.trim()}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Анализирую...</> : <><Search className="mr-2 h-4 w-4" />Анализировать</>}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Instagram • YouTube • TikTok • Facebook • X</p>
            </CardContent>
          </Card>

          {/* Loading */}
          {loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="font-medium">Анализирую видео...</p>
                <p className="text-sm text-muted-foreground">Получаю транскрипцию и готовлю рекомендации</p>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {result && !loading && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="flex items-center gap-2">
                  <PlatformIcon p={result.platform} />
                  <div>
                    <CardTitle className="text-lg">Результат</CardTitle>
                    {result.metadata?.author && <CardDescription>@{result.metadata.author}</CardDescription>}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyText(result.analysis)}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </Button>
              </CardHeader>
              <CardContent>
                {result.metadata && (
                  <div className="mb-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {result.metadata.viewCount && <span className="flex items-center gap-1"><Eye className="h-4 w-4" />{result.metadata.viewCount.toLocaleString()}</span>}
                    {result.metadata.likeCount && <span className="flex items-center gap-1"><Heart className="h-4 w-4" />{result.metadata.likeCount.toLocaleString()}</span>}
                    {result.metadata.commentCount && <span className="flex items-center gap-1"><MessageCircle className="h-4 w-4" />{result.metadata.commentCount.toLocaleString()}</span>}
                    {result.metadata.duration && <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{Math.round(result.metadata.duration)}с</span>}
                  </div>
                )}
                <Tabs defaultValue="analysis">
                  <TabsList>
                    <TabsTrigger value="analysis">Анализ</TabsTrigger>
                    <TabsTrigger value="transcript">Транскрипция</TabsTrigger>
                  </TabsList>
                  <TabsContent value="analysis" className="mt-4 prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{result.analysis}</ReactMarkdown>
                  </TabsContent>
                  <TabsContent value="transcript" className="mt-4">
                    <div className="bg-muted p-4 rounded-lg text-sm whitespace-pre-wrap">{result.transcript}</div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📜 История</CardTitle>
            <CardDescription>Последние 20</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Пока пусто</p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {history.map(item => (
                  <div key={item.id} className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer group" onClick={() => loadFromHistory(item)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <PlatformIcon p={item.platform} />
                        <span className="text-sm font-medium truncate">{item.metadata?.author ? `@${item.metadata.author}` : 'Без названия'}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); handleDelete(item.id) }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{item.url}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
