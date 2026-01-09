import { NextResponse } from 'next/server'
import { checkLmStudioConnection } from '@/lib/lm-studio'

/**
 * GET: ヘルスチェック
 */
export async function GET(): Promise<NextResponse> {
  try {
    const lmStudioConnected = await checkLmStudioConnection()

    return NextResponse.json({
      status: 'ok',
      lmStudio: {
        connected: lmStudioConnected,
        baseUrl: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1'
      },
      notion: {
        configured: !!process.env.NOTION_API_KEY
      }
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
