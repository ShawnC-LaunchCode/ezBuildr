import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "wouter";

import { brand } from "../lib/brand";

export default function Hero() {
  return (
    <section className={`${brand.sectionPad} pt-20 pb-20 sm:pt-24 sm:pb-32 ${brand.gradient} text-white overflow-hidden relative`}>
      <div className={`${brand.maxw}`}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="max-w-3xl"
        >
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium mb-6 backdrop-blur-sm">
            <span className="mr-2">✨</span>
            <span>Now with Advanced Logic Engine</span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold leading-tight tracking-tight mb-6">
            Build workflows <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-100">
              without the chaos.
            </span>
          </h1>

          <p className="mt-6 text-white/80 text-lg sm:text-xl max-w-2xl leading-relaxed">
            ezBuildr makes it simple to create powerful, logic-driven workflows and forms.
            Guided for beginners, limitless for experts.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center rounded-xl bg-white text-indigo-700 hover:bg-zinc-50 px-8 py-4 text-lg font-bold transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Start building <ArrowRight className="h-5 w-5 ml-2" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/5 hover:bg-white/10 px-8 py-4 text-lg font-medium transition backdrop-blur-sm"
            >
              Documentation
            </Link>
          </div>
        </motion.div>

        {/* Hero Abstract Graphic */}
        <div className="pointer-events-none absolute -right-20 top-20 opacity-40 mix-blend-overlay">
          <svg width="600" height="600" viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="300" cy="300" r="150" stroke="white" strokeWidth="40" strokeOpacity="0.2" />
            <circle cx="300" cy="300" r="250" stroke="white" strokeWidth="2" strokeOpacity="0.1" />
            <rect x="250" y="250" width="100" height="100" rx="20" fill="white" fillOpacity="0.1" />
          </svg>
        </div>
      </div>
    </section>
  );
}
