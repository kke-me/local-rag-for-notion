import { generateText, lmStudio } from './lm-studio'
import { searchSimilar } from './vector-store'
import type { SearchResult } from './vector-store'
import type OpenAI from 'openai'
import {
  RAG_QUERY_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  NO_CONTEXT_MESSAGE,
  promptHelpers
} from '@/prompts/system-prompts'

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
 * コンテキストを構築
 * 記事の「参考にした文章」の表示方法を参考に、ソース情報を明確に構造化
 */
function buildContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return NO_CONTEXT_MESSAGE
  }

  const contextParts = results.map((r, i) => {
    const relevancePercent = Math.round(r.score * 100)
    return `[ソース${i + 1}: ${r.document.pageTitle}] (関連度: ${relevancePercent}%)\n${r.document.content}`
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
  const prompt = promptHelpers.createRAGQueryPrompt(context, query)

  // LLMで回答を生成
  const answer = await generateText(prompt, {
    systemPrompt: RAG_QUERY_SYSTEM_PROMPT,
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
  const { maxSources = 5, minScore = 0.2, maxTokens = 1024, temperature = 0.3 } = options || {}

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
      content: promptHelpers.createContextSystemMessage(context)
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
    content: promptHelpers.createUserMessageWithReminder(message)
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
