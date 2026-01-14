import { motion } from "framer-motion";
import { Hammer, BarChart3, GitBranch, Users, HardDriveDownload } from "lucide-react";

import { brand } from "../lib/brand";

const cards = [
  { icon: Hammer, title: "Visual Workflow Builder", tag: "Drag & Drop", body: "Build complex forms and workflows without writing code." },
  { icon: BarChart3, title: "Analytics & Insights", tag: "See what matters", body: "Visualize completion rates and drop-offs instantly." },
  { icon: GitBranch, title: "Advanced Logic", tag: "Power Users", body: "Create dynamic paths with conditions and nested loops." },
  { icon: Users, title: "Collaboration & Sharing", tag: "Work together", body: "Invite teammates, manage permissions, and share securely." },
  { icon: HardDriveDownload, title: "Data You Own", tag: "Export any time", body: "Full CSV/PDF exports and API access to your data." }
];

export default function FeatureGrid() {
  return (
    <section className={`${brand.sectionPad} py-12 sm:py-16 bg-white`}>
      <div className={`${brand.maxw}`}>
        <h2 className="text-3xl sm:text-4xl font-bold mb-10 text-center">Everything you need to build</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map(({ icon: Icon, title, tag, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={`${brand.card} p-6 hover:shadow-lg transition-all border border-gray-100`}
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 mb-4">
                <Icon className="h-6 w-6" />
              </div>
              <div className="font-bold text-lg mb-1">{title}</div>
              <div className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-xs font-semibold text-indigo-700 mb-2">{tag}</div>
              <div className="text-gray-600 leading-relaxed">{body}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
