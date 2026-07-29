import { Moon, SunMedium } from 'lucide-react'

import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      aria-label="Toggle theme"
      className={cn(
        'inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition',
        isDark
          ? 'border-slate-700 bg-slate-900 text-slate-100 hover:border-amber-300/40 hover:text-amber-200'
          : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:text-[color:var(--color-accent-strong)]',
      )}
      onClick={toggleTheme}
      type="button"
    >
      {isDark ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
