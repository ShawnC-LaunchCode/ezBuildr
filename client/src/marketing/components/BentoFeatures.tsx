import { motion } from "framer-motion";
import { Braces, Database, Eye, GitBranch, Plug, Sparkles, Users } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

interface TileProps {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}

function Tile({ icon, eyebrow, title, body, className = "", children }: TileProps) {

  const Icon = icon;
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`group rounded-3xl border border-[var(--lp2-line)] bg-[var(--lp2-surface)]/50 p-7 sm:p-8 flex flex-col hover:border-[var(--lp2-lime)]/40 transition-colors ${className}`}
    >
      <div className="flex items-center gap-3 mb-5">
        <span className="w-9 h-9 rounded-xl border border-[var(--lp2-line)] bg-[var(--lp2-bg)] flex items-center justify-center">
          <Icon className="w-[18px] h-[18px] text-[var(--lp2-lime)]" />
        </span>
        <span className="lp2-mono text-[10px] uppercase tracking-[0.25em] text-[var(--lp2-dim)]">
          {eyebrow}
        </span>
      </div>
      <h3 className="text-xl sm:text-2xl font-semibold tracking-tight mb-3">{title}</h3>
      <p className="text-[var(--lp2-dim)] leading-relaxed text-[15px]">{body}</p>
      {children}
    </motion.div>
  );
}

/** Decorative import-pipeline chips for the big AI tile. */
function ImportPreview() {
  const chips = [
    { label: "intake-packet.pdf", lime: false },
    { label: "42 fields mapped", lime: true },
    { label: "9 rules detected", lime: true },
    { label: "signature block", lime: false },
    { label: "draft ready · ~90%", lime: true },
  ];
  return (
    <div className="mt-auto pt-8 flex flex-wrap gap-2" aria-hidden="true">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={`lp2-mono text-xs px-3 py-1.5 rounded-full border ${
            chip.lime
              ? "border-[var(--lp2-lime)]/50 text-[var(--lp2-lime)] bg-[rgba(215,254,84,0.06)]"
              : "border-[var(--lp2-line)] text-[var(--lp2-dim)]"
          }`}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

export default function BentoFeatures() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
        >
          <motion.p
            variants={fadeUp}
            className="lp2-mono text-xs uppercase tracking-[0.3em] text-[var(--lp2-lime)] mb-5"
          >
            {"// the toolkit"}
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="text-4xl sm:text-5xl font-bold tracking-tight max-w-2xl mb-14"
          >
            Everything between a document and a decision.
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Tile
              icon={Sparkles}
              eyebrow="ai import"
              title="Start from the document you already have"
              body="Paste a link or upload the form — blank or previously filled out. AI maps every field to a step, detects sections and required rules, and drafts about 90% of the workflow before you touch the canvas."
              className="md:col-span-4 min-h-[280px]"
            >
              <ImportPreview />
            </Tile>
            <Tile
              icon={GitBranch}
              eyebrow="visual builder"
              title="A canvas for the last 10%"
              body="Refine the draft the way you'd whiteboard it — sections, steps, and two-tier visibility rules that keep the flow legible."
              className="md:col-span-2"
            />
            <Tile
              icon={Braces}
              eyebrow="escape hatch"
              title="Real code, when you want it"
              body="Drop into sandboxed JavaScript or Python inside any flow. 40+ helpers, full run context, zero infrastructure."
              className="md:col-span-2"
            />
            <Tile
              icon={Database}
              eyebrow="datavault"
              title="A data platform, built in"
              body="Tables, databases, and lookups live next to your workflows — no external spreadsheet glue."
              className="md:col-span-2"
            />
            <Tile
              icon={Eye}
              eyebrow="logic engine"
              title="Conditions that stay legible"
              body="show / hide / require / skip — composed from operators anyone on the team can read, not regex soup."
              className="md:col-span-2"
            />
            <Tile
              icon={Users}
              eyebrow="collaboration"
              title="Projects, roles, portals"
              body="Organize by project, control access by role, and hand clients a branded portal instead of a login wall."
              className="md:col-span-3"
            />
            <Tile
              icon={Plug}
              eyebrow="integrations"
              title="API-first to the bone"
              body="Webhooks, secrets vault, e-signature, and connections with AES-256 encrypted credentials. Wire it to anything."
              className="md:col-span-3"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
