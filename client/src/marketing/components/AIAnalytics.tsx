import { motion } from "framer-motion";

import { brand } from "../lib/brand";

export default function AIAnalytics() {
  return (
    <section className={`${brand.sectionPad} py-12 sm:py-16`}>
      <div className={`${brand.maxw} grid md:grid-cols-2 gap-6 items-center`}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
        >
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3">Understand your results — instantly.</h2>
          <p className="text-gray-600">
            Vault-Logic's AI reads every response and highlights key insights, sentiment, and trends — so you can act faster.
          </p>
          <ul className="mt-4 text-sm text-gray-700 list-disc pl-5 space-y-1">
            <li>AI summaries across questions</li>
            <li>Drop-off and completion insights</li>
            <li>Trends over time by topic</li>
          </ul>
        </motion.div>

        {/* Visual mock card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.05 }}
        >
          <div className={`${brand.card} p-5`}>
            <div className="font-medium mb-2">AI Insight</div>
            <div className="text-sm text-gray-700">
              "Employees report <span className="font-semibold">73% higher satisfaction</span> post-policy change; top themes: speed, reliability, UI simplicity."
            </div>
            <div className="mt-4 h-32 rounded-xl bg-gradient-to-r from-indigo-100 to-fuchsia-100" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
