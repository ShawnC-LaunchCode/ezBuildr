import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useCollabClient } from '../client/src/hooks/collab/useCollabClient';
import { useComments } from '../client/src/hooks/collab/useComments';
import { PresenceAvatars } from '../client/src/components/collab/PresenceAvatars';
import { CommentsPanel } from '../client/src/components/collab/CommentsPanel';
import type { CollabUser } from '../client/src/hooks/collab/useCollabClient';
import type { Comment } from '../client/src/hooks/collab/useComments';
import * as Y from 'yjs';

// Mock WebSocket
class MockWebSocket {
  public readyState = WebSocket.OPEN;
  public url: string;
  public onopen: any = null;
  public onmessage: any = null;
  public onclose: any = null;
  public onerror: any = null;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      if (this.onopen) this.onopen({});
    }, 0);
  }

  send(data: any) {
    // Mock send
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose({});
  }
}

global.WebSocket = MockWebSocket as any;

describe('useCollabClient', () => {
  const mockOptions = {
    workflowId: 'workflow-test',
    tenantId: 'tenant-test',
    token: 'test-token',
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useCollabClient(mockOptions));

    expect(result.current.connected).toBe(false);
    expect(result.current.synced).toBe(false);
    expect(result.current.users).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it('should connect to WebSocket server', async () => {
    const { result } = renderHook(() => useCollabClient(mockOptions));

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    }, { timeout: 2000 });
  });

  it('should update nodes in Yjs document', async () => {
    const { result } = renderHook(() => useCollabClient(mockOptions));

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    act(() => {
      result.current.updateNodes([
        { id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'Node 1' } },
      ]);
    });

    // Nodes should be updated in Yjs document
    expect(mockOptions.onNodesChange).not.toHaveBeenCalled(); // Local update shouldn't trigger callback
  });

  it('should update edges in Yjs document', async () => {
    const { result } = renderHook(() => useCollabClient(mockOptions));

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    act(() => {
      result.current.updateEdges([
        { id: 'e1', source: '1', target: '2' },
      ]);
    });

    expect(mockOptions.onEdgesChange).not.toHaveBeenCalled(); // Local update shouldn't trigger callback
  });

  it('should disconnect cleanly', async () => {
    const { result } = renderHook(() => useCollabClient(mockOptions));

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    act(() => {
      result.current.disconnect();
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
    });
  });
});

describe('useComments', () => {
  let doc: Y.Doc;

  beforeEach(() => {
    doc = new Y.Doc();
  });

  it('should initialize with empty comments', () => {
    const { result } = renderHook(() => useComments({ doc, nodeId: 'node-1' }));

    expect(result.current.comments).toEqual([]);
  });

  it('should add a comment', () => {
    const { result } = renderHook(() => useComments({ doc, nodeId: 'node-1' }));

    act(() => {
      result.current.addComment('Test comment', 'user-1', 'Test User');
    });

    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].text).toBe('Test comment');
    expect(result.current.comments[0].userId).toBe('user-1');
    expect(result.current.comments[0].userName).toBe('Test User');
  });

  it('should delete a comment', () => {
    const { result } = renderHook(() => useComments({ doc, nodeId: 'node-1' }));

    act(() => {
      result.current.addComment('Test comment', 'user-1', 'Test User');
    });

    const commentId = result.current.comments[0].id;

    act(() => {
      result.current.deleteComment(commentId);
    });

    expect(result.current.comments).toHaveLength(0);
  });

  it('should get comment count for a node', () => {
    const { result } = renderHook(() => useComments({ doc, nodeId: 'node-1' }));

    act(() => {
      result.current.addComment('Comment 1', 'user-1', 'User 1');
      result.current.addComment('Comment 2', 'user-2', 'User 2');
    });

    const count = result.current.getCommentCount('node-1');
    expect(count).toBe(2);
  });
});

describe('PresenceAvatars', () => {
  const mockUsers: CollabUser[] = [
    {
      userId: 'user-1',
      displayName: 'John Doe',
      email: 'john@example.com',
      role: 'owner',
      color: '#ef4444',
    },
    {
      userId: 'user-2',
      displayName: 'Jane Smith',
      email: 'jane@example.com',
      role: 'builder',
      color: '#3b82f6',
    },
  ];

  it('should render nothing when no users', () => {
    const { container } = render(<PresenceAvatars users={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render user avatars', () => {
    render(<PresenceAvatars users={mockUsers} />);

    expect(screen.getByText('2 online')).toBeInTheDocument();
  });

  it('should show hidden count when exceeds max', () => {
    const manyUsers = Array.from({ length: 10 }, (_, i) => ({
      userId: `user-${i}`,
      displayName: `User ${i}`,
      email: `user${i}@example.com`,
      role: 'builder' as const,
      color: '#3b82f6',
    }));

    render(<PresenceAvatars users={manyUsers} maxVisible={5} />);

    expect(screen.getByText('+5')).toBeInTheDocument();
  });
});

describe('CommentsPanel', () => {
  const mockComments: Comment[] = [
    {
      id: 'comment-1',
      userId: 'user-1',
      userName: 'John Doe',
      text: 'This is a test comment',
      timestamp: Date.now() - 60000, // 1 minute ago
    },
  ];

  const mockHandlers = {
    onAddComment: vi.fn(),
    onDeleteComment: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render comments', () => {
    render(
      <CommentsPanel
        comments={mockComments}
        currentUserId="user-2"
        currentUserName="Current User"
        nodeName="Test Node"
        {...mockHandlers}
      />
    );

    expect(screen.getByText('This is a test comment')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should show empty state when no comments', () => {
    render(
      <CommentsPanel
        comments={[]}
        currentUserId="user-1"
        currentUserName="User"
        {...mockHandlers}
      />
    );

    expect(screen.getByText('No comments yet')).toBeInTheDocument();
  });

  it('should add a comment', async () => {
    render(
      <CommentsPanel
        comments={[]}
        currentUserId="user-1"
        currentUserName="User"
        {...mockHandlers}
      />
    );

    const textarea = screen.getByPlaceholderText(/Add a comment/i);
    const submitButton = screen.getByRole('button', { name: /Comment/i });

    fireEvent.change(textarea, { target: { value: 'New comment' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockHandlers.onAddComment).toHaveBeenCalledWith('New comment');
    });
  });

  it('should allow comment owner to delete their comment', () => {
    render(
      <CommentsPanel
        comments={mockComments}
        currentUserId="user-1" // Same as comment author
        currentUserName="John Doe"
        {...mockHandlers}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButton);

    expect(mockHandlers.onDeleteComment).toHaveBeenCalledWith('comment-1');
  });

  it('should not show delete button for other users comments', () => {
    render(
      <CommentsPanel
        comments={mockComments}
        currentUserId="user-2" // Different from comment author
        currentUserName="Other User"
        {...mockHandlers}
      />
    );

    const deleteButton = screen.queryByRole('button', { name: /Delete/i });
    expect(deleteButton).not.toBeInTheDocument();
  });
});
