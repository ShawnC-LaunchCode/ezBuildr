import { motion } from "framer-motion";

import { brand } from "../lib/brand";

const quotes = [
  { quote: "Vault-Logic helps us build better surveys in minutes, not hours.", name: "Ops Lead, SaaS" },
  { quote: "Our analytics used to take days — now it's instant.", name: "Research Manager" }
];

export default function Testimonials() {
  return (
    <section className={`${brand.sectionPad} py-12 sm:py-16`}>
      <div className={`${brand.maxw}`}>
        <h2 className="text-2xl sm:text-3xl font-semibold mb-6">What teams say</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {quotes.map((q, i) => (
            <motion.blockquote
              key={i}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={`${brand.card} p-5`}
            >
              <p className="text-gray-800">{q.quote}</p>
              <footer className="mt-3 text-sm text-gray-500">— {q.name}</footer>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
