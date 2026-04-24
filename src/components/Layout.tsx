import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "./Logo";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="border-b border-outline-variant/60 bg-surface-container-lowest/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-primary-dark">
            <Logo className="w-8 h-8" />
            <span className="font-display font-bold text-lg tracking-tight">Homate</span>
            <span className="hidden sm:inline text-xs text-on-surface-variant px-2 py-0.5 rounded-full bg-secondary-soft text-secondary font-semibold">
              AI beta
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-on-surface-variant">
            <a href="https://homate.be" target="_blank" rel="noreferrer" className="hover:text-primary-dark">
              Homate.be
            </a>
            <a href="tel:+3280000000" className="hidden sm:inline hover:text-primary-dark">
              Bel ons
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-outline-variant/60 py-6 text-center text-xs text-on-surface-variant">
        © {new Date().getFullYear()} Homate · Onderdeel van Camino Group · BTW BE 0XXX.XXX.XXX
      </footer>
    </div>
  );
}
