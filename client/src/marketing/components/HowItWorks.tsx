import { motion } from "framer-motion";
import { MessageSquare, Bot, Rocket } from "lucide-react";

import { brand } from "../lib/brand";

const steps = [
  { icon: MessageSquare, title: "Describe your topic", body: "'Customer feedback on our app.'" },
  { icon: Bot, title: "AI builds your survey", body: "Grouped by subtopic with 3–4 questions per page." },
  { icon: Rocket, title: "Edit, share, analyze", body: "Customize and launch instantly." }
];

export default function HowItWorks() {
  return (
    <section className={`${brand.sectionPad} py-12 sm:py-16`}>
      <div className={`${brand.maxw}`}>
        <h2 className="text-2xl sm:text-3xl font-semibold mb-6">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className={`${brand.card} p-5`}
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
