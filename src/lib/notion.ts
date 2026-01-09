import { Client } from '@notionhq/client'
import type {
  PageObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse
} from '@notionhq/client/build/src/api-endpoints'

/**
 * Notion クライアント
 */
export const notion = new Client({
  auth: process.env.NOTION_API_KEY
})

/**
 * データベースからページ一覧を取得
 */
export async function getDatabasePages(databaseId?: string): Promise<PageObjectResponse[]> {
  const dbId = databaseId || process.env.NOTION_DATABASE_ID

  if (!dbId) {
    throw new Error('Database ID is required')
  }

  const pages: PageObjectResponse[] = []
  let cursor: string | undefined

  do {
    const response = await notion.databases.query({
      database_id: dbId,
      start_cursor: cursor
    })

    pages.push(
      ...response.results.filter((page): page is PageObjectResponse => 'properties' in page)
    )

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
  } while (cursor)

  return pages
}

/**
 * ページの詳細を取得
 */
export async function getPage(pageId: string): Promise<PageObjectResponse> {
  const response = await notion.pages.retrieve({
    page_id: pageId
  })

  if (!('properties' in response)) {
    throw new Error('Invalid page response')
  }

  return response
}

/**
 * ページのブロック（コンテンツ）を取得
 */
export async function getPageBlocks(pageId: string): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = []
  let cursor: string | undefined

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor
    })

    blocks.push(
      ...response.results.filter((block): block is BlockObjectResponse => 'type' in block)
    )

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
  } while (cursor)

  return blocks
}

/**
 * ブロックからプレーンテキストを抽出
 */
export function extractTextFromBlocks(blocks: BlockObjectResponse[]): string {
  return blocks
    .map((block) => {
      const blockType = block.type
      const blockData = block[blockType as keyof typeof block]

      if (blockData && typeof blockData === 'object' && 'rich_text' in blockData) {
        const richText = blockData.rich_text as RichTextItemResponse[]
        return richText.map((rt) => rt.plain_text).join('')
      }

      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * 子データベースのコンテンツを効率的に取得
 * databases.queryのレスポンスから直接プロパティを抽出（追加API呼び出し不要）
 */
export async function getChildDatabaseContent(databaseId: string): Promise<string> {
  const textParts: string[] = []

  try {
    // databases.queryは一度の呼び出しで全ページのプロパティを含むレスポンスを返す
    // ページネーションのみでOK、追加のpages.retrieve不要
    let cursor: string | undefined

    do {
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100 // 最大値を使用してAPI呼び出し回数を削減
      })

      for (const page of response.results) {
        if (!('properties' in page)) continue

        const rowTexts: string[] = []

        for (const [key, prop] of Object.entries(page.properties)) {
          let value = ''

          switch (prop.type) {
            case 'title':
              value = prop.title.map((t: { plain_text: string }) => t.plain_text).join('')
              break
            case 'rich_text':
              value = prop.rich_text.map((t: { plain_text: string }) => t.plain_text).join('')
              break
            case 'select':
              value = prop.select?.name || ''
              break
            case 'multi_select':
              value = prop.multi_select.map((s: { name: string }) => s.name).join(', ')
              break
            case 'number':
              value = prop.number?.toString() || ''
              break
          }

          if (value) {
            // キーが意味のある場合のみ追加（titleやリンクは除外）
            if (key !== 'リンク' && key !== 'title' && prop.type !== 'title') {
              rowTexts.push(`[${key}] ${value}`)
            } else if (value && prop.type === 'title') {
              rowTexts.unshift(value) // タイトルは先頭に
            }
          }
        }

        if (rowTexts.length > 0) {
          textParts.push(rowTexts.join(' '))
        }
      }

      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
    } while (cursor)
  } catch (error) {
    console.warn(`Failed to get child database content for ${databaseId}:`, error)
  }

  return textParts.join('\n')
}

/**
 * ページのプロパティからテキストを抽出
 * テーブルビュー（データベース）のページにも対応
 */
export function extractTextFromProperties(page: PageObjectResponse): string {
  const textParts: string[] = []
  let titleValue = ''

  for (const [key, prop] of Object.entries(page.properties)) {
    let value = ''

    switch (prop.type) {
      case 'title':
        // タイトルは特別扱い（先頭に配置）
        titleValue = prop.title.map((t) => t.plain_text).join('')
        break
      case 'rich_text':
        // rich_textはテーブルビューのメインコンテンツになることが多い
        value = prop.rich_text.map((t) => t.plain_text).join('')
        break
      case 'select':
        value = prop.select?.name || ''
        break
      case 'multi_select':
        value = prop.multi_select.map((s) => s.name).join(', ')
        break
      case 'number':
        value = prop.number?.toString() || ''
        break
      case 'date':
        value = prop.date?.start || ''
        if (prop.date?.end) {
          value += ` ~ ${prop.date.end}`
        }
        break
      case 'url':
        value = prop.url || ''
        break
      case 'email':
        value = prop.email || ''
        break
      case 'phone_number':
        value = prop.phone_number || ''
        break
      case 'checkbox':
        value = prop.checkbox ? 'はい' : 'いいえ'
        break
      case 'status':
        value = (prop.status as { name?: string })?.name || ''
        break
      case 'people':
        value = (prop.people as Array<{ name?: string }>)
          .map((p) => p.name || '')
          .filter(Boolean)
          .join(', ')
        break
      case 'files':
        value = (prop.files as Array<{ name?: string }>)
          .map((f) => f.name || '')
          .filter(Boolean)
          .join(', ')
        break
      case 'relation':
        // relationは関連ページのIDのみなので、数だけ表示
        value = `${(prop.relation as Array<{ id: string }>).length}件の関連`
        break
      case 'rollup':
        // rollupは集計結果
        const rollup = prop.rollup as { type: string; number?: number; array?: unknown[] }
        if (rollup.type === 'number' && rollup.number !== undefined) {
          value = rollup.number.toString()
        } else if (rollup.type === 'array' && rollup.array) {
          value = `${rollup.array.length}件`
        }
        break
      case 'formula':
        // formulaは計算結果
        const formula = prop.formula as {
          type: string
          string?: string
          number?: number
          boolean?: boolean
          date?: { start: string }
        }
        if (formula.type === 'string' && formula.string) {
          value = formula.string
        } else if (formula.type === 'number' && formula.number !== undefined) {
          value = formula.number.toString()
        } else if (formula.type === 'boolean') {
          value = formula.boolean ? 'はい' : 'いいえ'
        } else if (formula.type === 'date' && formula.date?.start) {
          value = formula.date.start
        }
        break
      default:
        // その他のプロパティタイプはスキップ
        break
    }

    // 値がある場合のみ追加（タイトル以外）
    if (value && prop.type !== 'title') {
      textParts.push(`${key}: ${value}`)
    }
  }

  // タイトルを先頭に配置
  if (titleValue) {
    return `タイトル: ${titleValue}\n${textParts.join('\n')}`
  }

  return textParts.join('\n')
}

/**
 * ページIDからページの全テキストコンテンツを取得
 * ブロック、プロパティ、子データベースすべてからコンテンツを取得
 */
export async function getPageContent(pageId: string): Promise<string> {
  const contentParts: string[] = []

  // 1. プロパティからコンテンツを取得（テーブルビュー対応）
  try {
    const page = await getPage(pageId)
    const propertyContent = extractTextFromProperties(page)
    if (propertyContent.trim()) {
      contentParts.push(propertyContent)
    }
  } catch (error) {
    console.warn(`Failed to get page properties for ${pageId}:`, error)
  }

  // 2. ブロックを取得
  try {
    const blocks = await getPageBlocks(pageId)

    // 2a. 通常のテキストブロックからコンテンツを取得
    const blockContent = extractTextFromBlocks(blocks)
    if (blockContent.trim()) {
      contentParts.push(blockContent)
    }

    // 2b. 子データベース（テーブルビュー）のコンテンツを取得
    for (const block of blocks) {
      if (block.type === 'child_database') {
        const dbContent = await getChildDatabaseContent(block.id)
        if (dbContent.trim()) {
          contentParts.push(dbContent)
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to get page blocks for ${pageId}:`, error)
  }

  return contentParts.join('\n\n')
}

/**
 * ページの子ページIDを取得（ログを最小限に）
 */
export async function getChildPageIds(pageId: string): Promise<string[]> {
  const blocks = await getPageBlocks(pageId)
  const childPageIds: string[] = []

  for (const block of blocks) {
    // child_page タイプのブロックを探す
    if (block.type === 'child_page') {
      childPageIds.push(block.id)
    }
    // child_database タイプのブロックを探す
    else if (block.type === 'child_database') {
      console.log(`Found database: ${block.id}`)
      // データベース内のページを取得
      try {
        const dbPages = await getDatabasePages(block.id)
        console.log(`  -> ${dbPages.length} pages`)
        childPageIds.push(...dbPages.map((p) => p.id))
      } catch (error) {
        console.warn(`  -> Failed: ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }
    // link_to_page タイプのブロックを探す
    else if (block.type === 'link_to_page' && 'link_to_page' in block) {
      const linkData = block.link_to_page as { type: string; page_id?: string }
      if (linkData.type === 'page_id' && linkData.page_id) {
        childPageIds.push(linkData.page_id)
      }
    }
  }

  return childPageIds
}

/**
 * ページとその配下の子ページを取得（再帰の深さを制限）
 * @param pageId ページID
 * @param maxDepth 最大再帰深さ（デフォルト1）
 * @param currentDepth 現在の深さ
 */
export async function getAllPageIds(
  pageId: string,
  maxDepth: number = 1,
  currentDepth: number = 0
): Promise<string[]> {
  const pageIds: string[] = [pageId]

  // 最大深さに達したら子ページを探索しない
  if (currentDepth >= maxDepth) {
    return pageIds
  }

  try {
    const childPageIds = await getChildPageIds(pageId)

    for (const childId of childPageIds) {
      try {
        // データベースのページは子ページを持たないので再帰しない
        pageIds.push(childId)
      } catch (error) {
        console.warn(`Failed to get child pages for ${childId}:`, error)
      }
    }
  } catch (error) {
    console.warn(`Failed to get child pages for ${pageId}:`, error)
  }

  return pageIds
}
