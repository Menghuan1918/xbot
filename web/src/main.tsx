import { createRoot } from 'react-dom/client'
import './index.css'
import '@/i18n' // initialize i18next (side-effect import)
import App from '@/App'
import { ThemeProvider } from '@/providers/theme'
import { I18nProvider } from '@/providers/i18n'
import { WSProvider } from '@/providers/WSProvider'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <I18nProvider>
      <WSProvider>
        <App />
      </WSProvider>
    </I18nProvider>
  </ThemeProvider>,
)
