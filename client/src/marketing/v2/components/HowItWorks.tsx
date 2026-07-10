import { motion } from "framer-motion";

const STEPS = [
  {
    num: "01",
    title: "Start with your document",
    body: "Paste a link or upload the form itself — blank or previously filled out. AI reads it and drafts about 90% of your workflow: sections, steps, and logic, in minutes.",
  },
  {
    num: "02",
    title: "Finish the last 10%",
    body: "Refine conditions, computed fields, and transform blocks. Visual rules for the everyday, JS or Python for the gnarly parts. Preview runs instantly.",
  },
  {
    num: "03",
    title: "Ship & watch it run",
    body: "Publish to a link, embed it, or hand clients a branded portal. Every run is traced step-by-step, and analytics show where people stall.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="py-24 sm:py-32 border-t border-[var(--lp2-line)]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="lp2-mono text-xs uppercase tracking-[0.3em] text-[var(--lp2-lime)] mb-5"
        >
          {"// three moves"}
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="text-4xl sm:text-5xl font-bold tracking-tight max-w-2xl mb-16"
        >
          From document to running workflow before the meeting ends.
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-10 md:gap-6">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative pt-6 border-t border-[var(--lp2-line)]"
            >
              <span className="lp2-outline-num absolute -top-10 right-0 text-[96px] font-bold leading-none select-none" aria-hidden="true">
                {step.num}
              </span>
              <h3 className="text-2xl font-semibold tracking-tight mb-4">
                <span className="text-[var(--lp2-lime)] mr-3 lp2-mono text-base">{step.num}</span>
                {step.title}
              </h3>
              <p className="text-[var(--lp2-dim)] leading-relaxed text-[15px] max-w-sm">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
