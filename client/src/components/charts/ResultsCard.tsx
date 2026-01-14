import { motion } from 'framer-motion';
import { FileText, BarChart3, ListChecks, MessageSquare } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import type { QuestionAggregate, YesNoAggregation, ChoiceAggregation, TextAggregation } from '@shared/schema';

import { KeywordList } from './KeywordList';
import { MultipleChoiceChart } from './MultipleChoiceChart';
import { YesNoChart } from './YesNoChart';


interface ResultsCardProps {
  question: QuestionAggregate;
  index?: number;
}

function isYesNoAggregation(data: any): data is YesNoAggregation {
  return data && typeof data === 'object' && 'yes' in data && 'no' in data;
}

function isChoiceAggregation(data: any): data is ChoiceAggregation[] {
  return Array.isArray(data) && data.length > 0 && 'option' in data[0] && 'count' in data[0];
}

function isTextAggregation(data: any): data is TextAggregation {
  return data && typeof data === 'object' && 'topKeywords' in data && 'totalWords' in data;
}

// Get icon based on question type
function getQuestionIcon(questionType: string) {
  switch (questionType) {
    case 'yes_no':
      return <BarChart3 className="w-4 h-4 text-green-600" />;
    case 'multiple_choice':
      return <ListChecks className="w-4 h-4 text-blue-600" />;
    case 'radio':
      return <ListChecks className="w-4 h-4 text-purple-600" />;
    case 'short_text':
    case 'long_text':
      return <MessageSquare className="w-4 h-4 text-indigo-600" />;
    default:
      return <FileText className="w-4 h-4 text-gray-600" />;
  }
}

export function ResultsCard({ question, index = 0 }: ResultsCardProps) {
  const renderChart = () => {
    // Handle no answers
    if (question.totalAnswers === 0) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-48 sm:h-64 text-muted-foreground"
        >
          <BarChart3 className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">No responses yet</p>
        </motion.div>
      );
    }

    // Render based on question type and aggregation structure
    if (question.questionType === 'yes_no' && isYesNoAggregation(question.aggregation)) {
      return <YesNoChart data={question.aggregation} />;
    }

    if (
      (question.questionType === 'multiple_choice' || question.questionType === 'radio') &&
      isChoiceAggregation(question.aggregation)
    ) {
      return <MultipleChoiceChart data={question.aggregation} />;
    }

    if (
      (question.questionType === 'short_text' || question.questionType === 'long_text') &&
      isTextAggregation(question.aggregation)
    ) {
      return <KeywordList data={question.aggregation} />;
    }

    // Fallback for unsupported question types
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-48 sm:h-64 text-muted-foreground"
      >
        <FileText className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm">Visualization not available for this question type</p>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: 'easeOut'
      }}
    >
      <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {getQuestionIcon(question.questionType)}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base sm:text-lg leading-tight break-words">
                {question.questionTitle}
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs sm:text-sm">
                  {question.totalAnswers} {question.totalAnswers === 1 ? 'response' : 'responses'}
                </span>
                <span className="hidden sm:inline text-gray-300">•</span>
                <span className="text-xs sm:text-sm capitalize text-gray-500">
                  {question.questionType.replace('_', ' ')}
                </span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {renderChart()}
        </CardContent>
      </Card>
    </motion.div>
  );
}
