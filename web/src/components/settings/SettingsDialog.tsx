/**
 * SettingsDialog — global settings panel container (Spec 7 §3.2).
 *
 * A right-side Sheet (VSCode-style) with a left category nav and a right
 * content area. Width is fixed at 480px. The Sheet is controlled (open /
 * onOpenChange) so the launcher owns visibility.
 *
 * Categories: 外观 / 折叠 / 语言 / LLM 配置. The LLM panel mounts its hook
 * lazily (only when selected) so a disconnected server doesn't fire RPCs on
 * every panel open.
 */
import { useState } from 'react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useI18n } from '@/providers/i18n'
import { cn } from '@/lib/utils'

import { SettingsAppearance } from './SettingsAppearance'
import { SettingsCollapse } from './SettingsCollapse'
import { SettingsGeneral } from './SettingsGeneral'
import { SettingsLLM } from './SettingsLLM'
import { useLLMSettings } from '@/hooks/useLLMSettings'

type Category = 'appearance' | 'collapse' | 'language' | 'llm'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * LLM panel with its own hook instance. Kept as a child (mounted only when the
 * LLM category is active) so RPCs fire on demand, not on every panel open.
 */
function SettingsLLMPanel() {
  const settings = useLLMSettings()
  return <SettingsLLM settings={settings} />
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useI18n()
  const [active, setActive] = useState<Category>('appearance')

  const nav: { key: Category; labelKey: string }[] = [
    { key: 'appearance', labelKey: 'nav.appearance' },
    { key: 'collapse', labelKey: 'nav.collapse' },
    { key: 'language', labelKey: 'nav.language' },
    { key: 'llm', labelKey: 'nav.llm' },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-[480px] max-w-full flex-col gap-0 p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>{t('settings.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('settings.title')}</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1">
          {/* Left nav */}
          <nav className="flex w-36 shrink-0 flex-col gap-0.5 border-r border-border bg-bg-secondary p-2">
            {nav.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                aria-current={active === key}
                onClick={() => setActive(key)}
                className={cn(
                  'rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active === key
                    ? 'bg-accent/15 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(`settings.${labelKey}`)}
              </button>
            ))}
          </nav>

          {/* Right content */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            {active === 'appearance' ? <SettingsAppearance /> : null}
            {active === 'collapse' ? <SettingsCollapse /> : null}
            {active === 'language' ? <SettingsGeneral /> : null}
            {active === 'llm' ? <SettingsLLMPanel /> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
