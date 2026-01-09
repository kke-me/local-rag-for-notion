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
 * ページIDからページの全テキストコンテンツを取得
 */
export async function getPageContent(pageId: string): Promise<string> {
  const blocks = await getPageBlocks(pageId)
  return extractTextFromBlocks(blocks)
}

/**
 * ページの子ページIDを取得
 */
export async function getChildPageIds(pageId: string): Promise<string[]> {
  const blocks = await getPageBlocks(pageId)
  const childPageIds: string[] = []

  console.log(`\n=== Analyzing blocks for page ${pageId} ===`)
  console.log(`Total blocks: ${blocks.length}`)

  for (const block of blocks) {
    console.log(`Block type: ${block.type}, ID: ${block.id}`)

    // child_page タイプのブロックを探す
    if (block.type === 'child_page') {
      console.log(`  -> Found child_page: ${block.id}`)
      childPageIds.push(block.id)
    }
    // child_database タイプのブロックを探す
    else if (block.type === 'child_database') {
      console.log(`  -> Found child_database: ${block.id}`)
      // データベース内のページを取得
      try {
        const dbPages = await getDatabasePages(block.id)
        console.log(`     -> Database contains ${dbPages.length} pages`)
        childPageIds.push(...dbPages.map((p) => p.id))
      } catch (error) {
        console.warn(
          `     -> Failed to get database pages: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }
    // link_to_page タイプのブロックを探す
    else if (block.type === 'link_to_page' && 'link_to_page' in block) {
      const linkData = block.link_to_page as { type: string; page_id?: string }
      if (linkData.type === 'page_id' && linkData.page_id) {
        console.log(`  -> Found link_to_page: ${linkData.page_id}`)
        childPageIds.push(linkData.page_id)
      }
    }
  }

  console.log(`Found ${childPageIds.length} child pages`)
  console.log(`=== End analysis ===\n`)

  return childPageIds
}

/**
 * ページとその配下の全ての子ページを再帰的に取得
 */
export async function getAllPageIds(pageId: string): Promise<string[]> {
  const pageIds: string[] = [pageId]
  const childPageIds = await getChildPageIds(pageId)

  for (const childId of childPageIds) {
    try {
      const descendantIds = await getAllPageIds(childId)
      pageIds.push(...descendantIds)
    } catch (error) {
      console.warn(`Failed to get child pages for ${childId}:`, error)
      // アクセス権がない場合もあるので、エラーをログに残して続行
    }
  }

  return pageIds
}
