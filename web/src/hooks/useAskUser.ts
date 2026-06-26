/**
 * useAskUser — subscribes to `ask_user` WS events for one chatID and exposes
 * the active prompt + a responder (Spec 4 §3.8, §3.9).
 *
 * Backend shape (channel/web/web.go Send → ask_user):
 *   { type:'ask_user', id, progress: { request_id, questions: [{question, options}] } }
 * Response: ws.send({ type:'ask_user_response', answers:{index:answer}, cancelled })
 *
 * Only one prompt is active at a time; a new prompt replaces the old one.
 */
import { useCallback, useEffect, useState } from 'react'

import { useWSConnection } from '@/hooks/useWSConnection'
import type { AskUserPrompt, AskUserQuestion } from '@/types/agent'
import type { WSMessage } from '@/types/shared'

interface UseAskUserOptions {
  chatID: string | null
}

export interface UseAskUserResult {
  prompt: AskUserPrompt | null
  /** Submit answers keyed by question index string; clears the prompt. */
  respond: (answers: Record<string, string>) => void
  /** Cancel the prompt; sends cancelled=true. */
  cancel: () => void
}

export function useAskUser({ chatID }: UseAskUserOptions): UseAskUserResult {
  const ws = useWSConnection()
  const [prompt, setPrompt] = useState<AskUserPrompt | null>(null)

  useEffect(() => {
    const off = ws.onMessage((msg: WSMessage) => {
      if (msg.chat_id && chatID && msg.chat_id !== chatID) return
      if (msg.type !== 'ask_user') return
      const p = msg.progress
      const questionsRaw = p?.questions
      const questions: AskUserQuestion[] = []
      if (Array.isArray(questionsRaw)) {
        for (const q of questionsRaw) {
          if (!q || typeof q !== 'object') continue
          const o = q as Record<string, unknown>
          const question = typeof o.question === 'string' ? o.question : ''
          if (!question) continue
          const options =
            Array.isArray(o.options)
              ? o.options.filter((x): x is string => typeof x === 'string')
              : undefined
          questions.push({ question, options })
        }
      }
      const requestId =
        (p?.request_id as string | undefined) ?? msg.id ?? String(Date.now())
      setPrompt({ requestId, questions })
    })
    return off
  }, [ws, chatID])

  const respond = useCallback(
    (answers: Record<string, string>) => {
      ws.send({ type: 'ask_user_response', answers, cancelled: false })
      setPrompt(null)
    },
    [ws],
  )

  const cancel = useCallback(() => {
    ws.send({ type: 'ask_user_response', answers: {}, cancelled: true })
    setPrompt(null)
  }, [ws])

  return { prompt, respond, cancel }
}
