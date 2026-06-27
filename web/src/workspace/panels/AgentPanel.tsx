/**
 * AgentPanel — the Agent workspace panel (Spec 4 §3.1, §3.5).
 *
 * Wires the message + progress + ask-user hooks for one chat and composes the
 * message list, input, and ask-user surface.
 *
 * Chat identity:
 *   - When the dockview tab carries a `sessionId`, that is the chatID (future
 *     multi-session / cross-channel tabs). Otherwise the panel adopts the
 *     chat_id returned by GET /api/history (the server's currently active
 *     chat) and subscribes the WS connection to it so events route here.
 *
 * The streamed assistant text is finalized into the committed list by passing
 * useChatMessages.appendAssistant as useProgressStream's onAssistantComplete —
 * that keeps the high-frequency token stream out of the committed list state.
 */
import { useEffect, useState } from 'react'

import { useAskUser } from '@/hooks/useAskUser'
import { useChatMessages } from '@/hooks/useChatMessages'
import { useCollapseLevel } from '@/hooks/useCollapseLevel'
import { useProgressStream } from '@/hooks/useProgressStream'
import { useWSConnection } from '@/hooks/useWSConnection'

import { AskUserPanel } from '@/components/agent/AskUserPanel'
import { MessageInput } from '@/components/agent/MessageInput'
import { MessageList } from '@/components/agent/MessageList'
import type { PanelProps } from '@/workspace/panels/types'

export function AgentPanel({ params }: PanelProps) {
  const ws = useWSConnection()
  const { level } = useCollapseLevel()

  // Resolve the chatID: explicit tab sessionId, else adopt the active chat from
  // history once the first load returns it.
  const [chatID, setChatID] = useState<string | null>(params.sessionId ?? null)

  // Subscribe the WS connection to the resolved chatID so events route here.
  useEffect(() => {
    if (!chatID) return
    ws.subscribe(chatID)
  }, [ws, chatID])

  const chat = useChatMessages({ chatID, enabled: true })

  // When the tab had no explicit session, adopt the history-reported chat_id.
  useEffect(() => {
    if (params.sessionId) return // explicit session wins
    if (chatID) return
    if (chat.resolvedChatID) setChatID(chat.resolvedChatID)
  }, [params.sessionId, chatID, chat.resolvedChatID])

  const { progress, liveMessage, isStreaming } = useProgressStream({
    chatID,
    initialProgress: chat.initialProgress,
    onAssistantComplete: (finalText, iterations) => {
      chat.appendAssistant(finalText, iterations)
    },
  })

  const askUser = useAskUser({ chatID })

  // Busy while streaming (live or hydrated from a resumed session).
  const busy = isStreaming

  return (
    <div className="flex h-full flex-col">
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
