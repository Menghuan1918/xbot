/**
 * App — application root (Spec 2/6).
 *
 * Renders the AppShell three-column layout and the global toast surface.
 * Spec 1's design-system scaffold is superseded by the real layout; the
 * theme/i18n toggle surfaces remain available via the ActivityBar's theme
 * button and Spec 7's settings panel.
 */
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/layouts/AppShell'

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell />
      <Toaster />
    </TooltipProvider>
  )
}
