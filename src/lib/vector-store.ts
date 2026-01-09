import * as lancedb from '@lancedb/lancedb'
import { getEmbedding, getEmbeddings } from './embedding' // Ruri-v3に切り替え
import type { ChunkWithMetadata } from './text-splitter'

/**
 * LanceDBのテーブル名
 */
const TABLE_NAME = 'notion_chunks'

/**
 * LanceDBに保存するドキュメントの型
 */
export interface VectorDocument {
  id: string
  pageId: string
  pageTitle: string
  content: string
  chunkIndex: number
  totalChunks: number
  vector: number[]
  createdAt: string
  lastEditedTime: string // ページの最終更新時刻
}

/**
 * 検索結果の型
 */
export interface SearchResult {
  document: VectorDocument
  score: number
}

/**
 * データベース接続を取得
 */
let dbConnection: lancedb.Connection | null = null

export async function getDatabase(): Promise<lancedb.Connection> {
  if (!dbConnection) {
    const dbPath = process.env.LANCEDB_PATH || './data/lancedb'
    dbConnection = await lancedb.connect(dbPath)
  }
  return dbConnection
}

/**
 * テーブルを取得（存在しない場合は作成）
 */
export async function getOrCreateTable(
  embeddingDimension: number
): Promise<lancedb.Table<VectorDocument>> {
  const db = await getDatabase()
  const tableNames = await db.tableNames()

  if (tableNames.includes(TABLE_NAME)) {
    return db.openTable<VectorDocument>(TABLE_NAME)
  }

  // 初期データでテーブルを作成
  const initialData: VectorDocument[] = [
    {
      id: 'init',
      pageId: '',
      pageTitle: '',
      content: '',
      chunkIndex: 0,
      totalChunks: 0,
      vector: new Array(embeddingDimension).fill(0),
      createdAt: new Date().toISOString(),
      lastEditedTime: new Date().toISOString()
    }
  ]

  const table = await db.createTable<VectorDocument>(TABLE_NAME, initialData)

  // 初期データを削除
  await table.delete('id = "init"')

  return table
}

/**
 * チャンクをベクトルDBに追加
 */
export async function addChunks(
  chunks: ChunkWithMetadata[],
  embeddingDimension: number
): Promise<void> {
  if (chunks.length === 0) return

  const table = await getOrCreateTable(embeddingDimension)

  // バッチでEmbeddingを取得
  const contents = chunks.map((c) => c.content)
  const embeddings = await getEmbeddings(contents)

  // ドキュメントを作成
  const documents: VectorDocument[] = chunks.map((chunk, index) => ({
    id: `${chunk.metadata.pageId}_${chunk.metadata.chunkIndex}`,
    pageId: chunk.metadata.pageId,
    pageTitle: chunk.metadata.pageTitle,
    content: chunk.content,
    chunkIndex: chunk.metadata.chunkIndex,
    totalChunks: chunk.metadata.totalChunks,
    vector: embeddings[index],
    createdAt: new Date().toISOString(),
    lastEditedTime: chunk.metadata.lastEditedTime
  }))

  await table.add(documents)
}

/**
 * ページのチャンクを削除
 */
export async function deletePageChunks(pageId: string): Promise<void> {
  const db = await getDatabase()
  const tableNames = await db.tableNames()

  if (!tableNames.includes(TABLE_NAME)) return

  const table = await db.openTable<VectorDocument>(TABLE_NAME)
  // カラム名をダブルクォートで囲んで大文字小文字を維持
  await table.delete(`"pageId" = '${pageId}'`)
}

/**
 * 類似度検索
 */
export async function searchSimilar(
  query: string,
  options?: {
    limit?: number
    minScore?: number
  }
): Promise<SearchResult[]> {
  const { limit = 5, minScore = 0.5 } = options || {}

  const db = await getDatabase()
  const tableNames = await db.tableNames()

  if (!tableNames.includes(TABLE_NAME)) {
    return []
  }

  const table = await db.openTable<VectorDocument>(TABLE_NAME)

  // クエリのEmbeddingを取得
  const queryVector = await getEmbedding(query)

  // ベクトル検索
  const results = await table.vectorSearch(queryVector).limit(limit).toArray()

  // スコアでフィルタリングしてマッピング
  return results
    .filter((r) => {
      // LanceDBの距離をスコアに変換（距離が小さいほどスコアが高い）
      const score = 1 / (1 + (r._distance || 0))
      return score >= minScore
    })
    .map((r) => ({
      document: {
        id: r.id,
        pageId: r.pageId,
        pageTitle: r.pageTitle,
        content: r.content,
        chunkIndex: r.chunkIndex,
        totalChunks: r.totalChunks,
        vector: r.vector,
        createdAt: r.createdAt,
        lastEditedTime: r.lastEditedTime
      },
      score: 1 / (1 + (r._distance || 0))
    }))
}

/**
 * 全ドキュメント数を取得
 */
export async function getDocumentCount(): Promise<number> {
  const db = await getDatabase()
  const tableNames = await db.tableNames()

  if (!tableNames.includes(TABLE_NAME)) {
    return 0
  }

  const table = await db.openTable<VectorDocument>(TABLE_NAME)
  return table.countRows()
}

/**
 * インデックス済みのページID一覧を取得
 */
export async function getIndexedPageIds(): Promise<string[]> {
  const db = await getDatabase()
  const tableNames = await db.tableNames()

  if (!tableNames.includes(TABLE_NAME)) {
    return []
  }

  const table = await db.openTable<VectorDocument>(TABLE_NAME)
  const results = await table.query().select(['pageId']).toArray()

  // ユニークなページIDを返す
  return [...new Set(results.map((r) => r.pageId))]
}

/**
 * 特定のページの最終更新時刻を取得
 */
export async function getPageLastEditedTime(pageId: string): Promise<string | null> {
  const db = await getDatabase()
  const tableNames = await db.tableNames()

  if (!tableNames.includes(TABLE_NAME)) {
    return null
  }

  const table = await db.openTable<VectorDocument>(TABLE_NAME)
  const results = await table
    .query()
    .where(`"pageId" = '${pageId}'`)
    .select(['lastEditedTime'])
    .limit(1)
    .toArray()

  if (results.length === 0) {
    return null
  }

  return results[0].lastEditedTime
}
