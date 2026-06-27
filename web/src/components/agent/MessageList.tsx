/**
 * MessageList — virtualized chat message list (Spec 4 §3.4).
 *
 * Uses @tanstack/react-virtual with dynamic measurement so 100+ messages scroll
 * smoothly. The committed list comes from useChatMessages; a single live
 * streaming message (from useProgressStream) is appended as the last row when
 * present, so streamed text renders inline without touching committed state.
 *
 * Performance tactics (mirroring opencode session-ui, adapted to React):
 *   - stable item keys (message id) so the virtualizer reuses DOM across renders
 *   - measureElement for dynamic heights; estimateSize is a cheap fallback
 *   - React.memo'd MessageItem keeps mounted rows from re-rendering on scroll
 *   - the streaming row is the only one receiving liveProgress; others get null
 *   - auto-scroll to bottom while following; stops if the user scrolls up
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { MessageItem } from './MessageItem'
import { useI18n } from '@/providers/i18n'
import type { ChatMessage, LiveProgress } from '@/types/agent'

interface MessageListProps {
  messages: ChatMessage[]
  /** Transient streaming assistant message appended as the last row, or null. */
  liveMessage: ChatMessage | null
  /** Live progress snapshot handed only to the streaming row. */
  liveProgress: LiveProgress | null
  collapseLevel: 'all' | 'minimal' | 'none'
  loading: boolean
  error: string | null
}

const ESTIMATE = 120

export function MessageList({
  messages,
  liveMessage,
  liveProgress,
  collapseLevel,
  loading,
  error,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const { t } = useI18n()

  // Combined row list: committed messages + optional live streaming row.
  const rows = useMemo<ChatMessage[]>(
    () => (liveMessage ? [...messages, liveMessage] : messages),
    [messages, liveMessage],
  )
  const liveId = liveMessage?.id ?? null

  // TanStack Virtual returns imperative functions; React Compiler deliberately
  // skips memoizing this hook. Safe to disable here (the virtualizer is meant
  // to be recreated per render anyway, keyed on rows.length).
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATE,
    overscan: 8,
    getItemKey: (index) => rows[index]?.id ?? `row-${index}`,
  })

  // Track whether the viewport sits near the bottom to drive auto-scroll.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distance < 80
  }, [])

  // Auto-scroll to bottom when the list grows and we're following.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottomRef.current) return
    // Defer to next frame so newly measured rows have settled.
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [rows.length, liveProgress?.streamContent])

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overflow-x-hidden px-3 py-4"
      >
        {loading && rows.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            {t('agent.loading')}
          </div>
        )}
        {error && (
          <div className="mx-auto my-4 max-w-md rounded-md border border-status-error/40 bg-status-error/10 p-3 text-sm text-status-error">
            {error}
          </div>
        )}
        {rows.length === 0 && !loading && !error && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-muted">
            {t('agent.emptyConversation')}
          </div>
        )}

        {rows.length > 0 && (
          <div
            style={{ height: `${virtualizer.getTotalSize()}px` }}
            className="relative w-full"
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              if (!row) return null
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${item.start}px)`,
                  }}
                  className="py-1.5"
                >
                  <MessageItem
                    message={row}
                    liveProgress={row.id === liveId ? liveProgress : null}
                    collapseLevel={collapseLevel}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
