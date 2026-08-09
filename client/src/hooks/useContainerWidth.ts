import { useCallback, useRef, useState } from "react";

/**
 * Observes an element's own width, not the viewport's.
 *
 * The builder's outline panel is a user-resizable `ResizablePanel` sized in
 * percent, so its pixel width is independent of any media query — at its 15%
 * minSize it can sit near 110px while the window is still "desktop". Media
 * queries therefore cannot drive its layout, and its labels were clipping
 * rather than collapsing.
 *
 * Teardown lives in the ref callback (React invokes it with `null` on unmount)
 * rather than in an effect cleanup. Under StrictMode an effect's cleanup runs
 * on the simulated unmount while the ref callback does *not* re-fire — the DOM
 * node never changed — so an effect-based disconnect left the observer dead
 * for the rest of the session. The initial `getBoundingClientRect` still gave
 * a correct width on mount, which made it look like it worked: only live
 * resizing was broken.
 */
export function useContainerWidth<T extends HTMLElement>(): {
  ref: (node: T | null) => void;
  width: number;
} {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node === null) {
      return;
    }
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return { ref, width };
}
