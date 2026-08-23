import { Link, Outlet, useLocation } from 'react-router-dom'

import { MarketingHeader } from '@/components/layout/MarketingHeader'

export function MarketingLayout() {
  const location = useLocation()
  const isConnectPage = location.pathname === '/connect'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[color:var(--color-bg)]">
      {isConnectPage ? null : <MarketingHeader />}
      <main className="relative z-10">
        <Outlet />
      </main>
      {isConnectPage ? null : (
        <footer className="relative z-10 mt-20 bg-[color:var(--color-surface)] px-6 py-14 text-white lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <p className="eyebrow">Helar Legal Learning Platform</p>
              <h3 className="font-heading text-4xl text-white">Professional legal education for focused learners and modern practitioners.</h3>
              <p className="max-w-2xl text-sm leading-7 text-white/75">
                Study with curated law reports and subject summaries, stay current with Helar Connect, and manage subscriptions in one workspace.
              </p>
              <Link className="inline-flex font-heading text-sm text-white/85 underline underline-offset-4 transition hover:text-white" to="/contact">
                Contact Helar
              </Link>
            </div>
            <div className="space-y-2 text-sm md:text-right">
              <p className="text-white/85">163, Sathcom-K House, Okporo Road. Rumuodara. Port Harcourt</p>
              <a className="accent-coral font-heading text-xl underline underline-offset-4" href="mailto:info@helar.law">
                info@helar.law
              </a>
              <p className="text-white/75">Phone: 09030009297, 08023035628</p>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
