'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { 
  Calendar, 
  FileText, 
  Images, 
  MessageSquare,
  Sparkles
} from 'lucide-react'

interface ContentDay {
  day: number
  weekday: string
  date?: string
  pillar: string
  topic: string
  format: 'post' | 'carousel' | 'stories'
  hook?: string
}

interface ContentPlanDisplayProps {
  plan: ContentDay[]
}

const formatIcons = {
  post: FileText,
  carousel: Images,
  stories: MessageSquare
}

const formatLabels = {
  post: 'Пост',
  carousel: 'Карусель',
  stories: 'Сторис'
}

const pillarColors: Record<string, string> = {
  'Экспертность': 'bg-blue-100 text-blue-800 border-blue-200',
  'Личность': 'bg-purple-100 text-purple-800 border-purple-200',
  'Польза': 'bg-green-100 text-green-800 border-green-200',
  'Вовлечение': 'bg-orange-100 text-orange-800 border-orange-200',
  'Продажа': 'bg-pink-100 text-pink-800 border-pink-200',
}

export function ContentPlanDisplay({ plan }: ContentPlanDisplayProps) {
  const router = useRouter()

  const handleGeneratePost = (day: ContentDay) => {
    const params = new URLSearchParams({
      topic: day.topic,
      format: day.format,
      pillar: day.pillar,
      fromPlan: 'true'
    })
    router.push(`/dashboard/generate?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {plan.map((day) => {
        const FormatIcon = formatIcons[day.format] || FileText
        const pillarClass = pillarColors[day.pillar] || 'bg-gray-100 text-gray-800'
        
        return (
          <Card key={day.day} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              {/* Левая часть */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="w-4 h-4" />
                    <span className="font-medium">День {day.day}</span>
                    {day.weekday && <span>• {day.weekday}</span>}
                    {day.date && <span className="text-gray-400">({day.date})</span>}
                  </div>
                </div>

                <h3 className="font-semibold text-gray-900 mb-2">
                  {day.topic}
                </h3>

                {day.hook && (
                  <p className="text-sm text-gray-600 italic mb-3">
                    "{day.hook}"
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${pillarClass}`}>
                    {day.pillar}
                  </span>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 flex items-center gap-1">
                    <FormatIcon className="w-3 h-3" />
                    {formatLabels[day.format]}
                  </span>
                </div>
              </div>

              {/* Кнопка генерации */}
              <Button
                onClick={() => handleGeneratePost(day)}
                className="shrink-0"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Написать пост
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
