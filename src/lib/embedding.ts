/**
 * Ruri-v3 日本語特化エンベディングモデル
 * 名古屋大学 笹野研究室が開発した高性能な日本語エンベディングモデル
 *
 * 特徴:
 * - JMTEBベンチマークで高スコア (平均74.51, 検索82.48)
 * - 最大8,192トークン対応
 * - 100,000語彙
 * - 日本語に最適化
 */

import { pipeline, env } from '@xenova/transformers'

// モデルのキャッシュディレクトリを設定
env.cacheDir = './.cache/transformers'

// Ruri-v3モデル (310Mパラメータ版) - ONNX変換版を使用
const MODEL_NAME = 'sirasagi62/ruri-v3-310m-ONNX'

// パイプラインのキャッシュ
let embeddingPipeline: Awaited<ReturnType<typeof pipeline>> | null = null

/**
 * エンベディングパイプラインを取得（初回は初期化）
 */
async function getEmbeddingPipeline(): Promise<Awaited<ReturnType<typeof pipeline>>> {
  if (!embeddingPipeline) {
    console.log(`Loading embedding model: ${MODEL_NAME}`)
    console.log('This may take a few minutes on first run...')

    embeddingPipeline = await pipeline('feature-extraction', MODEL_NAME, {
      // 量子化モデルを使用（軽量・高速）
      quantized: true
    })

    console.log('Embedding model loaded successfully!')
  }

  return embeddingPipeline
}

/**
 * テキストのEmbeddingを取得（単一）
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline()

  // Ruri-v3の推奨プレフィックス: 検索クエリには "クエリ: " を付ける
  const prefixedText = `クエリ: ${text}`

  const output = await extractor(prefixedText, {
    pooling: 'mean',
    normalize: true
  })

  // Float32Arrayを通常の配列に変換
  return Array.from(output.data as Float32Array)
}

/**
 * テキストのEmbeddingを取得（バッチ）
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const extractor = await getEmbeddingPipeline()

  const BATCH_SIZE = 8 // Ruri-v3用のバッチサイズ

  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    console.log(
      `  Generating embeddings for batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} texts)`
    )

    // Ruri-v3の推奨プレフィックス: ドキュメントには "文章: " を付ける
    const prefixedBatch = batch.map((text) => `文章: ${text}`)

    // バッチ処理
    const outputs = await Promise.all(
      prefixedBatch.map((text) =>
        extractor(text, {
          pooling: 'mean',
          normalize: true
        })
      )
    )

    for (const output of outputs) {
      allEmbeddings.push(Array.from(output.data as Float32Array))
    }
  }

  return allEmbeddings
}

/**
 * Embeddingの次元数を取得
 */
export async function getEmbeddingDimension(): Promise<number> {
  const testEmbedding = await getEmbedding('test')
  return testEmbedding.length
}

/**
 * モデル情報を取得
 */
export function getModelInfo(): { name: string; description: string } {
  return {
    name: MODEL_NAME,
    description: '名古屋大学 Ruri-v3 日本語特化エンベディングモデル (310M ONNX版)'
  }
}
