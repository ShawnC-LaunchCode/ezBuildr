import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

import { getChoiceInsight } from '@/lib/analyticsUtils';
import { chartColors, getMultipleChoiceColor } from '@/styles/chartTheme';

import type { ChoiceAggregation } from '@shared/schema';


interface MultipleChoiceChartProps {
  data: ChoiceAggregation[];
}

export function MultipleChoiceChart({ data }: MultipleChoiceChartProps) {
  const chartData = data.map((item) => ({
    name: item.option,
    value: item.count,
    percent: item.percent
  }));

  const insight = getChoiceInsight(data);

  // Custom label renderer for better mobile responsiveness
  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;

    // Only show label if slice is large enough (> 5%)
    if (percent < 0.05) {return null;}

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-xs font-semibold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full"
    >
      <div className="w-full h-[280px] sm:h-[320px] md:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius="70%"
              fill="#8884d8"
              dataKey="value"
              animationDuration={800}
              animationBegin={0}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getMultipleChoiceColor(index)}
                  className="transition-opacity hover:opacity-80"
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  const data = payload[0].payload;
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
                        Percentage: <span className="font-semibold">{data.percent.toFixed(1)}%</span>
                      </p>
                    </motion.div>
                  );
                }
                return null;
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
              iconType="circle"
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Insight Text */}
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
    </motion.div>
  );
}
