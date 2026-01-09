# Local RAG for Notion

LM Studio（ローカルLLM）を使用してNotionページを解析するRAGアプリケーション。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **スタイリング**: Tailwind CSS
- **LLM**: LM Studio (OpenAI互換API)
- **データソース**: Notion API
- **出力形式**: SSG（静的サイト生成）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local.example` を参考に `.env.local` を作成：

```bash
cp .env.local.example .env.local
```

以下の値を設定：

```env
# Notion API
NOTION_API_KEY=secret_xxxxx  # Notion Integrationから取得
NOTION_DATABASE_ID=xxxxx     # 対象のデータベースID

# LM Studio
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_API_KEY=lm-studio
LM_STUDIO_MODEL=local-model
```

### 3. LM Studioの準備

1. [LM Studio](https://lmstudio.ai/) をダウンロード・インストール
2. 使用したいモデルをダウンロード（推奨: Llama 3, Mistral等）
3. モデルをロードし、「Local Server」タブでサーバーを起動
4. デフォルトでは `http://localhost:1234` で起動

### 4. Notion APIの設定

1. [Notion Developers](https://developers.notion.com/) でIntegrationを作成
2. 対象のデータベースにIntegrationを接続
3. API KeyとDatabase IDを `.env.local` に設定

## 開発

```bash
# 開発サーバー起動
npm run dev

# ビルド（静的サイト生成）
npm run build

# 静的ファイルのプレビュー
npx serve out
```

## ディレクトリ構造

```
src/
├── app/                 # Next.js App Router
│   ├── layout.tsx       # ルートレイアウト
│   └── page.tsx         # トップページ
├── lib/                 # ユーティリティ
│   ├── lm-studio.ts     # LM Studioクライアント
│   └── notion.ts        # Notion APIクライアント
└── types/               # 型定義
    └── index.ts
```

## ライセンス

MIT
