import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfetti } from "@/hooks/useConfetti";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { fire } = useConfetti();

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
        <DialogContent
          className="sm:max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8 text-center"
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-full">
              <MessageSquare className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-fuchsia-600">
              Feedback Coming Soon
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              We are preparing a new feedback survey to better capture your thoughts. Stay tuned!
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div >

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
