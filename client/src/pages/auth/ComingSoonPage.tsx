import { ArrowLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import { Link } from 'wouter';

import logo from '@/assets/images/logo.png';
import '@/marketing/landing.css';

const SUPPORT_EMAIL = 'support@ezBuildr.com';

export default function ComingSoonPage() {
  return (
    <main className="lp2 lp2-grain relative min-h-screen overflow-hidden antialiased">
      <div
        className="absolute inset-0 opacity-40"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(rgba(242,242,234,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(242,242,234,0.035) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'linear-gradient(to bottom, black, transparent 82%)',
        }}
      />
      <div
        className="absolute left-1/2 top-[-18rem] h-[38rem] w-[38rem] -translate-x-1/2 rounded-full opacity-20 blur-[130px]"
        aria-hidden="true"
        style={{ background: 'var(--lp2-violet)' }}
      />
      <div
        className="absolute bottom-[-16rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full opacity-10 blur-[120px]"
        aria-hidden="true"
        style={{ background: 'var(--lp2-lime)' }}
      />

      <header className="relative z-10 mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <img src={logo} alt="ezBuildr" className="h-9 w-9 rounded-xl object-cover" />
          <span className="text-lg font-semibold tracking-tight">ezBuildr</span>
        </Link>
        <Link
          href="/auth/login"
          className="lp2-mono text-xs uppercase tracking-[0.18em] text-[var(--lp2-dim)] transition-colors hover:text-[var(--lp2-ink)]"
        >
          Existing user? Sign in
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl flex-col items-center justify-center px-5 pb-24 text-center sm:px-8">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--lp2-lime)]/25 bg-[var(--lp2-lime)]/[0.07] px-4 py-2 text-[var(--lp2-lime)]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="lp2-mono text-[11px] uppercase tracking-[0.22em]">
            Expanding our private preview
          </span>
        </div>

        <h1 className="max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          We can&apos;t wait to build
          <span className="block text-[var(--lp2-lime)]">what&apos;s next with you.</span>
        </h1>

        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--lp2-dim)] sm:text-xl">
          ezBuildr is currently welcoming new teams through a private preview.
          We&apos;re excited to share the platform with everyone soon.
        </p>

        <div className="mt-10 w-full max-w-xl rounded-3xl border border-[var(--lp2-line)] bg-[var(--lp2-surface)]/75 p-7 shadow-2xl backdrop-blur-sm sm:p-9">
          <p className="text-base leading-relaxed text-[var(--lp2-ink)] sm:text-lg">
            Want to explore ezBuildr with your team? Tell us what you&apos;re hoping
            to automate and we&apos;ll take it from there.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Interested in ezBuildr')}`}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--lp2-lime)] px-7 py-3.5 font-semibold text-[#0a0a0f] shadow-[0_0_45px_rgba(215,254,84,0.2)] transition hover:brightness-110 sm:w-auto"
          >
            Contact {SUPPORT_EMAIL}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 text-sm text-[var(--lp2-dim)] transition-colors hover:text-[var(--lp2-ink)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to ezBuildr
        </Link>
      </section>
    </main>
  );
}
