import OpenAI from 'openai'

/**
 * LM Studio クライアント（OpenAI互換API）
 */
export const lmStudio = new OpenAI({
  baseURL: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1',
  apiKey: process.env.LM_STUDIO_API_KEY || 'lm-studio'
})

/**
 * 使用するEmbeddingモデル
 */
const EMBEDDING_MODEL = process.env.LM_STUDIO_EMBEDDING_MODEL || 'nomic-ai/nomic-embed-text-v1.5'

/**
 * LM Studioの接続確認
 */
export async function checkLmStudioConnection(): Promise<boolean> {
  try {
    const models = await lmStudio.models.list()
    console.log(
      'LM Studio models:',
      models.data.map((m) => m.id)
    )
    return true
  } catch (error) {
    console.error('LM Studio connection failed:', error)
    return false
  }
}

/**
 * テキストのEmbeddingを取得（単一）
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const response = await lmStudio.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  })

  return response.data[0].embedding
}

/**
 * テキストのEmbeddingを取得（バッチ）
 * 大量のテキストを効率的に処理するため、バッチサイズを制限
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 20 // 一度に処理する最大数（10 → 20に増加）
  const results: number[][] = []

  // バッチ処理
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    console.log(
      `  Generating embeddings for batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} texts)`
    )

    const response = await lmStudio.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch
    })

    results.push(...response.data.map((item) => item.embedding))
  }

  return results
}

/**
 * Embeddingの次元数を取得
 */
export async function getEmbeddingDimension(): Promise<number> {
  const testEmbedding = await getEmbedding('test')
  return testEmbedding.length
}

/**
 * LM Studioでテキスト生成
 */
export async function generateText(
  prompt: string,
  options?: {
    systemPrompt?: string
    maxTokens?: number
    temperature?: number
  }
): Promise<string> {
  const { systemPrompt, maxTokens = 1024, temperature = 0.7 } = options || {}

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    })
  }

  messages.push({
    role: 'user',
    content: prompt
  })

  const response = await lmStudio.chat.completions.create({
    model: process.env.LM_STUDIO_MODEL || 'local-model',
    messages,
    max_tokens: maxTokens,
    temperature
  })

  return response.choices[0]?.message?.content || ''
}
