'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  History,
  Copy,
  Check,
  Trash2,
  Star,
  Filter,
  Search,
  Calendar,
  FileText,
  Image,
  AlignLeft,
} from 'lucide-react'

interface Post {
  id: string
  topic: string
  format: string
  category: string
  content: string
  is_favorite: boolean
  created_at: string
}

const formatIcons: Record<string, any> = {
  post: AlignLeft,
  carousel: Image,
  stories: FileText,
}

const formatLabels: Record<string, string> = {
  post: 'Пост',
  carousel: 'Карусель',
  stories: 'Stories',
}

export default function PostHistory() {
  const [user, setUser] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)
      await loadPosts(user.id)
    }
    init()
  }, [router])

  const loadPosts = async (userId: string) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('generated_posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Load error:', error)
    } else {
      setPosts(data || [])
    }
    setLoading(false)
  }

  const handleCopy = (post: Post) => {
    navigator.clipboard.writeText(post.content)
    setCopiedId(post.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить этот пост?')) return
    
    const { error } = await supabase
      .from('generated_posts')
      .delete()
      .eq('id', id)

    if (!error) {
      setPosts(posts.filter(p => p.id !== id))
    }
  }

  const toggleFavorite = async (post: Post) => {
    const { error } = await supabase
      .from('generated_posts')
      .update({ is_favorite: !post.is_favorite })
      .eq('id', post.id)

    if (!error) {
      setPosts(posts.map(p => 
        p.id === post.id ? { ...p, is_favorite: !p.is_favorite } : p
      ))
    }
  }

  const filteredPosts = posts.filter(post => {
    const matchesFilter = filter === 'all' || 
      (filter === 'favorites' && post.is_favorite) ||
      post.format === filter
    const matchesSearch = !search || 
      post.topic?.toLowerCase().includes(search.toLowerCase()) ||
      post.content.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-accent" />
            <span className="font-bold text-brand-text">PsyContent</span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Title */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-5 sm:mb-8"
        >
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <History className="w-4 h-4" />
            История постов
          </div>
          <h1 className="text-3xl font-bold text-brand-text mb-2">
            Ваши сгенерированные посты
          </h1>
          <p className="text-brand-text-secondary">
            {posts.length} {posts.length === 1 ? 'пост' : posts.length < 5 ? 'поста' : 'постов'} сохранено
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 flex flex-col sm:flex-row gap-4"
        >
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-secondary" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по постам..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'Все' },
              { id: 'favorites', label: '⭐ Избранное' },
              { id: 'post', label: 'Посты' },
              { id: 'carousel', label: 'Карусели' },
              { id: 'stories', label: 'Stories' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                  filter === f.id
                    ? 'bg-brand-accent text-white'
                    : 'bg-white border border-brand-border text-brand-text-secondary hover:border-brand-accent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Posts list */}
        {filteredPosts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <History className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-brand-text-secondary font-medium">
              {posts.length === 0 ? 'Пока нет сгенерированных постов' : 'Ничего не найдено'}
            </p>
            {posts.length === 0 && (
              <button
                onClick={() => router.push('/dashboard/post-generator')}
                className="mt-4 px-6 py-2 bg-brand-accent text-white rounded-xl text-sm font-medium hover:bg-brand-accent-hover transition cursor-pointer"
              >
                Создать первый пост
              </button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {filteredPosts.map((post, i) => {
                const FormatIcon = formatIcons[post.format] || AlignLeft
                const isExpanded = expandedId === post.id
                const preview = post.content.slice(0, 200)

                return (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl border border-brand-border overflow-hidden"
                  >
                    {/* Post header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-brand-border bg-brand-bg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-brand-border flex items-center justify-center">
                          <FormatIcon className="w-4 h-4 text-brand-text-secondary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-brand-text line-clamp-1">
                            {post.topic || 'Без темы'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-brand-text-secondary">
                            <span>{formatLabels[post.format] || post.format}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(post.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleFavorite(post)}
                          className={`p-2 rounded-lg transition cursor-pointer ${
                            post.is_favorite 
                              ? 'text-yellow-500 bg-yellow-50' 
                              : 'text-brand-text-secondary hover:bg-brand-bg'
                          }`}
                        >
                          <Star className={`w-4 h-4 ${post.is_favorite ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleCopy(post)}
                          className="p-2 rounded-lg text-brand-text-secondary hover:bg-brand-bg transition cursor-pointer"
                        >
                          {copiedId === post.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="p-2 rounded-lg text-brand-text-secondary hover:bg-red-50 hover:text-red-500 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Post content */}
                    <div className="p-5">
                      <p className="text-sm text-brand-text leading-relaxed whitespace-pre-wrap">
                        {isExpanded ? post.content : preview}
                        {!isExpanded && post.content.length > 200 && '...'}
                      </p>
                      
                      {post.content.length > 200 && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : post.id)}
                          className="mt-3 text-sm text-brand-accent hover:underline cursor-pointer"
                        >
                          {isExpanded ? 'Свернуть' : 'Читать полностью'}
                        </button>
                      )}
                    </div>

                    {/* Category badge */}
                    {post.category && (
                      <div className="px-5 pb-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-brand-bg text-xs font-medium text-brand-text-secondary">
                          {post.category}
                        </span>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
