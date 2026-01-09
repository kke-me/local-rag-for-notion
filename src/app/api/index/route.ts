import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getIndexStatus, indexDatabase, indexPageWithChildren } from '@/lib/indexer'

/**
 * GET: インデックスの状態を取得
 */
export async function GET(): Promise<NextResponse> {
  try {
    const status = await getIndexStatus()
    return NextResponse.json(status)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST: インデックス化を実行
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const {
      pageId,
      databaseId,
      forceReindex = false,
      incrementalIndex = true, // デフォルトで増分インデックスを有効化
      chunkSize,
      chunkOverlap
    } = body

    // 単一ページのインデックス化（子ページを含む）
    if (pageId) {
      const result = await indexPageWithChildren(pageId, {
        forceReindex,
        incrementalIndex,
        chunkSize,
        chunkOverlap
      })
      return NextResponse.json(result)
    }

    // データベース全体のインデックス化
    const result = await indexDatabase(databaseId, {
      forceReindex,
      chunkSize,
      chunkOverlap
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Index error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
