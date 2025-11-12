import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

interface UseCommentsOptions {
  doc: Y.Doc | null;
  nodeId: string | null;
}

/**
 * Hook for managing node-level comments
 */
export function useComments({ doc, nodeId }: UseCommentsOptions) {
  const [comments, setComments] = useState<Comment[]>([]);
  const yCommentsMapRef = useRef<Y.Map<any> | null>(null);

  // Load comments when node changes
  useEffect(() => {
    if (!doc || !nodeId) {
      setComments([]);
      return;
    }

    const yComments = doc.getMap('yComments');
    yCommentsMapRef.current = yComments;

    const loadComments = () => {
      const nodeComments = yComments.get(nodeId);
      if (nodeComments && Array.isArray(nodeComments)) {
        setComments([...nodeComments]);
      } else {
        setComments([]);
      }
    };

    // Load initial comments
    loadComments();

    // Observe changes
    const observer = () => {
      loadComments();
    };

    yComments.observe(observer);

    return () => {
      yComments.unobserve(observer);
    };
  }, [doc, nodeId]);

  // Add comment
  const addComment = useCallback(
    (text: string, userId: string, userName: string) => {
      if (!doc || !nodeId) return;

      const yComments = doc.getMap('yComments');

      doc.transact(() => {
        const nodeComments = yComments.get(nodeId) || [];

        const newComment: Comment = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId,
          userName,
          text,
          timestamp: Date.now(),
        };

        yComments.set(nodeId, [...nodeComments, newComment]);
      });
    },
    [doc, nodeId]
  );

  // Delete comment
  const deleteComment = useCallback(
    (commentId: string) => {
      if (!doc || !nodeId) return;

      const yComments = doc.getMap('yComments');

      doc.transact(() => {
        const nodeComments = yComments.get(nodeId) || [];
        const filtered = nodeComments.filter((c: Comment) => c.id !== commentId);
        yComments.set(nodeId, filtered);
      });
    },
    [doc, nodeId]
  );

  // Get comment count for a specific node
  const getCommentCount = useCallback(
    (targetNodeId: string): number => {
      if (!doc) return 0;

      const yComments = doc.getMap('yComments');
      const nodeComments = yComments.get(targetNodeId);
      return nodeComments ? nodeComments.length : 0;
    },
    [doc]
  );

  return {
    comments,
    addComment,
    deleteComment,
    getCommentCount,
  };
}
