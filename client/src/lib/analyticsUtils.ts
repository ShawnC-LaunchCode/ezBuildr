/**
 * Analytics utility functions for generating insights and summaries
 * from question aggregation data
 */

import type { YesNoAggregation, ChoiceAggregation, TextAggregation } from '@shared/schema';

/**
 * Generate insight text for Yes/No questions
 */
export function getYesNoInsight(data: YesNoAggregation): string {
  const total = data.yes + data.no;
  if (total === 0) {return 'No responses yet';}

  const yesPercent = Math.round((data.yes / total) * 100);
  const noPercent = Math.round((data.no / total) * 100);

  if (yesPercent === noPercent) {
    return 'Evenly split between Yes and No';
  }

  return yesPercent > noPercent
    ? `${yesPercent}% said "Yes"`
    : `${noPercent}% said "No"`;
}

/**
 * Generate insight text for Multiple Choice and Radio questions
 */
export function getChoiceInsight(data: ChoiceAggregation[]): string {
  if (!data || data.length === 0) {return 'No responses yet';}

  // Find the most popular option
  const topChoice = data.reduce((max, current) =>
    current.count > max.count ? current : max
  );

  // Check if there's a clear winner or if it's close
  const sortedChoices = [...data].sort((a, b) => b.count - a.count);
  const secondChoice = sortedChoices[1];

  if (!secondChoice || topChoice.count > secondChoice.count * 1.5) {
    // Clear winner
    return `Most common: ${topChoice.option} (${Math.round(topChoice.percent)}%)`;
  } else {
    // Close race
    return `Top choices: ${topChoice.option} (${Math.round(topChoice.percent)}%) and ${secondChoice.option} (${Math.round(secondChoice.percent)}%)`;
  }
}

/**
 * Generate insight text for Text questions
 */
export function getTextInsight(data: TextAggregation): string {
  if (!data.topKeywords || data.topKeywords.length === 0) {
    return 'No keywords found';
  }

  const topThree = data.topKeywords.slice(0, 3).map(k => k.word);

  if (topThree.length === 1) {
    return `Most mentioned: ${topThree[0]}`;
  } else if (topThree.length === 2) {
    return `Top keywords: ${topThree[0]}, ${topThree[1]}`;
  } else {
    return `Top keywords: ${topThree[0]}, ${topThree[1]}, ${topThree[2]}`;
  }
}

/**
 * Generate insight text based on question type and aggregation data
 */
export function getInsightText(
  questionType: string,
  aggregation: YesNoAggregation | ChoiceAggregation[] | TextAggregation
): string {
  switch (questionType) {
    case 'yes_no':
      return getYesNoInsight(aggregation as YesNoAggregation);

    case 'multiple_choice':
    case 'radio':
      return getChoiceInsight(aggregation as ChoiceAggregation[]);

    case 'short_text':
    case 'long_text':
      return getTextInsight(aggregation as TextAggregation);

    case 'date_time':
      return 'Date/time responses collected';

    case 'file_upload':
      return 'Files uploaded successfully';

    default:
      return '';
  }
}

/**
 * Calculate percentage with proper rounding
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) {return 0;}
  return Math.round((value / total) * 100);
}

/**
 * Format large numbers with K/M suffix
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Get sentiment emoji based on Yes/No ratio
 */
export function getSentimentEmoji(yesPercent: number): string {
  if (yesPercent >= 80) {return '🎉';}
  if (yesPercent >= 60) {return '👍';}
  if (yesPercent >= 40) {return '😐';}
  if (yesPercent >= 20) {return '👎';}
  return '😔';
}
