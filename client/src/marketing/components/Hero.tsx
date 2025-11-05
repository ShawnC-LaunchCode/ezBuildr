import { motion } from "framer-motion";
import { Link } from "wouter";
import { Wand2, Play } from "lucide-react";
import { brand } from "../lib/brand";

export default function Hero() {
  return (
    <section className={`${brand.sectionPad} pt-12 pb-16 sm:pt-16 sm:pb-20 ${brand.gradient} text-white overflow-hidden relative`}>
      <div className={`${brand.maxw}`}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <h1 className="text-4xl sm:text-6xl font-semibold leading-tight">
            Surveys That <span className="inline-block">Build Themselves.</span>
          </h1>
          <p className="mt-4 text-white/90 text-base sm:text-lg max-w-2xl">
            Tell Vault-Logic what you want to learn — our AI designs, organizes, and personalizes your survey in seconds.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              href="/ai-survey"
              className="inline-flex items-center justify-center rounded-xl bg-white text-indigo-700 hover:bg-white/90 px-4 py-2.5 font-medium transition"
            >
              <Wand2 className="h-5 w-5 mr-2" /> Generate with AI
            </Link>
            <Link
              href="/survey/demo"
              className="inline-flex items-center justify-center rounded-xl border border-white/40 hover:bg-white/10 px-4 py-2.5 font-medium transition"
            >
              <Play className="h-5 w-5 mr-2" /> See Example Survey
            </Link>
          </div>
        </motion.div>

        {/* Right-side ambient glow (decorative) */}
        <div className="pointer-events-none absolute right-[-120px] top-[-80px] h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute left-[-100px] bottom-[-120px] h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      </div>
    </section>
  );
}
