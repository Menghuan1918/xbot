/**
 * AgentPanel — the Agent workspace panel.
 *
 * Wires the message + progress + ask-user hooks for one chat and composes the
 * message list, input, and ask-user surface.
 *
 * Chat identity:
 *   - When the dockview tab carries a `sessionId`, that is the chatID (future
 *     multi-session / cross-channel tabs).
 *   - Otherwise the panel follows the shared SessionStore's activeSessionId,
 *     which is updated when the user switches sessions in the sidebar.
 *   - On first load (before any session switch), it adopts the chat_id from
 *     GET /api/history as a fallback.
 */
import { useEffect, useState } from 'react'

import { useAskUser } from '@/hooks/useAskUser'
import { useChatMessages } from '@/hooks/useChatMessages'
import { useCollapseLevel } from '@/hooks/useCollapseLevel'
import { useProgressStream } from '@/hooks/useProgressStream'

import { AskUserPanel } from '@/components/agent/AskUserPanel'
import { MessageInput } from '@/components/agent/MessageInput'
import { MessageList } from '@/components/agent/MessageList'
import { useDockviewContext } from '@/workspace/types'
import type { PanelProps } from '@/workspace/panels/types'

export function AgentPanel({ params }: PanelProps) {
  const ctx = useDockviewContext()
  const ws = ctx.ws
  const store = ctx.sessionStore
  const { level } = useCollapseLevel()

  // Resolve the chatID: explicit tab sessionId, else follow store's
  // activeSessionId (updates on session switch), with resolvedChatID as
  // initial fallback before any switch happens.
  const [chatID, setChatID] = useState<string | null>(params.sessionId ?? null)

  useEffect(() => {
    if (!chatID) return
    ws.subscribe(chatID)
  }, [ws, chatID])

  const chat = useChatMessages({ chatID, enabled: true, ws })

  // Follow activeSessionId from the shared store. When the user switches
  // sessions, activeSessionId changes → chatID updates → useChatMessages
  // reloads history for the new session.
  useEffect(() => {
    if (params.sessionId) return // explicit session wins
    const next = store.activeSessionId ?? chat.resolvedChatID ?? null
    if (next && next !== chatID) setChatID(next)
  }, [params.sessionId, store.activeSessionId, chat.resolvedChatID, chatID])

  const { progress, liveMessage, isStreaming } = useProgressStream({
    chatID,
    initialProgress: chat.initialProgress,
    onAssistantComplete: (finalText, iterations) => {
      chat.appendAssistant(finalText, iterations)
    },
    ws,
  })

  const askUser = useAskUser({ chatID, ws })

  // Busy while streaming (live or hydrated from a resumed session).
  const busy = isStreaming

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList
        messages={chat.messages}
        liveMessage={liveMessage}
        liveProgress={liveMessage ? progress : null}
        collapseLevel={level}
        loading={chat.loading}
        error={chat.error}
      />
      {askUser.prompt && (
        <AskUserPanel
          prompt={askUser.prompt}
          onRespond={askUser.respond}
          onCancel={askUser.cancel}
        />
      )}
      <MessageInput
        busy={busy}
        onSend={(content, attachments) => chat.sendMessage(content, attachments)}
        onCancel={chat.cancel}
        onUpload={chat.upload}
      />
    </div>
  )
}
