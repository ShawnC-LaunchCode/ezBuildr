import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfetti } from "@/hooks/useConfetti";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { fire } = useConfetti();

  if (typeof window !== 'undefined' && window.self !== window.top) {
    return null;
  }

  useEffect(() => {
    if (submitted) {
      fire("gentle");
      const t = setTimeout(() => setSubmitted(false), 4000);
      return () => clearTimeout(t);
    }
  }, [submitted, fire]);

  // Listen for postMessage from iframe if survey sends completion event


  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <Dialog>
          <DialogTrigger asChild>
            <button className="bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 p-3 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:scale-105 active:scale-95 transition-all">
              <MessageSquare className="w-6 h-6" />
            </button>
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-2xl h-[80vh] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-0 overflow-hidden"
          >
            <DialogTitle className="sr-only">Feedback Survey</DialogTitle>
            <div className="w-full h-full relative">
              <iframe
                src="https://poll-vault-production.up.railway.app/survey/627635e4-6329-4928-afa7-3dab2d1714e4"
                className="w-full h-full border-0"
                title="Feedback Survey"
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <AnimatePresence>
        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 right-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-lg shadow-lg z-50 text-sm font-medium"
          >
            🎉 Thanks for your feedback!
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
