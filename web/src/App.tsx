/**
 * App — top-level shell (Spec 4 wires the real layout).
 *
 * Renders the three-column AppShell (ActivityBar + sidebars + Dockview workspace
 * hosting the Agent panel). Theme/i18n providers wrap in main.tsx; the WS
 * provider wraps the shell so AgentPanel can reach the connection.
 *
 * The Spec 1 design-system demo previously rendered here has been replaced by
 * the real workspace; it is exercised instead by the Settings/Theme controls in
 * the sidebars and the panels themselves.
 */
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/AppShell'

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell />
      <Toaster />
    </TooltipProvider>
  )
}
