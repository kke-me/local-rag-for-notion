import { generateText, lmStudio } from './lm-studio'
import { searchSimilar } from './vector-store'
import type { SearchResult } from './vector-store'
import type OpenAI from 'openai'

/**
 * RAGクエリの結果
 */
export interface RagQueryResult {
  answer: string
  sources: Array<{
    pageId: string
    pageTitle: string
    content: string
    score: number
  }>
  query: string
}

/**
 * RAGシステムプロンプト
 * 参考: https://developer.mamezou-tech.com/blogs/2025/10/14/local_rag_on_lm_studio/
 * 「教科書を見ながらテスト問題を解く」アプローチを採用
 */
const RAG_SYSTEM_PROMPT = `You are an assistant that responds in Japanese. You reference Japanese documents from Notion to answer questions.

【最重要ルール - CRITICAL RULES】
★ YOU MUST ALWAYS respond in Japanese (日本語). NEVER use Chinese (中文), English, or any other language.
★ 絶対に中国語（中文）で回答しないでください。必ず日本語で回答してください。
★ If you start writing in Chinese, STOP immediately and rewrite in Japanese.

【その他のルール】
1. 回答は必ず「コンテキスト情報」に記載されている内容のみを使用してください
2. コンテキストに含まれていない情報については、推測や一般知識で補わないでください
3. 情報が見つからない場合は「提供されたドキュメントにその情報は含まれていませんでした」と正直に回答してください
4. 回答は簡潔かつ正確に行ってください
5. 可能であれば、どのソースから情報を得たかを示してください

Remember: ALWAYS respond in Japanese (日本語), never in Chinese (中文).`

/**
 * コンテキストを構築
 * 記事の「参考にした文章」の表示方法を参考に、ソース情報を明確に構造化
 */
function buildContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return '【注意】関連する情報がドキュメント内に見つかりませんでした。この質問に対して回答できる情報がありません。'
  }

  const contextParts = results.map((r, i) => {
    const relevancePercent = Math.round(r.score * 100)
    return `[ソース${i + 1}: ${r.document.pageTitle}] (関連度: ${relevancePercent}%)
${r.document.content}`
  })

  return contextParts.join('\n\n---\n\n')
}

/**
 * RAGクエリを実行
 */
export async function ragQuery(
  query: string,
  options?: {
    maxSources?: number
    minScore?: number
    maxTokens?: number
    temperature?: number
  }
): Promise<RagQueryResult> {
  const { maxSources = 5, minScore = 0.3, maxTokens = 1024, temperature = 0.3 } = options || {}

  // 類似度検索でコンテキストを取得
  const searchResults = await searchSimilar(query, {
    limit: maxSources,
    minScore
  })

  // コンテキストを構築
  const context = buildContext(searchResults)

  // プロンプトを構築
  const prompt = `## コンテキスト情報
${context}

## 質問
${query}

## 回答`

  // LLMで回答を生成
  const answer = await generateText(prompt, {
    systemPrompt: RAG_SYSTEM_PROMPT,
    maxTokens,
    temperature
  })

  return {
    answer,
    sources: searchResults.map((r) => ({
      pageId: r.document.pageId,
      pageTitle: r.document.pageTitle,
      content: r.document.content,
      score: r.score
    })),
    query
  }
}

/**
 * 類似ドキュメントのみを検索（LLM回答なし）
 */
export async function searchDocuments(
  query: string,
  options?: {
    limit?: number
    minScore?: number
  }
): Promise<
  Array<{
    pageId: string
    pageTitle: string
    content: string
    score: number
  }>
> {
  const { limit = 10, minScore = 0.3 } = options || {}

  const results = await searchSimilar(query, { limit, minScore })

  return results.map((r) => ({
    pageId: r.document.pageId,
    pageTitle: r.document.pageTitle,
    content: r.document.content,
    score: r.score
  }))
}

/**
 * チャットメッセージの型
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * チャットRAGの結果
 */
export interface ChatRagResult {
  answer: string
  sources: Array<{
    pageId: string
    pageTitle: string
    content: string
    score: number
  }>
}

/**
 * チャット用システムプロンプト
 * 参考: https://developer.mamezou-tech.com/blogs/2025/10/14/local_rag_on_lm_studio/
 */
const CHAT_SYSTEM_PROMPT = `You are a helpful assistant that responds in Japanese. You reference Japanese documents from Notion to answer questions.

【最重要ルール - CRITICAL RULES】
★ YOU MUST ALWAYS respond in Japanese (日本語). NEVER use Chinese, English, or any other language.
★ Even if the question is in Japanese, your answer MUST be in Japanese.
★ 絶対に中国語（中文）で回答しないでください。必ず日本語で回答してください。
★ If you find yourself starting to write in Chinese, STOP immediately and switch to Japanese.

【その他のルール - Additional Rules】
1. 回答は必ず「コンテキスト情報」に記載されている内容のみを使用してください
2. コンテキストに含まれていない情報については、推測や一般知識で補わないでください
3. 情報が見つからない場合は「提供されたドキュメントにその情報は含まれていませんでした」と正直に回答してください
4. 回答は簡潔かつ正確に行ってください
5. 会話の流れを考慮して、自然な対話を心がけてください
6. 前の会話を参照する場合は、その内容を踏まえて回答してください
7. 可能であれば、どのソースから情報を得たかを示してください

Remember: ALWAYS respond in Japanese (日本語), never in Chinese (中文) or English.`

/**
 * 会話履歴付きRAGチャット
 */
export async function chatWithRag(
  message: string,
  history: ChatMessage[],
  options?: {
    maxSources?: number
    minScore?: number
    maxTokens?: number
    temperature?: number
  }
): Promise<ChatRagResult> {
  const { maxSources = 5, minScore = 0.2, maxTokens = 1024, temperature = 0.5 } = options || {}

  // 類似度検索でコンテキストを取得
  const searchResults = await searchSimilar(message, {
    limit: maxSources,
    minScore
  })

  // コンテキストを構築
  const context = buildContext(searchResults)

  // メッセージ配列を構築
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `## 参照可能なコンテキスト情報\n${context}`
    }
  ]

  // 会話履歴を追加
  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content
    })
  }

  // 現在のメッセージを追加（日本語での回答を明示的に要求）
  messages.push({
    role: 'user',
    content: `${message}\n\n（注意：必ず日本語で回答してください。中国語や英語は使わないでください）`
  })

  // LLMで回答を生成
  const response = await lmStudio.chat.completions.create({
    model: process.env.LM_STUDIO_MODEL || 'local-model',
    messages,
    max_tokens: maxTokens,
    temperature
  })

  const answer = response.choices[0]?.message?.content || ''

  return {
    answer,
    sources: searchResults.map((r) => ({
      pageId: r.document.pageId,
      pageTitle: r.document.pageTitle,
      content: r.document.content,
      score: r.score
    }))
  }
}
