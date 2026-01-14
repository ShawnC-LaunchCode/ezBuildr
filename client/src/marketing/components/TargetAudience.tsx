import { motion } from "framer-motion";
import { Scale, Briefcase, Settings } from "lucide-react";

import { brand } from "../lib/brand";

const audiences = [
    {
        icon: Scale,
        title: "Legal Aid & Non-Profits",
        description: "Scale your services without scaling headcount. Create guided intakes that generate documents automatically."
    },
    {
        icon: Briefcase,
        title: "Law Firms",
        description: "Standardize client intake and automate routine drafting. Focus on high-value work, not data entry."
    },
    {
        icon: Settings,
        title: "Operations Teams",
        description: "Build robust internal tools and approval workflows. Replace messy spreadsheets with structured data apps."
    }
];

export default function TargetAudience() {
    return (
        <section className={`${brand.sectionPad} py-16 sm:py-24 bg-slate-50`}>
            <div className={`${brand.maxw}`}>
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built for Serious Work</h2>
                    <p className="text-lg text-gray-600">
                        Trusted by organizations that need precision, not just pretty forms.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {audiences.map((item, index) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition border border-gray-100"
                        >
                            <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mb-4 text-indigo-700">
                                <item.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                            <p className="text-gray-600 leading-relaxed">
                                {item.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
