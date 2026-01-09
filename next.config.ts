import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // サーバーモード（RAG APIを使用するため）
  // SSGが必要な場合は個別のページで `export const dynamic = 'force-static'` を使用

  // Styled-components
  compiler: {
    styledComponents: true
  },

  // サーバーコンポーネントで使用する外部パッケージ
  serverExternalPackages: ['@lancedb/lancedb', 'apache-arrow']
}

export default nextConfig
