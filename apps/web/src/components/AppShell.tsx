import { Moon, Scale, SunMedium } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Link, NavLink } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const navigationItems = [
  { to: "/", label: "Overview" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/sign-in", label: "Sign In" }
];

export function AppShell({ children }: PropsWithChildren) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] transition-colors">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[color:var(--color-surface)]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link className="flex items-center gap-3" to="/">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <Scale className="h-5 w-5 text-[var(--color-accent)]" />
            </div>
            <div>
              <p className="font-display text-lg tracking-[0.28em] text-[var(--color-muted)] uppercase">
                Helar
              </p>
              <p className="text-sm text-[var(--color-subtle)]">Legal Learning Operating System</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
            {navigationItems.map((item) => (
              <NavLink
                key={item.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-full px-4 py-2 text-sm transition",
                    isActive
                      ? "bg-[var(--color-accent)] text-slate-950"
                      : "text-[var(--color-subtle)] hover:bg-white/10 hover:text-[var(--color-text)]"
                  )
                }
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <button
            aria-label="Toggle theme"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--color-text)] transition hover:-translate-y-0.5 hover:bg-white/10"
            onClick={toggleTheme}
            type="button"
          >
            {isDark ? <SunMedium className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
