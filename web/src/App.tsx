/**
 * App — Design System Foundation verification page (Spec 1).
 *
 * Temporary scaffold exercising every acceptance criterion of Spec 1:
 *   - shadcn components import & render (Button, Switch, Select, Tabs, ...)
 *   - theme toggle (dark/light) updates CSS variables live
 *   - accent color picker drives --accent across all accent elements
 *   - i18n language toggle (zh-CN / en) renders translated keys
 *   - Lucide icons import & render
 *   - Framer Motion animation works
 *
 * Real feature screens (sessions, workspace, ...) land in Spec 3-7 and will
 * replace this scaffold. Keep it minimal — KISS.
 */
import { motion } from 'framer-motion'
import {
  MoonIcon,
  SunIcon,
  PaletteIcon,
  LanguagesIcon,
  BotIcon,
  SettingsIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/providers/i18n'
import type { Locale, Theme } from '@/types/shared'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { useState } from 'react'

const ACCENT_PRESETS = ['#3388BB', '#22AA88', '#BB3388', '#AA8822', '#8866CC']

export default function App() {
  const { theme, setTheme, accentColor, setAccentColor } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const onToggleTheme = (checked: boolean) => {
    const next: Theme = checked ? 'dark' : 'light'
    setTheme(next)
    toast.success(`${t('settings.theme')}: ${t(`settings.${next}`)}`)
  }

  const onToggleLocale = (value: string) => {
    const next = value as Locale
    setLocale(next)
    toast.success(next === 'zh-CN' ? '已切换为中文' : 'Switched to English')
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          whileHover={{ y: -2 }}
          className="w-full max-w-lg rounded-lg border bg-card text-card-foreground shadow-lg p-6 flex flex-col gap-5"
        >
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BotIcon className="size-6 text-primary" />
              <h1 className="text-lg font-semibold">{t('designSystem.title')}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('settings.title')}
                    onClick={() => setSettingsOpen(true)}
                  >
                    <SettingsIcon className="size-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('settings.title')}</TooltipContent>
              </Tooltip>
              <Badge variant="secondary">{import.meta.env.MODE}</Badge>
            </div>
          </header>

          <Separator />

          {/* Theme */}
          <section className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {theme === 'dark' ? (
                <MoonIcon className="size-4 text-primary" />
              ) : (
                <SunIcon className="size-4 text-primary" />
              )}
              <Label htmlFor="theme-switch" className="cursor-pointer">
                {t('settings.theme')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t(`settings.${theme}`)}
              </span>
              <Switch
                id="theme-switch"
                checked={theme === 'dark'}
                onCheckedChange={onToggleTheme}
                aria-label={t('designSystem.themeToggle')}
              />
            </div>
          </section>

          {/* Accent color */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <PaletteIcon className="size-4 text-primary" />
              <Label>{t('settings.accentColor')}</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((color) => (
                <Tooltip key={color}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setAccentColor(color)}
                      aria-label={color}
                      className="size-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        backgroundColor: color,
                        borderColor: accentColor.toLowerCase() === color.toLowerCase()
                          ? 'var(--text-primary)'
                          : 'transparent',
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{color}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </section>

          <Separator />

          {/* Language */}
          <section className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <LanguagesIcon className="size-4 text-primary" />
              <Label htmlFor="locale-select">{t('settings.language')}</Label>
            </div>
            <Select value={locale} onValueChange={onToggleLocale}>
              <SelectTrigger id="locale-select" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Accent-driven button demo */}
          <section className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => toast.info(t('common.loading'))}>
              {t('common.retry')}
            </Button>
            <Button onClick={() => toast.success(t('common.confirm'))}>
              {t('common.confirm')}
            </Button>
          </section>
        </motion.div>

        <Toaster />
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </TooltipProvider>
  )
}
