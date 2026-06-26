/**
 * SessionList — the scrollable session list body (Spec 3 §3.2 / §3.6 / §3.7).
 *
 * Behavior:
 *   - No search query → render category groups (SessionGroup × N).
 *   - Search query → flat sorted result list, ignoring groups.
 *   - Empty sessions / no search match → SessionEmptyState.
 *   - Each SessionItem owns its own context menu; rename & delete open
 *     dialogs managed here so a single dialog instance serves every row.
 */
import { useMemo, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/providers/i18n'
import type { SessionCategory, SessionInfo } from '@/types/shared'
import { SessionGroup } from './SessionGroup'
import { SessionItem } from './SessionItem'
import { SessionEmptyState } from './SessionEmptyState'
import { sortSessions } from '@/lib/session-grouping'

interface SessionListProps {
  sessions: SessionInfo[]
  groups: { key: string; sessions: SessionInfo[] }[]
  sortedSessions: SessionInfo[]
  category: SessionCategory
  starredIds: string[]
  activeSessionId: string | null
  search: string
  onSelect: (id: string, channel: string) => void
  onToggleStar: (id: string) => void
  onRename: (id: string, label: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

type DialogState = { id: string; label: string } | null

export function SessionList({
  sessions,
  groups,
  sortedSessions,
  category,
  starredIds,
  activeSessionId,
  search,
  onSelect,
  onToggleStar,
  onRename,
  onDelete,
}: SessionListProps) {
  const { t } = useI18n()
  const [rename, setRename] = useState<DialogState>(null)
  const [del, setDelete] = useState<DialogState>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [busy, setBusy] = useState(false)

  // Search: flat, sorted, matches label OR preview.
  const searchResults = useMemo(() => {
    if (!search.trim()) return sortedSessions
    const q = search.trim().toLowerCase()
    return sortSessions(
      sessions.filter(
        (s) => s.label.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q),
      ),
      starredIds,
    )
  }, [search, sortedSessions, sessions, starredIds])

  const searching = !!search.trim()
  const emptyList = sessions.length === 0
  const showEmpty = searching ? searchResults.length === 0 : emptyList

  const openRename = (s: SessionInfo) => {
    setRename({ id: s.chatID, label: s.label || s.chatID })
    setRenameDraft(s.label)
  }
  const openDelete = (s: SessionInfo) => setDelete({ id: s.chatID, label: s.label || s.chatID })

  const selectChannel = (s: SessionInfo) => onSelect(s.chatID, s.channel)

  const submitRename = async () => {
    if (!rename) return
    const label = renameDraft.trim()
    if (!label) return
    setBusy(true)
    const ok = await onRename(rename.id, label)
    setBusy(false)
    if (ok) setRename(null)
  }

  const submitDelete = async () => {
    if (!del) return
    setBusy(true)
    await onDelete(del.id)
    setBusy(false)
    setDelete(null)
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        {showEmpty ? (
          <SessionEmptyState emptyList={emptyList} />
        ) : searching ? (
          <div className="flex flex-col gap-0.5 p-1">
            {searchResults.map((s) => (
              <SessionItem
                key={s.chatID}
                session={s}
                starred={starredIds.includes(s.chatID)}
                active={activeSessionId === s.chatID}
                onSelect={() => selectChannel(s)}
                onToggleStar={onToggleStar}
                onRename={openRename}
                onDelete={openDelete}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-1">
            {groups.map((g) => (
              <SessionGroup
                key={g.key}
                groupKey={g.key}
                category={category}
                sessions={g.sessions}
                starredIds={starredIds}
                activeSessionId={activeSessionId}
                onSelect={onSelect}
                onToggleStar={onToggleStar}
                onRename={openRename}
                onDelete={openDelete}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Rename dialog */}
      <Dialog open={rename !== null} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('common.rename')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitRename()
            }}
            aria-label={t('session.nameLabel')}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRename(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitRename()} disabled={busy || !renameDraft.trim()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={del !== null} onOpenChange={(o) => !o && setDelete(null)}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('session.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('session.deleteConfirm', { name: del?.label ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void submitDelete()
              }}
              disabled={busy}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
