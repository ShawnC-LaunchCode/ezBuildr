import { motion } from "framer-motion";
import { ArrowRight, BookOpen } from "lucide-react";
import { Link } from "wouter";

import { brand } from "../lib/brand";

export default function FinalCTA() {
  return (
    <section className={`${brand.sectionPad} py-14 sm:py-16 ${brand.gradient} text-white`}>
      <div className={`${brand.maxw} text-center`}>
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="text-3xl sm:text-4xl font-semibold"
        >
          Ready to build better workflows?
        </motion.h2>
        <p className="mt-2 text-white/90">Start for free. No credit card required.</p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/workflows/new"
            className="inline-flex items-center justify-center rounded-xl bg-white text-indigo-700 hover:bg-zinc-50 px-6 py-3 font-bold transition shadow-lg"
          >
            Start Building <ArrowRight className="h-5 w-5 ml-2" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-xl border border-white/40 hover:bg-white/10 px-6 py-3 font-medium transition"
          >
            <BookOpen className="h-5 w-5 mr-2" /> Documentation
          </Link>
        </div>
      </div>
    </section>
  );
}
