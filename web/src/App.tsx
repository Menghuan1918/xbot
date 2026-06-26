/**
 * App — application root (Spec 3 wiring).
 *
 * The design-system demo scaffold (Spec 1) is replaced by the real AppShell.
 * Providers (theme / i18n) wrap App in main.tsx; WSProvider and the global
 * tooltip provider live here so the shell and its session panel can use the
 * WebSocket connection and shadcn tooltips.
 */
import { TooltipProvider } from '@/components/ui/tooltip'
import { WSProvider } from '@/providers/WSProvider'
import { AppShell } from '@/layouts/AppShell'

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <WSProvider>
        <AppShell />
      </WSProvider>
    </TooltipProvider>
  )
}
