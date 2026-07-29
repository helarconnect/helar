import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

type ProgressDonutProps = {
  label: string
  value: number
}

export function ProgressDonut({ label, value }: ProgressDonutProps) {
  const { isDark } = useTheme()

  return (
    <div
      className={cn(
        'rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]',
        isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-center gap-4">
        <div
          aria-label={`${label} ${value}%`}
          className="grid h-24 w-24 place-items-center rounded-full"
          style={{
            background: `conic-gradient(rgb(254 83 61) ${value}%, ${isDark ? 'rgba(51,65,85,0.95)' : 'rgba(226,232,240,0.95)'} ${value}% 100%)`,
          }}
        >
          <div className={cn('grid h-16 w-16 place-items-center rounded-full text-sm font-semibold', isDark ? 'bg-slate-950 text-white' : 'bg-slate-950 text-white')}>
            {value}%
          </div>
        </div>
        <div>
          <p className={cn('text-xs uppercase tracking-[0.24em]', isDark ? 'text-slate-500' : 'text-slate-400')}>{label}</p>
          <p className={cn('mt-2 font-heading text-2xl', isDark ? 'text-white' : 'text-slate-950')}>Progress at a glance</p>
          <p className={cn('mt-2 text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-600')}>
            Your course completion stays visible without adding extra noise to the page.
          </p>
        </div>
      </div>
      <div
        className={cn(
          'mt-5 flex items-center justify-between rounded-[20px] border px-4 py-3',
          isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50',
        )}
      >
        <div>
          <p className={cn('text-xs uppercase tracking-[0.2em]', isDark ? 'text-slate-500' : 'text-slate-400')}>Momentum</p>
          <p className={cn('mt-1 text-sm font-medium', isDark ? 'text-white' : 'text-slate-950')}>Consistent pace this week</p>
        </div>
        <span className="text-sm font-medium text-[color:var(--color-accent-strong)]">On track</span>
      </div>
    </div>
  )
}
