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
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === "surveySubmitted") {
        setOpen(false);
        setSubmitted(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              aria-label="Give Feedback"
              className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white p-3 rounded-full shadow-lg hover:scale-105 transition-transform focus:outline-none focus:ring-4 focus:ring-indigo-300"
            >
              <MessageSquare className="w-6 h-6" />
            </button>
          </DialogTrigger>

          <DialogContent
            className="max-w-lg w-[90vw] h-[80vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 p-0"
          >
            <iframe
              src={
                import.meta.env.DEV
                  ? "http://localhost:5000/survey/b121d194-29b2-48d2-a2b0-7f50504bc3d8"
                  : "https://vault-logic-production.up.railway.app/survey/b121d194-29b2-48d2-a2b0-7f50504bc3d8"
              }
              className="w-full h-full"
              title="Feedback Survey"
            />
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
