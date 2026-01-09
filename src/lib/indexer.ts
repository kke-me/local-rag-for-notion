import { getEmbeddingDimension } from './lm-studio'
import { getAllPageIds, getDatabasePages, getPage, getPageContent } from './notion'
import { splitTextWithMetadata } from './text-splitter'
import {
  addChunks,
  deletePageChunks,
  getDocumentCount,
  getIndexedPageIds,
  getPageLastEditedTime
} from './vector-store'
import type {
  PageObjectResponse,
  RichTextItemResponse
} from '@notionhq/client/build/src/api-endpoints'

/**
 * インデックス化の結果
 */
export interface IndexResult {
  pageId: string
  pageTitle: string
  chunksCount: number
  success: boolean
  error?: string
}

/**
 * ページタイトルを取得
 */
function getPageTitle(page: PageObjectResponse): string {
  // Titleプロパティを探す
  for (const [, prop] of Object.entries(page.properties)) {
    if (prop.type === 'title' && prop.title.length > 0) {
      return (prop.title as RichTextItemResponse[]).map((t) => t.plain_text).join('')
    }
  }
  return 'Untitled'
}

/**
 * 単一ページをインデックス化
 */
export async function indexPage(
  pageId: string,
  options?: {
    chunkSize?: number
    chunkOverlap?: number
    forceReindex?: boolean
    incrementalIndex?: boolean // 増分インデックスモード
  }
): Promise<IndexResult> {
  const { chunkSize, chunkOverlap, forceReindex = false, incrementalIndex = false } = options || {}

  try {
    // ページ情報を取得
    const page = await getPage(pageId)
    const pageTitle = getPageTitle(page)
    const pageLastEditedTime = page.last_edited_time

    // 増分インデックスモードの場合、更新チェック
    if (incrementalIndex && !forceReindex) {
      const storedLastEditedTime = await getPageLastEditedTime(pageId)

      if (storedLastEditedTime) {
        // すでにインデックス済みで、更新されていない場合はスキップ
        if (new Date(pageLastEditedTime) <= new Date(storedLastEditedTime)) {
          return {
            pageId,
            pageTitle,
            chunksCount: 0,
            success: true,
            error: 'Up to date (skipped)'
          }
        }

        // 更新されている場合は古いチャンクを削除
        console.log(`  Page updated, re-indexing: ${pageTitle}`)
        await deletePageChunks(pageId)
      }
    } else {
      // 通常モード: 既にインデックス済みかどうかを確認
      const indexedPageIds = await getIndexedPageIds()
      const isAlreadyIndexed = indexedPageIds.includes(pageId)

      // 強制再インデックスでない場合、既存のインデックスがあればスキップ
      if (!forceReindex && isAlreadyIndexed) {
        return {
          pageId,
          pageTitle,
          chunksCount: 0,
          success: true,
          error: 'Already indexed (skipped)'
        }
      }

      // 既存のチャンクを削除（再インデックス時）
      if (forceReindex && isAlreadyIndexed) {
        await deletePageChunks(pageId)
      }
    }

    // ページコンテンツを取得
    const content = await getPageContent(pageId)

    if (!content.trim()) {
      return {
        pageId,
        pageTitle,
        chunksCount: 0,
        success: true
      }
    }

    // テキストを分割
    const chunks = await splitTextWithMetadata(content, pageId, pageTitle, pageLastEditedTime, {
      chunkSize,
      chunkOverlap
    })

    // Embeddingの次元数を取得
    const embeddingDimension = await getEmbeddingDimension()

    // ベクトルDBに追加
    await addChunks(chunks, embeddingDimension)

    return {
      pageId,
      pageTitle,
      chunksCount: chunks.length,
      success: true
    }
  } catch (error) {
    return {
      pageId,
      pageTitle: '',
      chunksCount: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * データベース内の全ページをインデックス化
 */
export async function indexDatabase(
  databaseId?: string,
  options?: {
    chunkSize?: number
    chunkOverlap?: number
    forceReindex?: boolean
    onProgress?: (current: number, total: number, result: IndexResult) => void
  }
): Promise<{
  results: IndexResult[]
  totalPages: number
  successCount: number
  totalChunks: number
}> {
  const { chunkSize, chunkOverlap, forceReindex = false, onProgress } = options || {}

  // データベースからページ一覧を取得
  const pages = await getDatabasePages(databaseId)
  const results: IndexResult[] = []
  let totalChunks = 0

  // 再インデックス時は全ページ削除
  if (forceReindex) {
    const indexedPageIds = await getIndexedPageIds()
    for (const pageId of indexedPageIds) {
      await deletePageChunks(pageId)
    }
  }

  // 各ページをインデックス化
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const result = await indexPage(page.id, {
      chunkSize,
      chunkOverlap,
      forceReindex: false // 既に削除済み
    })

    results.push(result)
    if (result.success) {
      totalChunks += result.chunksCount
    }

    if (onProgress) {
      onProgress(i + 1, pages.length, result)
    }
  }

  return {
    results,
    totalPages: pages.length,
    successCount: results.filter((r) => r.success).length,
    totalChunks
  }
}

/**
 * インデックスの状態を取得
 */
export async function getIndexStatus(): Promise<{
  documentCount: number
  indexedPageIds: string[]
}> {
  const [documentCount, indexedPageIds] = await Promise.all([
    getDocumentCount(),
    getIndexedPageIds()
  ])

  return {
    documentCount,
    indexedPageIds
  }
}

/**
 * ページとその子ページを含めてインデックス化
 */
export async function indexPageWithChildren(
  pageId: string,
  options?: {
    chunkSize?: number
    chunkOverlap?: number
    forceReindex?: boolean
    incrementalIndex?: boolean // 増分インデックスモード
    onProgress?: (current: number, total: number, pageId: string, pageTitle: string) => void
  }
): Promise<{
  results: IndexResult[]
  totalPages: number
  successCount: number
  totalChunks: number
}> {
  const {
    chunkSize,
    chunkOverlap,
    forceReindex = false,
    incrementalIndex = true, // デフォルトで増分インデックスを有効化
    onProgress
  } = options || {}

  // ページとその子ページのIDをすべて取得
  console.log(`Getting all page IDs from: ${pageId}`)
  const allPageIds = await getAllPageIds(pageId)
  console.log(`Found ${allPageIds.length} pages (including children)`)

  const results: IndexResult[] = []
  let totalChunks = 0

  // 並列処理数（レート制限を考慮して最小限に）
  const CONCURRENCY = 1 // Notion APIのレート制限回避のため1ページずつ処理
  const DELAY_BETWEEN_REQUESTS = 400 // リクエスト間の遅延 (400ms = 2.5リクエスト/秒)

  // バッチ処理で並列実行
  for (let i = 0; i < allPageIds.length; i += CONCURRENCY) {
    const batch = allPageIds.slice(i, i + CONCURRENCY)
    console.log(
      `\nProcessing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(allPageIds.length / CONCURRENCY)} (pages ${i + 1}-${Math.min(i + CONCURRENCY, allPageIds.length)}/${allPageIds.length})`
    )

    // 並列でページをインデックス化
    const batchResults = await Promise.all(
      batch.map(async (currentPageId, batchIndex) => {
        const globalIndex = i + batchIndex
        console.log(
          `  [${globalIndex + 1}/${allPageIds.length}] Indexing: ${currentPageId.substring(0, 8)}...`
        )

        const result = await indexPage(currentPageId, {
          chunkSize,
          chunkOverlap,
          forceReindex,
          incrementalIndex
        })

        const statusIcon = result.success ? '✓' : '✗'
        const status = result.error || `${result.chunksCount} chunks`
        console.log(
          `  [${globalIndex + 1}/${allPageIds.length}] ${statusIcon} ${result.pageTitle} (${status})`
        )

        if (onProgress) {
          onProgress(globalIndex + 1, allPageIds.length, result.pageId, result.pageTitle)
        }

        return result
      })
    )

    results.push(...batchResults)
    totalChunks += batchResults.reduce((sum, r) => sum + (r.success ? r.chunksCount : 0), 0)

    // リクエスト間に遅延を入れる（レート制限回避）
    if (i + CONCURRENCY < allPageIds.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS))
    }
  }

  console.log(`\n✓ Indexing complete: ${results.length} pages, ${totalChunks} chunks`)

  return {
    results,
    totalPages: allPageIds.length,
    successCount: results.filter((r) => r.success).length,
    totalChunks
  }
}
