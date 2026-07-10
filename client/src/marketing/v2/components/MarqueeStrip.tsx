const CAPABILITIES = [
  "ai document import",
  "conditional logic",
  "js blocks",
  "python sandbox",
  "datavault",
  "e-signature",
  "lifecycle hooks",
  "step aliases",
  "computed fields",
  "client portal",
  "api-first",
];

export default function MarqueeStrip() {
  return (
    <div
      className="border-y border-[var(--lp2-line)] py-5 overflow-hidden select-none"
      aria-hidden="true"
    >
      <div className="lp2-marquee-track flex w-max gap-0 whitespace-nowrap">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center">
            {CAPABILITIES.map((cap) => (
              <span
                key={`${copy}-${cap}`}
                className="lp2-mono text-sm uppercase tracking-[0.3em] text-[var(--lp2-dim)] flex items-center"
              >
                <span className="px-6">{cap}</span>
                <span className="text-[var(--lp2-lime)]">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
