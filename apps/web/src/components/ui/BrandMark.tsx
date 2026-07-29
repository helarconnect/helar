import { Scale } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

type BrandMarkProps = {
  className?: string
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <Link className={cn('inline-flex items-center gap-3 text-sm text-current', className)} to="/">
      <span className="flex h-11 w-11 items-center justify-center border border-white/20 bg-white/5">
        <Scale className="h-5 w-5 text-[color:var(--color-accent)]" />
      </span>
      <span className="font-heading text-[1.8rem] leading-none text-current">Helar</span>
    </Link>
  )
}
