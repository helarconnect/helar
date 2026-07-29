import { ArrowUpRight } from 'lucide-react'

import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import { DashboardMetric } from '@/types/domain'

type MetricCardProps = {
  metric: DashboardMetric
}

export function MetricCard({ metric }: MetricCardProps) {
  const { isDark } = useTheme()

  return (
    <article
      className={cn(
        'rounded-[24px] border p-5 shadow-[0_24px_70px_rgba(15,23,42,0.06)]',
        isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={cn('text-xs uppercase tracking-[0.24em]', isDark ? 'text-slate-500' : 'text-slate-400')}>{metric.label}</p>
          <p className={cn('mt-3 text-3xl font-semibold', isDark ? 'text-white' : 'text-slate-950')}>{metric.value}</p>
        </div>
        <span
          className={cn(
            'rounded-2xl border p-2.5 text-[color:var(--color-accent-strong)]',
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50',
          )}
        >
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <p className={cn('mt-6 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>{metric.change}</p>
    </article>
  )
}
