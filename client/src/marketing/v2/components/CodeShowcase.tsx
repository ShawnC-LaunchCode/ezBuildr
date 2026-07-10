import { motion } from "framer-motion";
import { Check } from "lucide-react";

const POINTS = [
  "Sandboxed JS (vm2) and Python — timeouts included, ops tickets not",
  "Full run context: every answer, alias, and prior step value",
  "One rule: call emit() once. The platform handles the rest",
  "Lifecycle hooks fire at four workflow phases, two document phases",
];

/** Hand-tinted code sample — real transform-block semantics from the product. */
function CodeCard() {
  const kw = "text-[var(--lp2-violet)]";
  const fn = "text-[var(--lp2-lime)]";
  const str = "text-[#e8b96f]";
  const cm = "text-[#5c5c68] italic";
  const dim = "text-[var(--lp2-dim)]";

  return (
    <div className="rounded-2xl border border-[var(--lp2-line)] bg-[#0d0d14] overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[var(--lp2-line)]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="lp2-mono text-xs text-[var(--lp2-dim)] ml-3">
          transform · risk-score.js
        </span>
      </div>
      <pre className="lp2-mono text-[13px] leading-[1.75] p-6 overflow-x-auto" aria-label="Example transform block code">
        <code>
          <span className={cm}>{"// runs inside the flow — no servers, no deploys"}</span>{"\n"}
          <span className={kw}>const</span> income = <span className={fn}>Number</span>(ctx.values.<span className={dim}>monthly_income</span>);{"\n"}
          <span className={kw}>const</span> debts  = <span className={fn}>Number</span>(ctx.values.<span className={dim}>total_debts</span>);{"\n"}
          {"\n"}
          <span className={kw}>const</span> dti  = debts / income;{"\n"}
          <span className={kw}>const</span> tier = dti &lt; <span className={str}>0.28</span> ? <span className={str}>&quot;prime&quot;</span>{"\n"}
          {"           "}: dti &lt; <span className={str}>0.40</span> ? <span className={str}>&quot;standard&quot;</span>{"\n"}
          {"           "}: <span className={str}>&quot;manual-review&quot;</span>;{"\n"}
          {"\n"}
          <span className={cm}>{"// every transform block calls emit() exactly once"}</span>{"\n"}
          <span className={fn}>emit</span>({"{ "}dti: dti.<span className={fn}>toFixed</span>(<span className={str}>2</span>), tier{" }"});
        </code>
      </pre>
    </div>
  );
}

export default function CodeShowcase() {
  return (
    <section id="code" className="py-24 sm:py-32 border-t border-[var(--lp2-line)]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-14 items-center">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <p className="lp2-mono text-xs uppercase tracking-[0.3em] text-[var(--lp2-lime)] mb-5">
            {"// no-code, until it isn't"}
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            The escape hatch other builders don&apos;t have.
          </h2>
          <p className="text-[var(--lp2-dim)] text-lg leading-relaxed mb-8">
            Most no-code tools hit a wall and hand you a workaround. ezBuildr hands
            you a code block. Same canvas, same variables, real language.
          </p>
          <ul className="space-y-4">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[rgba(215,254,84,0.1)] border border-[var(--lp2-lime)]/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-[var(--lp2-lime)]" aria-hidden="true" />
                </span>
                <span className="text-[15px] leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <CodeCard />
        </motion.div>
      </div>
    </section>
  );
}
