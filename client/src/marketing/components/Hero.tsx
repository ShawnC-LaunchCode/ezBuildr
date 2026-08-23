import { motion } from "framer-motion";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useLocation } from "wouter";

import { PUBLIC_SIGNUP_PATH } from "@/lib/publicSignup";

const STATS = [
  { value: "~90%", label: "of the build, AI-drafted" },
  { value: "15+", label: "step types" },
  { value: "2", label: "runtimes — JS & Python" },
  { value: "1", label: "canvas for all of it" },
];

/** Animated schematic of an AI import: document → AI draft → drafted workflow + your last 10%. */
function FlowDiagram() {
  return (
    <svg
      viewBox="0 0 560 300"
      className="w-full h-auto"
      role="img"
      aria-label="Diagram of an AI document import: an uploaded form is read by AI, which drafts about 90% of the workflow and leaves the last 10% for you"
    >
      {/* connectors */}
      <path d="M138 150 H222" stroke="var(--lp2-lime)" strokeWidth="1.5" fill="none" className="lp2-flow" />
      <path d="M338 150 C380 150 380 82 418 82" stroke="var(--lp2-lime)" strokeWidth="1.5" fill="none" className="lp2-flow" />
      <path d="M338 150 C380 150 380 218 418 218" stroke="rgba(242,242,234,0.25)" strokeWidth="1.5" fill="none" className="lp2-flow" />

      {/* source document node */}
      <g>
        <rect x="18" y="118" width="120" height="64" rx="14" fill="var(--lp2-surface)" stroke="var(--lp2-line)" />
        <text x="34" y="140" fill="var(--lp2-dim)" fontSize="10" className="lp2-mono" letterSpacing="2">SOURCE</text>
        <text x="34" y="158" fill="var(--lp2-ink)" fontSize="12" fontWeight="600">intake-packet.pdf</text>
        <text x="34" y="174" fill="var(--lp2-dim)" fontSize="10">link or upload</text>
      </g>

      {/* AI draft node */}
      <g>
        <rect x="222" y="112" width="116" height="76" rx="14" fill="var(--lp2-surface)" stroke="var(--lp2-lime)" strokeOpacity="0.55" />
        <circle cx="330" cy="120" r="3.5" fill="var(--lp2-lime)" className="lp2-pulse" />
        <text x="238" y="138" fill="var(--lp2-lime)" fontSize="10" className="lp2-mono" letterSpacing="2">AI DRAFT</text>
        <text x="238" y="158" fill="var(--lp2-ink)" fontSize="13" fontWeight="600">reading fields…</text>
        <text x="238" y="176" fill="var(--lp2-dim)" fontSize="11">steps · logic · rules</text>
      </g>

      {/* drafted workflow branch */}
      <g>
        <rect x="418" y="50" width="124" height="64" rx="14" fill="rgba(215,254,84,0.08)" stroke="var(--lp2-lime)" strokeOpacity="0.7" />
        <text x="434" y="76" fill="var(--lp2-lime)" fontSize="10" className="lp2-mono" letterSpacing="2">DRAFTED</text>
        <text x="434" y="96" fill="var(--lp2-ink)" fontSize="13" fontWeight="600">~90% built</text>
      </g>

      {/* your last 10% branch */}
      <g opacity="0.75">
        <rect x="418" y="186" width="124" height="64" rx="14" fill="var(--lp2-surface)" stroke="var(--lp2-line)" />
        <text x="434" y="212" fill="var(--lp2-dim)" fontSize="10" className="lp2-mono" letterSpacing="2">YOU</text>
        <text x="434" y="232" fill="var(--lp2-ink)" fontSize="13" fontWeight="600">the last 10%</text>
      </g>
    </svg>
  );
}

export default function Hero() {
  const [, setLocation] = useLocation();

  return (
    <section id="top" className="relative pt-36 pb-20 sm:pt-44 sm:pb-28 overflow-hidden">
      {/* ambient glow */}
      <div
        aria-hidden="true"
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-[0.14] blur-[120px]"
        style={{ background: "radial-gradient(closest-side, var(--lp2-violet), transparent)" }}
      />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.1fr_1fr] gap-14 lg:gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <p className="lp2-mono text-xs uppercase tracking-[0.3em] text-[var(--lp2-lime)] mb-6">
            {"// ai-drafted document automation"}
          </p>
          <h1 className="text-5xl sm:text-6xl xl:text-7xl font-bold leading-[1.02] tracking-tight">
            Drop in a document.
            <br />
            <span className="text-[var(--lp2-lime)]">Get back a workflow.</span>
          </h1>
          <p className="mt-7 text-lg sm:text-xl text-[var(--lp2-dim)] max-w-xl leading-relaxed">
            Link to a form online or upload a copy — blank or already filled out.
            ezBuildr&apos;s AI drafts about 90% of the automation: pages, steps,
            and logic. The last 10% is yours, with visual rules or real code.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => setLocation(PUBLIC_SIGNUP_PATH)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--lp2-lime)] text-[#0a0a0f] font-semibold text-base px-7 py-3.5 hover:brightness-110 transition shadow-[0_0_40px_rgba(215,254,84,0.25)]"
            >
              Start building — it&apos;s free
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <a
              href="#how"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--lp2-line)] text-[var(--lp2-ink)] font-medium text-base px-7 py-3.5 hover:border-[var(--lp2-lime)]/50 hover:bg-white/[0.03] transition"
            >
              See it think
              <ArrowDown className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
          className="rounded-3xl border border-[var(--lp2-line)] bg-[var(--lp2-surface)]/60 backdrop-blur-sm p-4 sm:p-6"
        >
          <div className="lp2-mono text-[10px] uppercase tracking-[0.25em] text-[var(--lp2-dim)] mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--lp2-lime)] lp2-pulse" />
            ai import · intake-packet.pdf
          </div>
          <FlowDiagram />
        </motion.div>
      </div>

      {/* stats strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="max-w-7xl mx-auto px-5 sm:px-8 mt-20"
      >
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--lp2-line)] border border-[var(--lp2-line)] rounded-2xl overflow-hidden">
          {STATS.map((stat) => (
            <div key={stat.label} className="bg-[var(--lp2-bg)] px-6 py-6">
              <dt className="lp2-mono text-[10px] uppercase tracking-[0.22em] text-[var(--lp2-dim)] mb-1.5">
                {stat.label}
              </dt>
              <dd className="text-3xl font-bold text-[var(--lp2-ink)]">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </motion.div>
    </section>
  );
}
