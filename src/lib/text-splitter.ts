import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

/**
 * テキスト分割の設定
 */
const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_CHUNK_OVERLAP = 200

/**
 * テキストスプリッターのインスタンスを作成
 */
export function createTextSplitter(options?: {
  chunkSize?: number
  chunkOverlap?: number
}): RecursiveCharacterTextSplitter {
  const { chunkSize = DEFAULT_CHUNK_SIZE, chunkOverlap = DEFAULT_CHUNK_OVERLAP } = options || {}

  return new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ['\n\n', '\n', '。', '、', ' ', '']
  })
}

/**
 * テキストをチャンクに分割
 */
export async function splitText(
  text: string,
  options?: {
    chunkSize?: number
    chunkOverlap?: number
  }
): Promise<string[]> {
  const splitter = createTextSplitter(options)
  const docs = await splitter.createDocuments([text])
  return docs.map((doc) => doc.pageContent)
}

/**
 * メタデータ付きでテキストを分割
 */
export interface ChunkWithMetadata {
  content: string
  metadata: {
    pageId: string
    pageTitle: string
    chunkIndex: number
    totalChunks: number
    lastEditedTime: string
  }
}

export async function splitTextWithMetadata(
  text: string,
  pageId: string,
  pageTitle: string,
  lastEditedTime: string,
  options?: {
    chunkSize?: number
    chunkOverlap?: number
  }
): Promise<ChunkWithMetadata[]> {
  const chunks = await splitText(text, options)

  return chunks.map((content, index) => ({
    content,
    metadata: {
      pageId,
      pageTitle,
      chunkIndex: index,
      totalChunks: chunks.length,
      lastEditedTime
    }
  }))
}
