import { useEffect, useRef } from 'react';
import { MousePointer2 } from 'lucide-react';
import type { CollabUser } from '@/hooks/collab/useCollabClient';

interface LiveCursorsLayerProps {
  users: CollabUser[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

/**
 * Render live cursors for remote users on the canvas
 */
export function LiveCursorsLayer({ users, viewport }: LiveCursorsLayerProps) {
  const cursorsWithPosition = users.filter((user) => user.cursor);

  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {cursorsWithPosition.map((user) => (
        <RemoteCursor key={user.userId} user={user} viewport={viewport} />
      ))}
    </div>
  );
}

interface RemoteCursorProps {
  user: CollabUser;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

/**
 * Single remote cursor component
 */
function RemoteCursor({ user, viewport }: RemoteCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!user.cursor || !cursorRef.current) return;

    const { x, y } = user.cursor;

    // Throttle cursor updates to ~30fps
    const now = Date.now();
    const lastUpdate = lastPositionRef.current;

    // Calculate screen position from canvas position
    const screenX = x * viewport.zoom + viewport.x;
    const screenY = y * viewport.zoom + viewport.y;

    // Use requestAnimationFrame for smooth updates
    requestAnimationFrame(() => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${screenX}px, ${screenY}px)`;
      }
    });

    lastPositionRef.current = { x, y };
  }, [user.cursor, viewport]);

  if (!user.cursor) return null;

  return (
    <div
      ref={cursorRef}
      className="absolute top-0 left-0 transition-transform duration-100"
      style={{ willChange: 'transform' }}
    >
      <MousePointer2
        className="w-5 h-5"
        style={{ color: user.color }}
        strokeWidth={2}
      />
      <div
        className="absolute left-6 top-0 px-2 py-1 rounded-md text-xs font-medium text-white shadow-lg whitespace-nowrap"
        style={{ backgroundColor: user.color }}
      >
        {user.displayName}
      </div>
    </div>
  );
}
