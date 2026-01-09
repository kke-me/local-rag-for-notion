/**
 * Notionページの基本情報
 */
export interface NotionPageInfo {
  id: string
  title: string
  lastEditedTime: string
  url: string
}

/**
 * Notionページのコンテンツ
 */
export interface NotionPageContent {
  pageInfo: NotionPageInfo
  content: string
}

/**
 * LM Studio の生成結果
 */
export interface LmStudioResponse {
  text: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * RAGの検索結果
 */
export interface RagSearchResult {
  pageId: string
  pageTitle: string
  content: string
  score: number
}

/**
 * RAGの回答
 */
export interface RagAnswer {
  answer: string
  sources: RagSearchResult[]
  query: string
}

/**
 * インデックス化結果
 */
export interface IndexResult {
  pageId: string
  pageTitle: string
  chunksCount: number
  success: boolean
  error?: string
}

/**
 * インデックスステータス
 */
export interface IndexStatus {
  documentCount: number
  indexedPageIds: string[]
}

/**
 * ヘルスチェックレスポンス
 */
export interface HealthCheckResponse {
  status: 'ok' | 'error'
  lmStudio: {
    connected: boolean
    baseUrl: string
  }
  notion: {
    configured: boolean
  }
  error?: string
}
