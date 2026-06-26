/**
 * UserMessage — renders one committed user message (Spec 4 §3.5).
 *
 * Right-aligned bubble. Content is plain text (the backend already folded any
 * uploaded-file references into the text on echo); we render it as Markdown so
 * line breaks and inline code the user may have typed render faithfully.
 */
import { memo } from 'react'

import { MarkdownRenderer } from './MarkdownRenderer'

interface UserMessageProps {
  content: string
}

export const UserMessage = memo(function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex justify-end px-1">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-text-primary">
        <MarkdownRenderer content={content || ' '} />
      </div>
    </div>
  )
})
