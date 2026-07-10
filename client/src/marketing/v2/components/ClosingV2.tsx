import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useLocation } from "wouter";

import logo from "@/assets/images/logo.png";

function QuoteSection() {
  return (
    <section className="py-24 sm:py-28 border-t border-[var(--lp2-line)]">
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <motion.figure
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="lp2-mono text-[var(--lp2-lime)] text-5xl leading-none mb-8" aria-hidden="true">
            &ldquo;
          </div>
          <blockquote className="text-3xl sm:text-4xl font-semibold tracking-tight leading-snug">
            We replaced a fourteen-tab spreadsheet, two internal tools, and a lot of
            &lsquo;just ask Dana&rsquo; with one ezBuildr workflow.
          </blockquote>
          <figcaption className="mt-8 lp2-mono text-xs uppercase tracking-[0.25em] text-[var(--lp2-dim)]">
            operations lead · fintech intake team
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}

function FinalCtaV2() {
  const [, setLocation] = useLocation();
  return (
    <section className="py-28 sm:py-36 border-t border-[var(--lp2-line)] relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute bottom-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-[0.16] blur-[110px]"
        style={{ background: "radial-gradient(closest-side, var(--lp2-lime), transparent)" }}
      />
      <div className="max-w-5xl mx-auto px-5 sm:px-8 text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.02]">
            Build the thing
            <br />
            <span className="text-[var(--lp2-lime)]">that thinks.</span>
          </h2>
          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              onClick={() => setLocation("/auth/register")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--lp2-lime)] text-[#0a0a0f] font-semibold text-lg px-9 py-4 hover:brightness-110 transition shadow-[0_0_60px_rgba(215,254,84,0.3)]"
            >
              Start building free
              <ArrowUpRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-6 lp2-mono text-xs uppercase tracking-[0.25em] text-[var(--lp2-dim)]">
            free to start · no credit card · unlimited workflows
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function FooterV2() {
  return (
    <footer className="border-t border-[var(--lp2-line)] py-12">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="ezBuildr" className="w-7 h-7 rounded-lg object-cover" />
          <span className="font-semibold tracking-tight">ezBuildr</span>
          <span className="lp2-mono text-xs text-[var(--lp2-dim)]">
            — valid logic, beautiful forms
          </span>
        </div>
        <nav className="flex items-center gap-6" aria-label="Footer">
          <a href="/" className="lp2-mono text-xs uppercase tracking-[0.2em] text-[var(--lp2-dim)] hover:text-[var(--lp2-ink)] transition-colors">
            classic site
          </a>
          <a href="/docs/url-parameters" className="lp2-mono text-xs uppercase tracking-[0.2em] text-[var(--lp2-dim)] hover:text-[var(--lp2-ink)] transition-colors">
            docs
          </a>
          <a href="/auth/login" className="lp2-mono text-xs uppercase tracking-[0.2em] text-[var(--lp2-dim)] hover:text-[var(--lp2-ink)] transition-colors">
            sign in
          </a>
        </nav>
        <p className="lp2-mono text-xs text-[var(--lp2-dim)]">
          © {new Date().getFullYear()} ezBuildr
        </p>
      </div>
    </footer>
  );
}

export { QuoteSection, FinalCtaV2, FooterV2 };
