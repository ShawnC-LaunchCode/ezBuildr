import { motion } from "framer-motion";

import { brand } from "@/marketing/lib/brand";

const CONTENT = {
  title: "Understand your results — instantly.",
  description: "ezBuildr's AI reads every response and highlights key insights, sentiment, and trends — so you can act faster.",
  features: [
    "AI summaries across questions",
    "Drop-off and completion insights",
    "Trends over time by topic",
  ],
  cardTitle: "AI Insight",
  cardText: (
    <>
      "Employees report <span className="font-semibold">73% higher satisfaction</span> post-policy change; top themes: speed, reliability, UI simplicity."
    </>
  ),
};

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
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3">{CONTENT.title}</h2>
          <p className="text-gray-600">
            {CONTENT.description}
          </p>
          <ul className="mt-4 text-sm text-gray-700 list-disc pl-5 space-y-1">
            {CONTENT.features.map((feature, i) => (
              <li key={i}>{feature}</li>
            ))}
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
            <div className="font-medium mb-2">{CONTENT.cardTitle}</div>
            <div className="text-sm text-gray-700">
              {CONTENT.cardText}
            </div>
            <div
              className="mt-4 h-32 rounded-xl bg-gradient-to-r from-indigo-100 to-fuchsia-100"
              aria-hidden="true"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
