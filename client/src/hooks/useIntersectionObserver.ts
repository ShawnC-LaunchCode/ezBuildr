/**
 * Intersection Observer hook for infinite scroll
 * Triggers callback when target element comes into view
 */

import { useEffect } from "react";

interface UseIntersectionObserverOptions {
  onIntersect: () => void;
  enabled?: boolean;
  root?: Element | null;
  rootMargin?: string;
  threshold?: number;
}

export function useIntersectionObserver(
  targetRef: React.RefObject<Element>,
  options: UseIntersectionObserverOptions
) {
  const { onIntersect, enabled = true, root = null, rootMargin = "0px", threshold = 1.0 } = options;

  useEffect(() => {
    if (!enabled || !targetRef.current) {return;}

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          onIntersect();
        }
      },
      {
        root,
        rootMargin,
        threshold,
      }
    );

    observer.observe(targetRef.current);

    return () => {
      observer.disconnect();
    };
  }, [enabled, targetRef, onIntersect, root, rootMargin, threshold]);
}
