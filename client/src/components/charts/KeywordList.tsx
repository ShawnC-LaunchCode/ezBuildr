import { motion } from 'framer-motion';

import { getTextInsight } from '@/lib/analyticsUtils';

import type { TextAggregation } from '@shared/schema';

import { TagCloud } from './TagCloud';

interface KeywordListProps {
  data: TextAggregation;
}

export function KeywordList({ data }: KeywordListProps) {
  const maxCount = data.topKeywords.length > 0 ? data.topKeywords[0].count : 1;
  const insight = getTextInsight(data);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
        <h4 className="text-sm font-medium text-gray-700">Top Keywords</h4>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Total words: <span className="font-semibold">{data.totalWords}</span>
        </p>
      </div>

      {data.topKeywords.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">No keywords found</p>
        </div>
      ) : (
        <>
          {/* Tag Cloud Visualization */}
          <div className="mb-6">
            <TagCloud keywords={data.topKeywords} />
          </div>

          {/* Detailed List View */}
          <div className="space-y-3 pt-4 border-t border-gray-100">
            <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Detailed Breakdown
            </h5>
            {data.topKeywords.slice(0, 10).map((keyword, index) => {
              const percentage = (keyword.count / maxCount) * 100;
              return (
                <motion.div
                  key={keyword.word}
                  className="space-y-1"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">
                      {index + 1}. {keyword.word}
                    </span>
                    <span className="text-sm text-gray-500 font-semibold">
                      {keyword.count} {keyword.count === 1 ? 'time' : 'times'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="bg-indigo-500 h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.6, delay: index * 0.05 }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* Insight Text */}
      {data.topKeywords.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-4 pt-3 border-t border-gray-100 text-center"
        >
          <p className="text-sm font-medium text-gray-700">
            {insight}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
