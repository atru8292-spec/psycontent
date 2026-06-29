'use client'

import { useState, useEffect } from 'react'
import NextImage from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
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
import Squiggle from '@/components/Squiggle'
import EmptyState from '@/components/EmptyState'
import { splitPostTitle } from '@/lib/post-format'

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
            <NextImage src="/logo/out_wordmark.svg" alt="PsyCont" width={110} height={28} className="h-6 w-auto" />
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
          <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <History className="w-4 h-4" />
            История постов
          </div>
          <h1 className="text-3xl font-bold text-brand-text mb-2">
            Ваши сгенерированные посты
          </h1>
          <Squiggle variant={2} width="55%" />
          <p className="text-brand-text-secondary mt-3">
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyState
              variant={1}
              title={posts.length === 0 ? 'Пока пусто' : 'Ничего не найдено'}
              subtitle={posts.length === 0
                ? 'Создайте первый пост, и он сохранится здесь автоматически. Вы сможете вернуться, скопировать или отметить в избранном.'
                : 'По вашему запросу ничего нет. Попробуйте изменить фильтр или поиск.'}
              actionLabel={posts.length === 0 ? 'Написать первый пост' : undefined}
              onAction={posts.length === 0 ? () => router.push('/dashboard/post-generator') : undefined}
            />
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {filteredPosts.map((post, i) => {
                const FormatIcon = formatIcons[post.format] || AlignLeft
                const isExpanded = expandedId === post.id
                // Заголовок-вывеска отделяется от тела (как в генераторе и демо).
                const { title, body } = splitPostTitle(post.content, post.format)
                const preview = body.slice(0, 200)
                const hasMore = body.length > 200

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
                              ? 'text-brand-accent bg-brand-soft' 
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
                            <Check className="w-4 h-4 text-brand-sage" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="p-2 rounded-lg text-brand-text-secondary hover:bg-brand-soft hover:text-brand-accent transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Post content */}
                    <div className="p-5">
                      {title && (
                        <div className="mb-3">
                          <h3 className="text-base sm:text-lg font-bold text-brand-text leading-snug">{title}</h3>
                          <Squiggle variant={0} width="120px" />
                        </div>
                      )}
                      <p className="text-sm text-brand-text-secondary leading-relaxed whitespace-pre-wrap">
                        {isExpanded ? body : preview}
                        {!isExpanded && hasMore && '...'}
                      </p>

                      {hasMore && (
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
