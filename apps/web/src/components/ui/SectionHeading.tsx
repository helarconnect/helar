import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  align?: 'center' | 'left'
  body: string
  eyebrow: string
  title: string
}

export function SectionHeading({ align = 'left', body, eyebrow, title }: SectionHeadingProps) {
  return (
    <div className={cn('space-y-4', align === 'center' && 'mx-auto max-w-3xl text-center')}>
      <p className="eyebrow">{eyebrow}</p>
      <div className="space-y-4">
        <div className={cn('gold-divider', align === 'center' && 'mx-auto')} />
        <h2 className="section-title md:text-[2.25rem]">{title}</h2>
        <p className="body-copy max-w-2xl">{body}</p>
      </div>
    </div>
  )
}
