import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Send, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { Comment } from '@/hooks/collab/useComments';

interface CommentsPanelProps {
  comments: Comment[];
  currentUserId: string;
  currentUserName: string;
  nodeName?: string;
  onAddComment: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
  onClose?: () => void;
}

/**
 * Panel for displaying and adding comments on a workflow node
 */
export function CommentsPanel({
  comments,
  currentUserId,
  currentUserName,
  nodeName,
  onAddComment,
  onDeleteComment,
  onClose,
}: CommentsPanelProps) {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newComment.trim()) {return;}

    setIsSubmitting(true);
    try {
      onAddComment(newComment.trim());
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="flex-shrink-0 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            <CardTitle className="text-lg">
              {nodeName ? `Comments on "${nodeName}"` : 'Comments'}
            </CardTitle>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Comments list */}
        <ScrollArea className="flex-1">
          <div className="space-y-4 pr-4">
            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
                <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No comments yet</p>
                <p className="text-xs">Be the first to comment!</p>
              </div>
            ) : (
              comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  onDelete={onDeleteComment}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Add comment form */}
        <div className="flex-shrink-0 border-t pt-4 space-y-2">
          <Textarea
            placeholder="Add a comment... (Cmd/Ctrl+Enter to submit)"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[80px] resize-none"
            disabled={isSubmitting}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!newComment.trim() || isSubmitting}
            >
              <Send className="w-4 h-4 mr-2" />
              Comment
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface CommentItemProps {
  comment: Comment;
  currentUserId: string;
  onDelete: (commentId: string) => void;
}

/**
 * Single comment item
 */
function CommentItem({ comment, currentUserId, onDelete }: CommentItemProps) {
  const isOwner = comment.userId === currentUserId;
  const initials = getInitials(comment.userName);

  return (
    <div className="flex gap-3 group">
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarFallback className="text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-medium text-sm">{comment.userName}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(comment.timestamp, { addSuffix: true })}
          </span>
        </div>

        <p className="text-sm whitespace-pre-wrap break-words">{comment.text}</p>

        {isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-auto py-1 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(comment.id)}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Get initials from user name
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}
