import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Slide = { slide: number; text: string }

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env variables')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const { userId, carouselId, topic, pillar, slides } = await req.json()

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    if (!Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json({ error: 'slides required' }, { status: 400 })
    }

    const normalized: Slide[] = slides
      .map((item: any, index: number) => ({
        slide: index + 1,
        text: typeof item?.text === 'string' ? item.text.trim() : '',
      }))
      .filter((item: Slide) => item.text.length > 0)

    if (!normalized.length) {
      return NextResponse.json({ error: 'slides are empty' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (carouselId) {
      const { data, error } = await supabase
        .from('generated_posts')
        .update({
          content: JSON.stringify(normalized),
          topic: topic || 'Карусель',
          category: pillar || 'Карусель',
        })
        .eq('id', carouselId)
        .eq('user_id', userId)
        .select('id')
        .single()

      if (!error && data?.id) {
        return NextResponse.json({ carouselId: data.id })
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('generated_posts')
      .insert({
        user_id: userId,
        topic: topic || 'Карусель',
        format: 'carousel',
        content: JSON.stringify(normalized),
        category: pillar || 'Карусель',
        source: 'carousel-generator',
      })
      .select('id')
      .single()

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({ carouselId: inserted.id })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Не удалось сохранить карусель' },
      { status: 500 }
    )
  }
}
