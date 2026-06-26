/**
 * App — application root (Spec 2 §3.2).
 *
 * Mounts the three-column AppShell, which owns the Dockview workspace and the
 * left/right sidebars. TooltipProvider wraps the tree so ActivityBar / tab
 * tooltips render without per-consumer providers.
 *
 * This replaces the Spec 1 design-system verification scaffold once Spec 2
 * layout components exist; the design-system is still exercised through the
 * real panels (theme tokens, shadcn components, i18n) rather than a demo page.
 */
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/layouts/AppShell'

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell />
    </TooltipProvider>
  )
}
