import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { SubscriptionPlan } from '@/lib/api'
import { cn } from '@/lib/utils'

type PricingCardProps = {
  actionLabel: string
  featured?: boolean
  plan: SubscriptionPlan
  to: string
}

function getPlanDurationSuffix(plan: SubscriptionPlan) {
  if (plan.code === 'annual') {
    return '/1 year'
  }

  if (plan.code === 'six_months') {
    return '/6 months'
  }

  return '/month'
}

export function PricingCard({ actionLabel, featured = false, plan, to }: PricingCardProps) {
  return (
    <article
      className={cn(
        'relative flex h-full flex-col rounded-[28px] border p-8 shadow-[0_18px_48px_rgba(17,16,13,0.1)] transition duration-300 hover:-translate-y-1',
        featured
          ? 'border-[rgba(182,140,71,0.34)] bg-[linear-gradient(180deg,rgba(182,140,71,0.1),rgba(255,253,247,0.98))]'
          : 'border-[rgba(182,140,71,0.18)] bg-[rgba(255,253,247,0.92)]',
      )}
    >
      {plan.label ? (
        <span className="absolute right-6 top-6 border border-[rgba(182,140,71,0.26)] bg-[rgba(182,140,71,0.12)] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)]">
          {plan.label}
        </span>
      ) : null}
      <div className="space-y-4">
        <p className="text-sm uppercase tracking-[0.24em] text-[color:var(--color-accent)]">{plan.name}</p>
        <div className="flex items-end gap-2 text-[color:var(--color-text)]">
          <span className="font-heading text-5xl leading-none">{plan.formattedPrice}</span>
          <span className="pb-1 text-sm text-[color:var(--color-subtle)]">{getPlanDurationSuffix(plan)}</span>
        </div>
        <p className="text-sm leading-7 text-[color:var(--color-subtle)]">{plan.description}</p>
      </div>
      <ul className="mt-8 space-y-3 text-sm text-[color:var(--color-text)]">
        {plan.featureHighlights.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        className={cn(
          'mt-10 justify-between',
          featured
            ? 'button-primary'
            : 'button-secondary border-[rgba(21,28,50,0.18)] text-[color:var(--color-text)] hover:bg-[rgba(21,28,50,0.04)]'
        )}
        to={to}
      >
        {actionLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  )
}
