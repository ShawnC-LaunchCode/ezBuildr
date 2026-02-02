import { Star, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RatingInputProps {
    rating: number;
    setRating: (rating: number) => void;
}

export function RatingInput({ rating, setRating }: RatingInputProps) {
    const [hoveredRating, setHoveredRating] = useState<number>(0);

    return (
        <>
            <div className="space-y-2">
                <h4 className="text-sm font-medium">How would you rate this AI result?</h4>
                <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => { void setRating(value); }}
                            onMouseEnter={() => setHoveredRating(value)}
                            onMouseLeave={() => setHoveredRating(0)}
                            className="transition-transform hover:scale-110 active:scale-95"
                        >
                            <Star
                                className={cn(
                                    'w-8 h-8 transition-colors',
                                    (hoveredRating !== 0 ? hoveredRating : rating) >= value
                                        ? 'fill-yellow-400 text-yellow-400'
                                        : 'text-gray-300 dark:text-gray-600'
                                )}
                            />
                        </button>
                    ))}
                    {rating > 0 && (
                        <span className="ml-2 text-sm text-muted-foreground">
                            {rating === 1 && 'Poor'}
                            {rating === 2 && 'Fair'}
                            {rating === 3 && 'Good'}
                            {rating === 4 && 'Very Good'}
                            {rating === 5 && 'Excellent'}
                        </span>
                    )}
                </div>
            </div>

            {rating > 0 && (
                <div className="flex items-center gap-2">
                    <Button
                        variant={rating >= 4 ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs"
                        onClick={() => { void setRating(5); }}
                    >
                        <ThumbsUp className="w-3 h-3 mr-1" />
                        Helpful
                    </Button>
                    <Button
                        variant={rating <= 2 ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs"
                        onClick={() => { void setRating(1); }}
                    >
                        <ThumbsDown className="w-3 h-3 mr-1" />
                        Not Helpful
                    </Button>
                </div>
            )}
        </>
    );
}
