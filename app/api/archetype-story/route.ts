import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'
import { ANTI_SLOP_RULES } from '@/lib/anti-slop'
import { getSessionUser } from '@/lib/auth'
import { ARCHETYPES, archetypeLabel, type ArchetypeSelection } from '@/lib/archetypes'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const STORY_SYSTEM = `Ты пишешь короткий теплый личный разбор для психолога по результату теста на его архетип автора. Говоришь ему по-человечески, на ты, в чем его сила как автора и почему это ценно. Без обещаний клиентов, без инфоцыганства, без пафоса, без «поздравляем» и «твоя миссия». Живой русский, как говорит живой человек, а не нейросеть. Всегда буква е вместо ё, без тире (перестраивай фразу).

${ANTI_SLOP_RULES}`

export async function POST() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const supabase = getSupabaseAdmin()
    const { data: profile, error } = await supabase
      .from('onboarding_profiles')
      .select('archetype_scores, archetype_primary, live_voice, full_name, one_niche, niches, client_pain_phrases')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: 'server_error' }, { status: 500 })

    const sel: ArchetypeSelection | null =
      profile?.archetype_scores?.selection ||
      (profile?.archetype_primary ? { primary: profile.archetype_primary } : null)

    if (!sel || !sel.primary) {
      return NextResponse.json({ error: 'no_archetype' }, { status: 400 })
    }

    const label = archetypeLabel(sel)
    const primary = ARCHETYPES[sel.primary]
    const secondary = sel.secondary ? ARCHETYPES[sel.secondary] : null
    const niche = profile?.one_niche || (Array.isArray(profile?.niches) ? profile?.niches[0] : '') || ''
    const voice = (profile?.live_voice || '').slice(0, 1200)

    const peerKeys = sel.flexible && sel.peers && sel.peers.length >= 2 ? sel.peers : null
    const prompt = `Психолог прошел тест, его архетип автора: ${label}.
${peerKeys
  ? `У него несколько архетипов на равных (${peerKeys.length}), явного лидера нет, все выражены одинаково сильно:
${peerKeys.map((k) => `- ${ARCHETYPES[k].name}: ${ARCHETYPES[k].gift}. В блоге это ${ARCHETYPES[k].blog}`).join('\n')}`
  : `Ведущий (${primary.name}): ${primary.gift}. В блоге это ${primary.blog}
${secondary ? `Оттенок (${secondary.name}): ${secondary.gift}` : ''}`}
${niche ? `Ниша: ${niche}.` : ''}
${voice ? `Его собственные слова из ответов (опирайся на них, лови интонацию, но не цитируй дословно длинно):\n${voice}` : ''}

Напиши 2-3 коротких абзаца, тепло и лично, на ты:
1. Узнавание его силы как автора: что он за автор, в чем его дар, чтобы он подумал «да, это про меня». Опирайся на его архетип и на его слова.${peerKeys ? ` У него ${peerKeys.length} равных архетипа: объясни ВСЕ как равные силы и как он свободно переходит между ними, это широта. Не описывай только один и не назначай главный.` : ''}
2. Мягко о том, почему прошлые посты могли заходить слабее: если он пытался писать не в своем голосе (бодро и коротко, как советуют, вместо своей силы), в этом причина. Без обвинений, по-доброму.
3. Теплый мост: теперь посты будут собираться в его голосе, а не в среднем по нейросети.

НЕ перечисляй по пунктам «что изменится в постах», это показывается отдельно. Только живой человеческий разбор, без заголовков и предисловий.

Одну самую важную фразу-узнавание в первом абзаце оберни в двойные звездочки, вот так: **эта фраза**. Ровно одну на весь текст, ее выделят цветом. Больше звездочки нигде не используй.`

    const story = await generateWithAI(STORY_SYSTEM, prompt, {
      userId: user.id,
      operation: 'archetype_story',
      knownNames: profile?.full_name ? [profile.full_name] : undefined,
    })

    if (!story) return NextResponse.json({ error: 'empty' }, { status: 500 })
    return NextResponse.json({ story })
  } catch (e: any) {
    console.error('archetype-story error:', e?.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
