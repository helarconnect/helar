import { useUiStore } from '@/store/ui-store'

export function useTheme() {
  const theme = useUiStore((state) => state.theme)
  const toggleTheme = useUiStore((state) => state.toggleTheme)

  return {
    theme,
    toggleTheme,
    isDark: theme === 'dark',
  }
}
