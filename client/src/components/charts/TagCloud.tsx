/**
 * TagCloud Component
 * Displays keywords as animated, variably-sized tags
 * with staggered entrance animations
 */

import { motion } from 'framer-motion';

import { chartColors } from '@/styles/chartTheme';

interface TagCloudProps {
  keywords: Array<{ word: string; count: number }>;
}

export function TagCloud({ keywords }: TagCloudProps) {
  if (!keywords || keywords.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No keywords found</p>
      </div>
    );
  }

  // Calculate font sizes based on frequency
  const maxCount = Math.max(...keywords.map(k => k.count));
  const minSize = 14;
  const maxSize = 32;

  const getFontSize = (count: number) => {
    const ratio = count / maxCount;
    return minSize + (maxSize - minSize) * ratio;
  };

  // Animation variants for staggered entrance
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 20,
      },
    },
  };

  return (
    <motion.div
      className="flex flex-wrap gap-3 justify-center items-center py-6 px-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {keywords.map((keyword, index) => {
        const fontSize = getFontSize(keyword.count);
        // Vary opacity based on frequency
        const opacity = 0.6 + (keyword.count / maxCount) * 0.4;

        return (
          <motion.span
            key={`${keyword.word}-${index}`}
            variants={itemVariants}
            className="inline-flex items-center px-3 py-1.5 rounded-lg font-medium transition-all hover:scale-110 cursor-default"
            style={{
              fontSize: `${fontSize}px`,
              backgroundColor: `${chartColors.text.primary}15`,
              color: chartColors.text.primary,
              opacity,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}
            whileHover={{
              backgroundColor: `${chartColors.text.primary}25`,
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
            }}
          >
            <span>{keyword.word}</span>
            <span
              className="ml-2 text-xs opacity-70"
              style={{ fontSize: `${Math.max(10, fontSize * 0.6)}px` }}
            >
              {keyword.count}
            </span>
          </motion.span>
        );
      })}
    </motion.div>
  );
}
