import { NextResponse } from 'next/server'
import type { ChatMessage } from '@/lib/rag'
import type { NextRequest } from 'next/server'
import { chatWithRag } from '@/lib/rag'

/**
 * POST: チャットRAG
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const {
      message,
      history = [],
      maxSources = 5,
      minScore = 0.2,
      maxTokens = 1024,
      temperature = 0.5
    } = body as {
      message: string
      history?: ChatMessage[]
      maxSources?: number
      minScore?: number
      maxTokens?: number
      temperature?: number
    }

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const result = await chatWithRag(message, history, {
      maxSources,
      minScore,
      maxTokens,
      temperature
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
