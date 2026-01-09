import { Geist, Geist_Mono } from 'next/font/google'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import StyledComponentsRegistry from '@/lib/registry'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: 'Local RAG for Notion',
  description: 'Notionページをローカルで解析するRAGアプリケーション'
}

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode
}>): ReactNode {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
      </body>
    </html>
  )
}
