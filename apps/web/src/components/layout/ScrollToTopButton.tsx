import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

type Tone = 'dark' | 'light'

export function ScrollToTopButton({ className, tone }: { className?: string; tone: Tone }) {
  const location = useLocation()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(false)
  }, [location.pathname])

  useEffect(() => {
    let animationFrameId = 0

    const handleScroll = () => {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(() => {
        setIsVisible(window.scrollY > 520)
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  if (!isVisible) {
    return null
  }

  return (
    <button
      aria-label="Back to top"
      className={cn(
        'fixed bottom-6 right-6 z-[120] inline-flex h-12 w-12 items-center justify-center rounded-full border shadow-[0_18px_55px_rgba(0,0,0,0.35)] transition hover:-translate-y-1 focus:outline-none',
        tone === 'dark'
          ? 'border-white/12 bg-white/10 text-white backdrop-blur-xl hover:bg-white/14'
          : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
        className,
      )}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      type="button"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  )
}
