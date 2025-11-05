import { motion } from "framer-motion";
import { brand } from "../lib/brand";
import { Sparkles, GitBranch, ShieldCheck, BarChart3, Download, PlugZap } from "lucide-react";

const items = [
  { icon: Sparkles, title: "AI Workflow & Survey Creation", body: "Save hours — generate complete workflows and surveys instantly." },
  { icon: GitBranch, title: "Advanced Logic", body: "Dynamic branching and nested loops, no code." },
  { icon: ShieldCheck, title: "Anonymous Access", body: "Secure, flexible participation modes." },
  { icon: BarChart3, title: "Powerful Analytics", body: "Completion rates, drop-offs, trends." },
  { icon: Download, title: "Data Export", body: "CSV + PDF for reporting or AI analysis." },
  { icon: PlugZap, title: "Integrations", body: "SendGrid, Google, and more." }
];

export default function WhyVaultLogic() {
  return (
    <section className={`${brand.sectionPad} py-12 sm:py-16 bg-slate-50`}>
      <div className={`${brand.maxw}`}>
        <h2 className="text-2xl sm:text-3xl font-semibold mb-6">Why Vault-Logic</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={`${brand.card} p-5 hover:shadow-md transition`}
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 mb-3">
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-medium">{title}</div>
              <div className="text-sm text-gray-600">{body}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
