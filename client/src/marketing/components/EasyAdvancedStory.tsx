import { motion } from "framer-motion";
import { Check, Code2, Sparkles } from "lucide-react";

import { brand } from "@/marketing/lib/brand";

const CONTENT = {
    title: "One Platform, Two Modes",
    description: "Start simple with a guided experience, or unlock full power when you need it. Valid through the entire lifecycle.",
    easyMode: {
        title: "Easy Mode",
        features: [
            "Guided, step-by-step builder",
            "Safe guardrails prevent errors",
            "Instructional tooltips & help",
        ]
    },
    advancedMode: {
        title: "Advanced Mode",
        features: [
            "Complex logic & branching",
            "Data source integration",
            "Document generation outputs",
        ],
        codeSnippet: [
            `if (income > threshold) {`,
            `    return "eligible"`,
            `} else {`,
            `    return "ineligible"`,
            `}`
        ]
    }
};

export default function EasyAdvancedStory() {
    return (
        <section className={`${brand.sectionPad} py-16 sm:py-24 bg-white`}>
            <div className={`${brand.maxw}`}>
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl sm:text-4xl font-bold mb-4">{CONTENT.title}</h2>
                    <p className="text-lg text-gray-600">
                        {CONTENT.description}
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
                    {/* Easy Mode */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="bg-indigo-50 rounded-2xl p-8 border border-indigo-100"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-indigo-100 p-2 rounded-lg" aria-hidden="true">
                                <Sparkles className="w-6 h-6 text-indigo-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-indigo-900">{CONTENT.easyMode.title}</h3>
                        </div>

                        <ul className="space-y-4 mb-8">
                            {CONTENT.easyMode.features.map((feature, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <Check className="w-5 h-5 text-indigo-600 mt-1" aria-hidden="true" />
                                    <span className="text-gray-700 font-medium">{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <div
                            className="bg-white rounded-xl shadow-sm border border-indigo-100 p-4 opacity-90"
                            aria-hidden="true"
                        >
                            <div className="space-y-2">
                                <div className="h-4 bg-indigo-100 rounded w-3/4"></div>
                                <div className="h-4 bg-indigo-50 rounded w-1/2"></div>
                                <div className="h-8 bg-indigo-600 rounded w-full mt-4 opacity-20"></div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Advanced Mode */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="bg-slate-50 rounded-2xl p-8 border border-slate-200"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-slate-200 p-2 rounded-lg" aria-hidden="true">
                                <Code2 className="w-6 h-6 text-slate-700" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">{CONTENT.advancedMode.title}</h3>
                        </div>

                        <ul className="space-y-4 mb-8">
                            {CONTENT.advancedMode.features.map((feature, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <Check className="w-5 h-5 text-slate-700 mt-1" aria-hidden="true" />
                                    <span className="text-gray-700 font-medium">{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <div
                            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 opacity-90 font-mono text-xs text-slate-600"
                            aria-hidden="true"
                        >
                            <div className="space-y-1">
                                {CONTENT.advancedMode.codeSnippet.map((line, i) => (
                                    <p key={i} className={line.trim().startsWith("return") ? "pl-4" : ""}>
                                        {line}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
