import path from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'
import eslint from '@eslint/js'
import typeScriptESLintParser from '@typescript-eslint/parser'
import eslintConfigPrettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// FlatConfig に対応していない Plugin の対応
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname
})

export default tseslint.config(
  {
    name: 'local-rag/ignore-global',
    ignores: ['**/node_modules/**', '**/.vscode/**', '**/out/**', '**/.next/**']
  },
  {
    name: 'local-rag/load-plugins',
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      },
      parser: typeScriptESLintParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2021
      },
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      importX
    }
  },
  {
    name: 'local-rag/tunning-global',
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      compat.extends('plugin:@typescript-eslint/eslint-recommended')
    ],
    rules: {
      /* 真偽 */
      // 厳密等価演算子を使う
      eqeqeq: 'error',
      // オブジェクトのプロパティにアクセスする場合はドットを使用
      'dot-notation': 'error',
      /* その他 */
      // 三項演算子の入れ子を禁止
      'no-nested-ternary': 'error',
      /* TypeScriptに関する記述 */
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'error',
      /* 足しておくといい感じになりそうなプロパティ */
      'importX/no-duplicates': 'error', // 同じファイルからのインポートを複数行に分けて書いている場合にエラー
      'importX/order': [
        'error',
        {
          groups: [
            'builtin', // 組み込みモジュール
            'external', // npm でインストールした外部ライブラリ
            'internal', // 自作モジュール
            ['parent', 'sibling'],
            'object',
            'type',
            'index'
          ],
          'newlines-between': 'never', // グループ毎に改行を入れるか
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: {
            order: 'asc', // 昇順にソート
            caseInsensitive: true // 小文字大文字を区別しない
          }
        }
      ]
    }
  },
  {
    name: 'eslint-config-prettier',
    ...eslintConfigPrettier
  }
)
