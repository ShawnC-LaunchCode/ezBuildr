import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { getYesNoInsight, getSentimentEmoji } from '@/lib/analyticsUtils';
import { chartColors } from '@/styles/chartTheme';

import type { YesNoAggregation } from '@shared/schema';


interface YesNoChartProps {
  data: YesNoAggregation;
}

export function YesNoChart({ data }: YesNoChartProps) {
  const chartData = [
    { name: 'Yes', value: data.yes },
    { name: 'No', value: data.no }
  ];

  const total = data.yes + data.no;
  const yesPercent = total > 0 ? Math.round((data.yes / total) * 100) : 0;
  const colors = {
    Yes: chartColors.yesNo.yes,
    No: chartColors.yesNo.no
  };

  const insight = getYesNoInsight(data);
  const emoji = getSentimentEmoji(yesPercent);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full"
    >
      <div className="w-full h-[220px] sm:h-[260px] md:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
            <XAxis
              dataKey="name"
              className="text-sm"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              className="text-sm"
              tick={{ fontSize: 12 }}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  const data = payload[0];
                  const percentage = total > 0 ? ((data.value as number / total) * 100).toFixed(1) : 0;
                  return (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-white border border-gray-200 rounded-lg shadow-lg p-3"
                    >
                      <p className="font-medium text-gray-900">{data.name}</p>
                      <p className="text-sm text-gray-600">
                        Count: <span className="font-semibold">{data.value}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Percentage: <span className="font-semibold">{percentage}%</span>
                      </p>
                    </motion.div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={800}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[entry.name as keyof typeof colors]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Insight Text */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="mt-4 pt-3 border-t border-gray-100 text-center"
      >
        <p className="text-sm font-medium text-gray-700 flex items-center justify-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span>{insight}</span>
        </p>
      </motion.div>
    </motion.div>
  );
}
