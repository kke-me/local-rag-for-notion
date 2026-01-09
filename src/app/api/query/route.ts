import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ragQuery } from '@/lib/rag'

/**
 * POST: RAGクエリ（LLM回答付き）
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { query, maxSources = 5, minScore = 0.3, maxTokens = 1024, temperature = 0.3 } = body

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const result = await ragQuery(query, {
      maxSources,
      minScore,
      maxTokens,
      temperature
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
