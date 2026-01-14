import { motion } from "framer-motion";
import { Check, Code2, Sparkles } from "lucide-react";

import { brand } from "../lib/brand";

export default function EasyAdvancedStory() {
    return (
        <section className={`${brand.sectionPad} py-16 sm:py-24 bg-white`}>
            <div className={`${brand.maxw}`}>
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl sm:text-4xl font-bold mb-4">One Platform, Two Modes</h2>
                    <p className="text-lg text-gray-600">
                        Start simple with a guided experience, or unlock full power when you need it.
                        Valid through the entire lifecycle.
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
                            <div className="bg-indigo-100 p-2 rounded-lg">
                                <Sparkles className="w-6 h-6 text-indigo-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-indigo-900">Easy Mode</h3>
                        </div>

                        <ul className="space-y-4 mb-8">
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-indigo-600 mt-1" />
                                <span className="text-gray-700 font-medium">Guided, step-by-step builder</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-indigo-600 mt-1" />
                                <span className="text-gray-700 font-medium">Safe guardrails prevent errors</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-indigo-600 mt-1" />
                                <span className="text-gray-700 font-medium">Instructional tooltips & help</span>
                            </li>
                        </ul>

                        <div className="bg-white rounded-xl shadow-sm border border-indigo-100 p-4 opacity-90">
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
                            <div className="bg-slate-200 p-2 rounded-lg">
                                <Code2 className="w-6 h-6 text-slate-700" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">Advanced Mode</h3>
                        </div>

                        <ul className="space-y-4 mb-8">
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-700 mt-1" />
                                <span className="text-gray-700 font-medium">Complex logic & branching</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-700 mt-1" />
                                <span className="text-gray-700 font-medium">Data source integration</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-700 mt-1" />
                                <span className="text-gray-700 font-medium">Document generation outputs</span>
                            </li>
                        </ul>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 opacity-90 font-mono text-xs text-slate-600">
                            <div className="space-y-1">
                                <p>if (income &gt; threshold) &#123;</p>
                                <p className="pl-4">return "eligible"</p>
                                <p>&#125; else &#123;</p>
                                <p className="pl-4">return "ineligible"</p>
                                <p>&#125;</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
