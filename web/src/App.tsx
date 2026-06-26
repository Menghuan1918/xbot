/**
 * App — application root.
 *
 * Renders the three-column AppShell (ActivityBar + sidebars + Dockview workspace
 * hosting the Agent panel). Theme/i18n providers wrap in main.tsx; the WS
 * provider wraps the shell so all panels can reach the WebSocket connection.
 */
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { WSProvider } from '@/providers/WSProvider'
import { AppShell } from '@/layouts/AppShell'

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <WSProvider>
        <AppShell />
      </WSProvider>
      <Toaster />
    </TooltipProvider>
  )
}
