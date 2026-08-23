import { Facebook, Linkedin, Twitter } from 'lucide-react'

import { cn } from '@/lib/utils'

function TikTokIcon(props: { className?: string }) {
  return (
    <svg className={props.className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02c.08 1.53.63 3.09 1.75 4.17c1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97c-.57-.26-1.1-.59-1.62-.93c-.01 2.92.01 5.84-.02 8.75c-.08 1.4-.54 2.79-1.35 3.94c-1.31 1.92-3.58 3.17-5.91 3.21c-1.43.08-2.86-.31-4.08-1.03c-2.02-1.19-3.44-3.37-3.65-5.71c-.02-.5-.03-1-.01-1.49c.18-1.9 1.12-3.72 2.58-4.96c1.66-1.44 3.98-2.13 6.15-1.72c.02 1.48-.04 2.96-.04 4.44c-.99-.32-2.15-.23-3.02.37c-.63.41-1.11 1.04-1.36 1.75c-.21.51-.15 1.07-.14 1.61c.24 1.64 1.82 3.02 3.5 2.87c1.12-.01 2.19-.66 2.77-1.61c.19-.33.4-.67.41-1.06c.1-1.79.06-3.57.07-5.36c.01-4.03-.01-8.05.02-12.07" />
    </svg>
  )
}

type SocialLinkTone = 'dark' | 'light'

const socialLinks = [
  { href: 'https://www.facebook.com/profile.php?id=61576597417904', icon: Facebook, label: 'Facebook' },
  { href: 'https://www.tiktok.com/@helar.law', icon: TikTokIcon, label: 'TikTok' },
  { href: 'https://x.com/helarlaw', icon: Twitter, label: 'X (Twitter)' },
  { href: 'https://www.linkedin.com/company/helar-law', icon: Linkedin, label: 'LinkedIn' },
]

export function SocialLinks({
  className,
  tone,
}: {
  className?: string
  tone: SocialLinkTone
}) {
  const itemClassName =
    tone === 'dark'
      ? 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/90 transition hover:bg-white/10'
      : 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {socialLinks.map((item) => {
        const Icon = item.icon

        return (
          <a
            aria-label={item.label}
            className={itemClassName}
            href={item.href}
            key={item.label}
            rel="noreferrer"
            target="_blank"
            title={item.label}
          >
            <Icon className="h-4 w-4" />
          </a>
        )
      })}
    </div>
  )
}

