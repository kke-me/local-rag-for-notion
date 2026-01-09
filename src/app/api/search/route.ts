import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { searchDocuments } from '@/lib/rag'

/**
 * POST: ドキュメント検索（LLM回答なし）
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { query, limit = 10, minScore = 0.3 } = body

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const results = await searchDocuments(query, { limit, minScore })

    return NextResponse.json({ results, query })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
