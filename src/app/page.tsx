'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import styled, { keyframes } from 'styled-components'
import type { ReactNode, FormEvent, KeyboardEvent } from 'react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{
    pageTitle: string
    content: string
    score: number
  }>
}

interface IndexStatus {
  documentCount: number
  indexedPageIds: string[]
}

interface IndexProgress {
  current: number
  total: number
  currentPageTitle?: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

const PageWrapper = styled.div`
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
`

const Header = styled.header`
  border-bottom: 1px solid var(--border-color);
  padding: 1.25rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
`

const GradientText = styled.span`
  background: linear-gradient(90deg, var(--accent-purple), var(--accent-pink));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 1.25rem;
`

const StatusBadge = styled.div<{ $ready: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${({ $ready }): string => ($ready ? '#4ade80' : '#fbbf24')};
  padding: 0.5rem 1rem;
  border-radius: 1rem;
  background: ${({ $ready }): string =>
    $ready ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)'};
  border: 1px solid currentColor;

  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
`

const Main = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  padding: 1.5rem;
`

const ChatContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding-bottom: 1rem;

  /* カスタムスクロールバー */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }

  /* Firefox用 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
`

const MessageGroup = styled.div<{ $isUser: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: ${({ $isUser }): string => ($isUser ? 'flex-end' : 'flex-start')};
  gap: 0.5rem;
`

const MessageBubble = styled.div<{ $isUser: boolean }>`
  max-width: 80%;
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: ${({ $isUser }): string =>
    $isUser
      ? 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))'
      : 'var(--card-bg)'};
  border: ${({ $isUser }): string => ($isUser ? 'none' : '1px solid var(--border-color)')};
  color: white;
  white-space: pre-wrap;
  line-height: 1.6;
`

const SourcesContainer = styled.div`
  max-width: 80%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const SourceCard = styled.details`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  font-size: 0.75rem;

  summary {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.5rem;

    &:hover {
      color: white;
    }

    &::-webkit-details-marker {
      display: none;
    }

    &::before {
      content: '▶';
      font-size: 0.6rem;
      transition: transform 0.2s;
    }
  }

  &[open] summary::before {
    transform: rotate(90deg);
  }
`

/**
 * スコアに応じた色を返す関数（三項演算子のネストを回避）
 */
function getScoreColor(score: number): string {
  if (score >= 0.7) return '#4ade80' // 緑: 高関連度
  if (score >= 0.4) return '#fbbf24' // 黄: 中関連度
  return '#f87171' // 赤: 低関連度
}

/**
 * スコアバー - 参考文献の関連度を視覚的に表示
 * 参考: https://developer.mamezou-tech.com/blogs/2025/10/14/local_rag_on_lm_studio/
 */
const ScoreBar = styled.div<{ $score: number }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;

  .bar-container {
    width: 50px;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    width: ${({ $score }): string => `${$score * 100}%`};
    background: ${({ $score }): string => getScoreColor($score)};
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .score-text {
    font-size: 0.65rem;
    min-width: 32px;
    text-align: right;
  }
`

const SourceContent = styled.div`
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--border-color);
  color: var(--text-muted);
  max-height: 150px;
  overflow-y: auto;

  /* カスタムスクロールバー */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;

    &:hover {
      background: rgba(255, 255, 255, 0.25);
    }
  }

  /* Firefox用 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
`

const InputContainer = styled.form`
  display: flex;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
`

const Input = styled.textarea`
  flex: 1;
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: white;
  font-size: 1rem;
  resize: none;
  min-height: 56px;
  max-height: 200px;
  font-family: inherit;
  overflow-y: auto;

  &::placeholder {
    color: var(--text-muted);
  }

  &:focus {
    outline: none;
    border-color: var(--accent-purple);
  }

  &:disabled {
    opacity: 0.5;
  }

  /* カスタムスクロールバー */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }

  /* Firefox用 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
`

const SendButton = styled.button`
  padding: 0 1.5rem;
  border-radius: 0.75rem;
  border: none;
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-pink));
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const AbortButton = styled.button`
  padding: 0 1.5rem;
  border-radius: 0.75rem;
  border: 1px solid #f87171;
  background: transparent;
  color: #f87171;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(248, 113, 113, 0.1);
  }
`

const SmallButton = styled.button`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    border-color: var(--accent-purple);
    color: white;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const SetupContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 2rem;
`

const SetupCard = styled.div`
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  padding: 2.5rem;
  max-width: 500px;
  width: 100%;
`

const SetupIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`

const SetupTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  margin-bottom: 0.5rem;
`

const SetupDescription = styled.p`
  color: var(--text-muted);
  margin-bottom: 1.5rem;
  line-height: 1.6;
`

const PrimaryButton = styled.button`
  padding: 1rem 2rem;
  border-radius: 0.75rem;
  border: none;
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-pink));
  color: white;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;

  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
  gap: 1rem;
`

const EmptyIcon = styled.div`
  font-size: 3rem;
  opacity: 0.5;
`

const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
`

const LoadingDots = styled.div`
  display: flex;
  gap: 0.25rem;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-purple);
    animation: ${pulse} 1.4s ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }
    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
`

const IndexInfo = styled.div`
  font-size: 0.875rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.75rem;
`

const IndexStats = styled.span`
  padding: 0.375rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.375rem;
`

const Toast = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  position: fixed;
  top: 2rem;
  right: 2rem;
  padding: 1rem 1.5rem;
  border-radius: 0.75rem;
  background: ${({ $type }): string => {
    switch ($type) {
      case 'success':
        return 'rgba(74, 222, 128, 0.95)'
      case 'error':
        return 'rgba(248, 113, 113, 0.95)'
      case 'info':
        return 'rgba(96, 165, 250, 0.95)'
    }
  }};
  color: white;
  font-weight: 600;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.3s ease-out;
  z-index: 1000;

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`

const IndexingOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  backdrop-filter: blur(4px);
`

const IndexingCard = styled.div`
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  padding: 2rem;
  min-width: 400px;
  text-align: center;
`

const IndexingTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin-bottom: 1rem;
`

const IndexingProgress = styled.div`
  margin: 1.5rem 0;
`

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.75rem;
`

const ProgressFill = styled.div<{ $progress: number }>`
  height: 100%;
  width: ${({ $progress }): number => $progress}%;
  background: linear-gradient(90deg, var(--accent-purple), var(--accent-pink));
  transition: width 0.3s ease;
`

const ProgressText = styled.p`
  color: var(--text-muted);
  font-size: 0.875rem;
  margin-top: 0.5rem;
`

const NOTION_PAGE_ID = '0fe9b33e3c0e4e469cd7bf4b9cc07f65'

export default function Home(): ReactNode {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null)
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null)
  const [isCheckingIndex, setIsCheckingIndex] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const toastIdRef = useRef(0)

  // インデックスが存在するかどうか
  const hasIndex = indexStatus && indexStatus.documentCount > 0

  // インデックスステータスを取得
  useEffect(() => {
    fetchIndexStatus()
  }, [])

  // メッセージが追加されたら、またはローディング状態が変わったら最下部にスクロール
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, isLoading])

  // スムーズスクロールを実行する関数
  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [])

  const fetchIndexStatus = async (): Promise<void> => {
    setIsCheckingIndex(true)
    try {
      const res = await fetch('/api/index')
      if (res.ok) {
        const data = await res.json()
        setIndexStatus(data)
      }
    } catch (e) {
      console.error('Failed to fetch index status:', e)
    } finally {
      setIsCheckingIndex(false)
    }
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info'): void => {
    const id = toastIdRef.current++
    setToasts((prev) => [...prev, { id, message, type }])

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  const handleCreateIndex = async (): Promise<void> => {
    setIsIndexing(true)
    setIndexProgress({ current: 0, total: 1 })
    showToast('インデックス作成を開始しています...', 'info')

    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: NOTION_PAGE_ID,
          forceReindex: false
        })
      })

      if (res.ok) {
        const result = await res.json()
        setIndexProgress(null)
        await fetchIndexStatus()
        showToast(
          `インデックス作成完了！${result.totalPages}ページ、${result.totalChunks}チャンクを追加しました`,
          'success'
        )
      } else {
        const error = await res.json()
        setIndexProgress(null)
        showToast(`エラー: ${error.error}`, 'error')
      }
    } catch (e) {
      console.error('Index error:', e)
      setIndexProgress(null)
      showToast('インデックス化に失敗しました', 'error')
    } finally {
      setIsIndexing(false)
    }
  }

  const handleForceReindex = async (): Promise<void> => {
    if (!confirm('既存のインデックスを削除して再構築しますか？')) {
      return
    }

    setIsIndexing(true)
    setIndexProgress({ current: 0, total: 1 })
    showToast('インデックスを再構築しています...', 'info')

    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: NOTION_PAGE_ID,
          forceReindex: true
        })
      })

      if (res.ok) {
        const result = await res.json()
        setIndexProgress(null)
        await fetchIndexStatus()
        showToast(
          `インデックス再構築完了！${result.totalPages}ページ、${result.totalChunks}チャンクを追加しました`,
          'success'
        )
      } else {
        const error = await res.json()
        setIndexProgress(null)
        showToast(`エラー: ${error.error}`, 'error')
      }
    } catch (e) {
      console.error('Index error:', e)
      setIndexProgress(null)
      showToast('インデックス化に失敗しました', 'error')
    } finally {
      setIsIndexing(false)
    }
  }

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    // 送信後すぐにスクロール
    setTimeout(() => scrollToBottom(), 100)

    abortControllerRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages
        }),
        signal: abortControllerRef.current.signal
      })

      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.answer,
            sources: data.sources
          }
        ])
      } else {
        const error = await res.json()
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `エラーが発生しました: ${error.error}`
          }
        ])
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '処理が中止されました。'
          }
        ])
      } else {
        console.error('Chat error:', e)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '通信エラーが発生しました。LM Studioが起動していることを確認してください。'
          }
        ])
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Cmd+Enter (Mac) または Ctrl+Enter (Windows) で送信
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  const handleAbort = (): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  // インデックス確認中の表示
  if (isCheckingIndex) {
    return (
      <PageWrapper>
        <Header>
          <Title>
            <GradientText>Local RAG</GradientText> for Notion
          </Title>
        </Header>
        <Main>
          <SetupContainer>
            <LoadingDots>
              <span />
              <span />
              <span />
            </LoadingDots>
            <p style={{ color: 'var(--text-muted)' }}>インデックス状態を確認中...</p>
          </SetupContainer>
        </Main>
      </PageWrapper>
    )
  }

  // インデックスが存在しない場合のセットアップ画面
  if (!hasIndex) {
    return (
      <PageWrapper>
        <Header>
          <Title>
            <GradientText>Local RAG</GradientText> for Notion
          </Title>
          <StatusBadge $ready={false}>セットアップが必要</StatusBadge>
        </Header>
        <Main>
          <SetupContainer>
            <SetupCard>
              <SetupIcon>📚</SetupIcon>
              <SetupTitle>インデックスを作成</SetupTitle>
              <SetupDescription>
                Notionのページをインデックス化して、RAGチャットを開始できます。
                <br />
                インデックスはローカルに保存され、次回以降は自動的に読み込まれます。
              </SetupDescription>
              <PrimaryButton onClick={handleCreateIndex} disabled={isIndexing}>
                {isIndexing ? 'インデックス作成中...' : 'インデックスを作成'}
              </PrimaryButton>
            </SetupCard>
          </SetupContainer>
        </Main>
      </PageWrapper>
    )
  }

  // インデックスが存在する場合のチャット画面
  return (
    <PageWrapper>
      {/* トースト通知 */}
      {toasts.map((toast) => (
        <Toast key={toast.id} $type={toast.type}>
          {toast.message}
        </Toast>
      ))}

      {/* インデックス作成中のオーバーレイ */}
      {isIndexing && indexProgress && (
        <IndexingOverlay>
          <IndexingCard>
            <IndexingTitle>インデックスを作成中...</IndexingTitle>
            <LoadingDots>
              <span />
              <span />
              <span />
            </LoadingDots>
            <IndexingProgress>
              <ProgressBar>
                <ProgressFill
                  $progress={
                    indexProgress.total > 0
                      ? (indexProgress.current / indexProgress.total) * 100
                      : 0
                  }
                />
              </ProgressBar>
              <ProgressText>
                {indexProgress.currentPageTitle
                  ? `${indexProgress.current} / ${indexProgress.total} ページ - ${indexProgress.currentPageTitle}`
                  : 'ページを取得しています...'}
              </ProgressText>
            </IndexingProgress>
          </IndexingCard>
        </IndexingOverlay>
      )}

      <Header>
        <Title>
          <GradientText>Local RAG</GradientText> for Notion
        </Title>
        <HeaderRight>
          <IndexInfo>
            <IndexStats>
              {indexStatus.documentCount} チャンク / {indexStatus.indexedPageIds.length} ページ
            </IndexStats>
            <SmallButton onClick={handleForceReindex} disabled={isIndexing}>
              {isIndexing ? '更新中...' : '強制更新'}
            </SmallButton>
          </IndexInfo>
          <StatusBadge $ready={true}>Ready</StatusBadge>
        </HeaderRight>
      </Header>

      <Main>
        <ChatContainer ref={chatContainerRef}>
          {messages.length === 0 ? (
            <EmptyState>
              <EmptyIcon>💬</EmptyIcon>
              <div>
                <p>Notionのドキュメントについて質問してください</p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  {indexStatus.documentCount} チャンクがインデックス済みです
                </p>
              </div>
            </EmptyState>
          ) : (
            messages.map((msg, i) => (
              <MessageGroup key={i} $isUser={msg.role === 'user'}>
                <MessageBubble $isUser={msg.role === 'user'}>{msg.content}</MessageBubble>
                {msg.sources && msg.sources.length > 0 && (
                  <SourcesContainer>
                    {msg.sources.map((source, j) => (
                      <SourceCard key={j}>
                        <summary>
                          📄 {source.pageTitle}
                          <ScoreBar $score={source.score}>
                            <div className="bar-container">
                              <div className="bar-fill" />
                            </div>
                            <span className="score-text">{(source.score * 100).toFixed(0)}%</span>
                          </ScoreBar>
                        </summary>
                        <SourceContent>{source.content}</SourceContent>
                      </SourceCard>
                    ))}
                  </SourcesContainer>
                )}
              </MessageGroup>
            ))
          )}
          {isLoading && (
            <MessageGroup $isUser={false}>
              <MessageBubble $isUser={false}>
                <LoadingDots>
                  <span />
                  <span />
                  <span />
                </LoadingDots>
              </MessageBubble>
            </MessageGroup>
          )}
        </ChatContainer>

        <InputContainer onSubmit={handleSubmit}>
          <Input
            value={input}
            onChange={(e): void => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="質問を入力... (Cmd/Ctrl+Enter で送信)"
            disabled={isLoading}
            rows={1}
          />
          {isLoading ? (
            <AbortButton type="button" onClick={handleAbort}>
              中止
            </AbortButton>
          ) : (
            <SendButton type="submit" disabled={isLoading || !input.trim()}>
              送信
            </SendButton>
          )}
        </InputContainer>
      </Main>
    </PageWrapper>
  )
}
