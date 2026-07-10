import { ArrowUpRight } from "lucide-react";
import { useLocation } from "wouter";

import logo from "@/assets/images/logo.png";

const LINKS = [
  { label: "Product", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Code", href: "#code" },
];

export default function NavBarV2() {
  const [, setLocation] = useLocation();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--lp2-line)] bg-[#0a0a0f]/75 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 flex items-center justify-between h-16">
        <a href="#top" className="flex items-center gap-3 group">
          <img src={logo} alt="ezBuildr" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-lg font-semibold tracking-tight">
            ezBuildr
            <span className="lp2-mono text-[10px] align-super ml-1.5 text-[var(--lp2-lime)]">v2</span>
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-8" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="lp2-mono text-xs uppercase tracking-[0.18em] text-[var(--lp2-dim)] hover:text-[var(--lp2-ink)] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setLocation("/auth/login")}
            className="lp2-mono text-xs uppercase tracking-[0.18em] whitespace-nowrap text-[var(--lp2-dim)] hover:text-[var(--lp2-ink)] transition-colors px-2 py-2"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setLocation("/auth/register")}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lp2-lime)] text-[#0a0a0f] text-sm font-semibold px-4 sm:px-5 py-2 hover:brightness-110 transition"
          >
            Start free
            <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
